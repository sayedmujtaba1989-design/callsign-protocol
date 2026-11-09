/**
 * Callsign Protocol - Backend Server
 * Express + Socket.IO + PostgreSQL + MongoDB + Redis
 * Ready for production deployment to Render
 *
 * Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const redis = require('redis');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// JWT_SECRET must be set; refuse to start without it (never use a built-in default)
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://callsign-protocol.vercel.app',
      process.env.CLIENT_URL
    ].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Serve the login page (public/index.html) at the root URL
app.use(express.static(path.join(__dirname, 'public')));

// Database connections
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let mongoClient;
let mongoDb;
let redisClient;

// Initialize databases
async function initializeDatabases() {
  try {
    // PostgreSQL - test connection
    await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    // MongoDB - connect
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db('callsign');
    console.log('✅ MongoDB connected');

    // Redis - connect
    redisClient = redis.createClient({
      url: process.env.REDIS_URL
    });
    redisClient.on('error', err => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    process.exit(1);
  }
}

// ===================
// REST API Endpoints
// ===================

// Health check
app.get('/health', async (req, res) => {
  try {
    await pgPool.query('SELECT 1');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      databases: {
        postgres: 'connected',
        mongodb: mongoDb ? 'connected' : 'disconnected',
        redis: redisClient ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

// Register new player
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user exists
    const existingUser = await pgPool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pgPool.query(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email',
      [username, email, passwordHash, displayName || username]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRATION || '7d'
    });

    res.status(201).json({
      success: true,
      playerId: user.id,
      username: user.username,
      token,
      expiresIn: 604800 // 7 days in seconds
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login player
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    // Get user
    const result = await pgPool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRATION || '7d'
    });

    res.json({
      success: true,
      playerId: user.id,
      username: user.username,
      token,
      expiresIn: 604800
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get player profile
app.get('/api/players/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pgPool.query(
      'SELECT id, username, email, display_name, total_playtime_minutes, account_level FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get leaderboard
app.get('/api/players/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await pgPool.query(
      `SELECT
        u.id, u.username, u.display_name,
        COALESCE(ps.wins, 0) as wins,
        COALESCE(ps.losses, 0) as losses,
        COALESCE(ps.win_rate, 0) as win_rate,
        COALESCE(ps.rank_points, 0) as rank_points,
        COALESCE(ps.rank_tier, 'Bronze') as rank_tier,
        ROW_NUMBER() OVER (ORDER BY COALESCE(ps.rank_points, 0) DESC) as rank
      FROM users u
      LEFT JOIN player_stats ps ON u.id = ps.user_id
      ORDER BY COALESCE(ps.rank_points, 0) DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      leaderboard: result.rows,
      limit,
      offset
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get match history
app.get('/api/matches/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await pgPool.query(
      `SELECT
        m.id as match_id, m.map_name, m.game_mode, m.duration,
        m.alpha_score, m.bravo_score, m.created_at,
        mp.role, mp.kills, mp.deaths, mp.assists, mp.score
      FROM matches m
      JOIN match_players mp ON m.id = mp.match_id
      WHERE mp.user_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      matches: result.rows,
      limit,
      offset
    });
  } catch (error) {
    console.error('Match history error:', error);
    res.status(500).json({ error: 'Failed to fetch match history' });
  }
});

// Get player statistics
app.get('/api/stats/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pgPool.query(
      `SELECT
        COALESCE(total_matches, 0) as total_matches,
        COALESCE(wins, 0) as wins,
        COALESCE(losses, 0) as losses,
        COALESCE(win_rate, 0) as win_rate,
        COALESCE(rank_tier, 'Bronze') as rank_tier,
        COALESCE(rank_points, 0) as rank_points
      FROM player_stats
      WHERE user_id = $1`,
      [userId]
    );

    const stats = result.rows[0] || {
      total_matches: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
      rank_tier: 'Bronze',
      rank_points: 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Create a new match
app.post('/api/matches', async (req, res) => {
  try {
    const { mapName, gameMode } = req.body;

    if (!mapName) {
      return res.status(400).json({ error: 'mapName is required' });
    }

    const result = await pgPool.query(
      `INSERT INTO matches (map_name, game_mode, started_at)
       VALUES ($1, $2, NOW())
       RETURNING id, map_name, game_mode, started_at`,
      [mapName, gameMode || '5v5']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create match error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Record a player's match result
app.post('/api/matches/:matchId/players', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const matchId = req.params.matchId;
    const { team, role, kills, deaths, assists } = req.body;

    if (!team) {
      return res.status(400).json({ error: 'team is required' });
    }

    const result = await pgPool.query(
      `INSERT INTO match_players (match_id, user_id, team, role, kills, deaths, assists)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, match_id, user_id, team, kills, deaths, assists`,
      [matchId, userId, team, role || 'Rifleman', kills || 0, deaths || 0, assists || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Record match player error:', error.message, 'Code:', error.code);
    res.status(500).json({ error: `Failed to record match result: ${error.message}` });
  }
});

// Get player stats (includes kills/deaths from all matches)
app.get('/api/players/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pgPool.query(
      `SELECT
        COALESCE(SUM(kills), 0) as total_kills,
        COALESCE(SUM(deaths), 0) as total_deaths,
        COALESCE(SUM(assists), 0) as total_assists,
        COUNT(*) as total_matches
       FROM match_players
       WHERE user_id = $1`,
      [userId]
    );

    const stats = result.rows[0] || {
      total_kills: 0,
      total_deaths: 0,
      total_assists: 0,
      total_matches: 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Player stats error:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// Get leaderboard (top players)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const result = await pgPool.query(
      `SELECT
        u.id,
        u.username,
        COALESCE(SUM(CAST(mp.kills AS INTEGER)), 0)::INTEGER as total_kills,
        COALESCE(SUM(CAST(mp.deaths AS INTEGER)), 0)::INTEGER as total_deaths,
        COALESCE(SUM(CAST(mp.assists AS INTEGER)), 0)::INTEGER as total_assists,
        COUNT(DISTINCT mp.match_id)::INTEGER as total_matches
       FROM users u
       LEFT JOIN match_players mp ON u.id = mp.user_id
       GROUP BY u.id, u.username
       ORDER BY total_kills DESC, total_matches DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Leaderboard error:', error.message);
    res.status(500).json({ error: `Failed to fetch leaderboard: ${error.message}` });
  }
});

// Get player's match history
app.get('/api/matches/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = req.query.limit || 20;

    const result = await pgPool.query(
      `SELECT
        m.id as match_id,
        m.map_name,
        m.game_mode,
        m.started_at,
        m.ended_at,
        m.duration_seconds,
        m.alpha_score,
        m.bravo_score,
        m.winner,
        mp.team,
        mp.role,
        mp.kills,
        mp.deaths,
        mp.assists,
        mp.score
       FROM matches m
       JOIN match_players mp ON m.id = mp.match_id
       WHERE mp.user_id = $1
       ORDER BY m.started_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Match history error:', error);
    res.status(500).json({ error: 'Failed to fetch match history' });
  }
});

// Get rankings (with win/loss ratio)
app.get('/api/rankings', async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const result = await pgPool.query(
      `SELECT
        u.id,
        u.username,
        COUNT(DISTINCT mp.match_id)::INTEGER as total_matches,
        COALESCE(SUM(CAST(mp.kills AS INTEGER)), 0)::INTEGER as total_kills,
        COALESCE(SUM(CAST(mp.deaths AS INTEGER)), 0)::INTEGER as total_deaths,
        CASE
          WHEN SUM(CAST(mp.deaths AS INTEGER)) > 0 THEN
            ROUND(CAST(COALESCE(SUM(CAST(mp.kills AS INTEGER)), 0) AS FLOAT) / CAST(COALESCE(SUM(CAST(mp.deaths AS INTEGER)), 1) AS FLOAT), 2)
          ELSE 0
        END as kd_ratio,
        ROUND(CAST(COALESCE(SUM(CAST(mp.kills AS INTEGER)), 0) AS FLOAT) / NULLIF(COUNT(DISTINCT mp.match_id), 0), 2)::FLOAT as avg_kills_per_match
       FROM users u
       LEFT JOIN match_players mp ON u.id = mp.user_id
       GROUP BY u.id, u.username
       HAVING COUNT(DISTINCT mp.match_id) > 0
       ORDER BY kd_ratio DESC, total_kills DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Rankings error:', error.message);
    res.status(500).json({ error: `Failed to fetch rankings: ${error.message}` });
  }
});

// ===================
// WebSocket Events (Socket.IO)
// ===================

// Store active matches and players
const activeMatches = new Map();
const connectedPlayers = new Map();
const matchmakingQueue = [];
const activeGames = new Map(); // For tactical games (TOC + Ground)

io.on('connection', (socket) => {
  console.log(`✅ Player connected: ${socket.id}`);

  // Authentication
  socket.on('auth:login', async (credentials, callback) => {
    try {
      const result = await pgPool.query(
        'SELECT id, username, password_hash FROM users WHERE username = $1',
        [credentials.username]
      );

      if (result.rows.length === 0) {
        return callback({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const passwordMatch = await bcrypt.compare(credentials.password, user.password_hash);

      if (!passwordMatch) {
        return callback({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });

      socket.userId = user.id;
      socket.username = user.username;
      connectedPlayers.set(socket.id, { userId: user.id, username: user.username });

      callback({ success: true, token, playerId: user.id, username: user.username });

      // Broadcast player joined
      io.emit('player:joined', { username: user.username, playerId: user.id });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  // Matchmaking
  socket.on('matchmaking:join', (data) => {
    if (!socket.userId) return;

    matchmakingQueue.push({
      socketId: socket.id,
      userId: socket.userId,
      username: socket.username,
      timestamp: Date.now()
    });

    socket.emit('matchmaking:waiting', {
      position: matchmakingQueue.length,
      message: 'Searching for match...'
    });

    // Check if we have 4 players for 2v2 match
    if (matchmakingQueue.length >= 4) {
      startMatch(matchmakingQueue.splice(0, 4));
    }
  });

  socket.on('matchmaking:leave', () => {
    const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
      socket.emit('matchmaking:cancelled', { message: 'Left matchmaking queue' });
    }
  });

  // Game events
  socket.on('game:playerAction', (data) => {
    const matchId = findPlayerMatchId(socket.id);
    if (matchId && activeMatches.has(matchId)) {
      io.to(matchId).emit('game:playerAction', {
        playerId: socket.userId,
        username: socket.username,
        ...data
      });
    }
  });

  socket.on('game:playerKilled', (data) => {
    const matchId = findPlayerMatchId(socket.id);
    if (matchId && activeMatches.has(matchId)) {
      io.to(matchId).emit('game:playerKilled', {
        killerId: socket.userId,
        killerName: socket.username,
        victimId: data.victimId,
        victimName: data.victimName,
        timestamp: Date.now()
      });
    }
  });

  // HARDCODED FALLBACK SCENARIOS
  const HARDCODED_SCENARIOS = {
    rescue: {
      name: '🆘 RESCUE VIP',
      objective: 'Extract trapped diplomat',
      units: [
        { id: 'u1', name: 'Alpha', x: 50, y: 50, health: 100, role: 'Assault' },
        { id: 'u2', name: 'Bravo', x: 80, y: 50, health: 100, role: 'Support' },
      ],
      enemies: [
        { id: 'e1', x: 250, y: 150, health: 50, patrol: true },
        { id: 'e2', x: 280, y: 200, health: 50, patrol: true },
      ],
      problems: [
        { time: 15, type: 'intel', text: '⚠️ INTEL: Enemy patrol spotted near VIP location!' },
        { time: 30, type: 'casualty', text: '🚑 CASUALTY: Unit Bravo taking fire - DECISION NEEDED' },
        { time: 45, type: 'reinforcements', text: '🚁 INCOMING: Enemy reinforcements 2 minutes out!' },
      ],
      decisions: {
        casualty: [
          { label: '🏥 Evacuate Bravo NOW', risk: 'low', consequence: 'Bravo escapes, mission delayed', morale: 5 },
          { label: '⏭️ Continue mission, suppress fire', risk: 'high', consequence: 'Bravo health -25%, mission continues', morale: -10 },
        ],
        reinforcements: [
          { label: '⚡ Full speed extract', risk: 'medium', consequence: 'Get out fast, VIP retrieved', morale: 10 },
          { label: '🎯 Ambush incoming convoy', risk: 'high', consequence: 'Delay reinforcements, risky', morale: 15 },
        ]
      }
    },
    defend: {
      name: '🛡️ DEFEND POSITION',
      objective: 'Hold base against enemy assault',
      units: [
        { id: 'u1', name: 'Alpha', x: 100, y: 100, health: 100, role: 'Rifleman' },
        { id: 'u2', name: 'Bravo', x: 120, y: 100, health: 100, role: 'Gunner' },
      ],
      enemies: [
        { id: 'e1', x: 300, y: 150, health: 50, assault: true },
        { id: 'e2', x: 320, y: 150, health: 50, assault: true },
        { id: 'e3', x: 340, y: 150, health: 50, assault: true },
      ],
      problems: [
        { time: 20, type: 'assault', text: '⚔️ ASSAULT: 3 enemy units advancing on position!' },
        { time: 40, type: 'ammo', text: '💣 LOW AMMO: Bravo down to last magazine - DECISION' },
        { time: 60, type: 'support', text: '✈️ SUPPORT AVAILABLE: CAS can strike but risk to units' },
      ],
      decisions: {
        ammo: [
          { label: '📦 Resupply Bravo', risk: 'high', consequence: 'Full ammo, exposed supply run', morale: 5 },
          { label: '🔄 Rotate to rear', risk: 'low', consequence: 'Bravo falls back, line weakens', morale: -5 },
        ],
        support: [
          { label: '💥 Call airstrike', risk: 'medium', consequence: 'Heavy enemy losses', morale: 20 },
          { label: '🤐 Hold fire', risk: 'high', consequence: 'Preserve ammo, brutal close combat', morale: 0 },
        ]
      }
    },
    patrol: {
      name: '🗺️ PATROL MISSION',
      objective: 'Reconnaissance and threat elimination',
      units: [
        { id: 'u1', name: 'Alpha', x: 50, y: 50, health: 100, role: 'Scout' },
        { id: 'u2', name: 'Bravo', x: 80, y: 50, health: 100, role: 'Recon' },
      ],
      enemies: [
        { id: 'e1', x: 200, y: 150, health: 50, hidden: true },
        { id: 'e2', x: 250, y: 200, health: 50, hidden: true },
      ],
      problems: [
        { time: 25, type: 'ambush', text: '💥 AMBUSH: Units in kill zone!' },
        { time: 50, type: 'intel', text: '🔍 INTEL: Large force detected 5km out' },
      ],
      decisions: {
        ambush: [
          { label: '💨 MOVE NOW (suppress & go)', risk: 'medium', consequence: 'Escape zone, take damage', morale: 5 },
          { label: '🎯 Return fire (fight)', risk: 'high', consequence: 'Brutal fight, high casualties', morale: 15 },
        ]
      }
    }
  };

  // FUNCTION: Generate AI scenarios dynamically using Claude API
  async function generateAIScenario(type) {
    try {
      // Use Claude to generate a unique scenario
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic();

      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Generate a unique tactical military scenario in JSON format. Type: ${type}

Return ONLY valid JSON (no markdown, no explanation):
{
  "name": "emoji MISSION_NAME",
  "objective": "One sentence objective",
  "units": [
    {"id": "u1", "name": "Alpha", "x": 50, "y": 50, "health": 100, "role": "RoleName"},
    {"id": "u2", "name": "Bravo", "x": 80, "y": 50, "health": 100, "role": "RoleName"}
  ],
  "enemies": [
    {"id": "e1", "x": 250, "y": 150, "health": 50}
  ],
  "problems": [
    {"time": 15, "type": "problemType", "text": "emoji Problem text"}
  ],
  "decisions": {
    "problemType": [
      {"label": "emoji Option 1", "risk": "low|medium|high", "consequence": "outcome", "morale": 5}
    ]
  }
}

Make it realistic, tactical, and with 2-3 decision points. Vary the scenarios each time.`
        }]
      });

      const content = response.content[0].text;
      // Parse JSON from response
      const scenario = JSON.parse(content);
      console.log(`🤖 AI Generated scenario: ${scenario.name}`);
      return scenario;
    } catch (error) {
      console.error('AI generation failed, using fallback:', error.message);
      return HARDCODED_SCENARIOS[type] || HARDCODED_SCENARIOS.patrol;
    }
  }

  // Tactical Game - TOC creates scenario (AI-generated or hardcoded fallback)
  socket.on('tactical:createGame', async (data) => {
    const gameId = `game_${Date.now()}`;

    // Try AI generation first, fall back to hardcoded
    let selectedScenario;
    try {
      selectedScenario = await generateAIScenario(data.scenario || 'patrol');
    } catch (err) {
      console.error('Using hardcoded scenario:', err.message);
      selectedScenario = HARDCODED_SCENARIOS[data.scenario] || HARDCODED_SCENARIOS.patrol;
    }

    const game = {
      id: gameId,
      toc: { socketId: socket.id, userId: socket.userId, username: socket.username },
      groundUnits: [],
      scenario: selectedScenario,
      state: {
        tocUnits: selectedScenario.units.map(u => ({...u})),
        enemies: selectedScenario.enemies.map(e => ({...e, revealed: false})),
        tocIntel: [],
        time: 120, // 2 minutes
        missionStatus: 'ACTIVE',
        objectives: selectedScenario.objective,
        combatActive: false,
        problemQueue: [...selectedScenario.problems],
        currentProblem: null,
        awaitingDecision: false,
        casualtiesCount: 0,
        enemiesKilled: 0,
        morale: 100
      },
      createdAt: Date.now()
    };

    activeGames.set(gameId, game);
    socket.join(gameId);

    // Send detailed mission briefing to TOC
    socket.emit('tactical:gameCreated', {
      gameId,
      role: 'TOC',
      scenario: selectedScenario.name,
      objective: selectedScenario.objective,
      initialState: game.state
    });

    // Broadcast initial state to game room
    io.to(gameId).emit('tactical:stateUpdate', {
      groundUnits: game.groundUnits,
      enemies: game.state.enemies,
      tocUnits: game.state.tocUnits,
      time: game.state.time,
      objective: game.state.objectives,
      combatActive: game.state.combatActive,
      missionStatus: game.state.missionStatus,
      morale: game.state.morale
    });

    console.log(`🎖️ TOC created: ${selectedScenario.name} (${gameId})`);

    // Start problem simulation
    game.problemSimulation = setInterval(() => {
      if (game.state.time <= 0) {
        clearInterval(game.problemSimulation);
        game.state.missionStatus = 'EXTRACT_NOW';
        io.to(gameId).emit('tactical:missionEvent', {
          type: 'extraction',
          text: '🚁 EXTRACT NOW - Exfil available at LZ'
        });
        return;
      }

      game.state.time--;

      // Pop problems from queue
      if (game.state.problemQueue.length > 0 && game.state.problemQueue[0].time >= game.state.time && !game.state.awaitingDecision) {
        const problem = game.state.problemQueue.shift();
        game.state.currentProblem = problem;
        game.state.awaitingDecision = true;

        io.to(gameId).emit('tactical:missionEvent', {
          type: 'decision',
          problem: problem.type,
          text: problem.text,
          options: selectedScenario.decisions[problem.type] || []
        });

        console.log(`⚡ PROBLEM: ${problem.text}`);
      }

      // Enemy combat AI
      game.state.enemies.forEach(enemy => {
        if (enemy.health <= 0) return;
        const closestUnit = game.state.tocUnits.reduce((closest, unit) => {
          if (unit.health <= 0) return closest;
          const dist = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
          return !closest || dist < Math.hypot(enemy.x - closest.x, enemy.y - closest.y) ? unit : closest;
        }, null);

        if (!closestUnit) return;

        const dist = Math.hypot(enemy.x - closestUnit.x, enemy.y - closestUnit.y);
        if (dist > 150) {
          enemy.x += Math.random() * 4 - 2;
          enemy.y += Math.random() * 4 - 2;
          enemy.revealed = false;
        } else if (dist < 100) {
          game.state.combatActive = true;
          closestUnit.health = Math.max(0, closestUnit.health - 3);
          enemy.health = Math.max(0, enemy.health - 5);
          if (closestUnit.health === 0) game.state.casualtiesCount++;
          if (enemy.health === 0) game.state.enemiesKilled++;
        }
      });

      io.to(gameId).emit('tactical:stateUpdate', {
        tocUnits: game.state.tocUnits,
        enemies: game.state.enemies,
        time: game.state.time,
        combatActive: game.state.combatActive,
        missionStatus: game.state.missionStatus,
        morale: game.state.morale,
        casualties: game.state.casualtiesCount,
        enemiesKilled: game.state.enemiesKilled
      });
    }, 1000);
  });

  // Tactical Game - Ground unit joins
  socket.on('tactical:joinAsGround', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    game.groundUnits.push({
      socketId: socket.id,
      userId: socket.userId,
      username: socket.username,
      unitId: `ground_${game.groundUnits.length + 1}`,
      x: 50 + (game.groundUnits.length * 20),
      y: 50 + (game.groundUnits.length * 20)
    });

    socket.join(data.gameId);
    socket.emit('tactical:gameJoined', { gameId: data.gameId, role: 'GROUND' });
    io.to(data.gameId).emit('tactical:playerJoined', { username: socket.username, role: 'GROUND' });
    console.log(`🪖 Ground unit joined: ${socket.username}`);
  });

  // TOC sends tactical decision
  socket.on('tactical:makeDecision', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.toc.socketId !== socket.id) return;

    const decision = data.decision;
    console.log(`🎖️ TOC DECISION: ${decision.label} (Risk: ${decision.risk})`);

    // Apply consequences
    game.state.morale += decision.morale;
    game.state.awaitingDecision = false;

    // Apply decision-specific effects
    if (data.problemType === 'casualty' && decision.label.includes('Evacuate')) {
      game.state.tocUnits[1].health = 100; // Bravo escapes
      game.state.casualtiesCount--;
    } else if (data.problemType === 'casualty' && decision.label.includes('suppress')) {
      game.state.tocUnits[1].health -= 25;
    } else if (data.problemType === 'ammo' && decision.label.includes('Resupply')) {
      game.state.tocUnits[1].health -= 15; // Supply run risk
    } else if (data.problemType === 'support' && decision.label.includes('airstrike')) {
      game.state.enemies.forEach(e => e.health -= 30);
    }

    io.to(data.gameId).emit('tactical:decisionResult', {
      decision: decision.label,
      consequence: decision.consequence,
      morale: game.state.morale
    });

    io.to(data.gameId).emit('tactical:stateUpdate', {
      tocUnits: game.state.tocUnits,
      enemies: game.state.enemies,
      morale: game.state.morale,
      casualties: game.state.casualtiesCount,
      missionStatus: game.state.missionStatus
    });
  });

  // TOC sends order to units
  socket.on('tactical:sendOrder', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || game.toc.socketId !== socket.id) return;

    io.to(data.gameId).emit('tactical:orderReceived', {
      order: data.order,
      target: data.target,
      timestamp: Date.now()
    });
    console.log(`📍 TOC Order: ${data.order} to ${data.target}`);
  });

  // Ground unit reports position
  socket.on('tactical:unitPosition', (data) => {
    const game = activeGames.get(data.gameId);
    if (!game) return;

    // Update ground unit position
    const unit = game.groundUnits.find(u => u.socketId === socket.id);
    if (unit) {
      unit.x = data.x;
      unit.y = data.y;

      // Check for enemy contact (fog of war)
      game.state.enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
        if (dist < 80) enemy.revealed = true;
      });

      // Broadcast to TOC only partial intel
      io.to(game.toc.socketId).emit('tactical:unitReport', {
        unit: unit.username,
        x: data.x,
        y: data.y,
        status: data.status
      });

      // Broadcast full state to all ground units
      io.to(data.gameId).emit('tactical:stateUpdate', {
        groundUnits: game.groundUnits.map(u => ({ username: u.username, x: u.x, y: u.y })),
        enemies: game.state.enemies,
        time: game.state.time
      });
    }
  });

  // Chat
  socket.on('comms:chat', (data) => {
    const matchId = findPlayerMatchId(socket.id);
    if (matchId && activeMatches.has(matchId)) {
      io.to(matchId).emit('comms:chat', {
        playerId: socket.userId,
        playerName: socket.username,
        message: data.message,
        isTeamOnly: data.isTeamOnly,
        timestamp: Date.now()
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
    connectedPlayers.delete(socket.id);

    const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
    if (index !== -1) {
      matchmakingQueue.splice(index, 1);
    }

    const matchId = findPlayerMatchId(socket.id);
    if (matchId) {
      io.to(matchId).emit('player:left', {
        playerId: socket.userId,
        username: socket.username
      });
    }
  });

  // ==========================================
  // REAL-TIME AI SOLDIER COMMAND SIMULATOR
  // ==========================================

  // Real-time mission simulation - simplified (no AI generation)
  socket.on('tactical:startMission', (data) => {
    console.log('🎖️ [BACKEND] tactical:startMission received:', data);
    try {
      const gameId = `mission_${Date.now()}`;

      // Simple realistic squad
      const squad = [
        {name: 'Falcon', role: 'Leader', specialty: 'Tactical command', health: 100, status: 'ready', x: 50, y: 50},
        {name: 'Storm', role: 'Rifleman', specialty: 'Assault', health: 100, status: 'ready', x: 60, y: 50},
        {name: 'Nexus', role: 'Gunner', specialty: 'Suppression', health: 100, status: 'ready', x: 70, y: 50},
        {name: 'Echo', role: 'Medic', specialty: 'Combat support', health: 100, status: 'ready', x: 80, y: 50}
      ];

      aiSoldiers[gameId] = squad;

      console.log('🎖️ [BACKEND] About to emit tactical:missionBriefing');
      socket.emit('tactical:missionBriefing', {
        gameId,
        squad,
        scenario: data.scenario
      });
      console.log('🎖️ [BACKEND] Emitted tactical:missionBriefing');

      console.log(`✅ Mission started: ${data.scenario} (${gameId})`);
    } catch (err) {
      console.error('❌ Mission error:', err);
      socket.emit('error', {message: err.message});
    }
  });

  socket.on('tactical:sendCommand', (data) => {
    try {
      if (data.gameId && aiSoldiers[data.gameId]) {
        // Simple response without AI
        socket.emit('tactical:aiResponse', {
          unit: 'Falcon',
          message: `Order received: "${data.command}" - Soldiers executing command`
        });

      const soldiers = aiSoldiers[data.gameId];
      soldiers.forEach(soldier => {
        if (Math.random() > 0.6) {
          soldier.status = 'moving';
          setTimeout(() => { soldier.status = 'ready'; }, 2000);
        }
        if (Math.random() > 0.8) {
          soldier.health -= 10;
          soldier.status = 'engaged';
        }
      });

        // Update squad status
        const soldiers = aiSoldiers[data.gameId];
        soldiers.forEach(s => { s.status = 'ready'; });

        socket.emit('tactical:squadUpdate', {
          squad: soldiers,
          gameState: {
            missionStatus: 'ACTIVE',
            time: 300,
            casualties: 0,
            enemiesNeutralized: Math.floor(Math.random() * 5),
            situation: 'Units standing by for next orders'
          }
        });
      }
    } catch (err) {
      console.error('❌ Command error:', err);
      socket.emit('error', {message: err.message});
    }
  });
});

// ===================
// Real Combat Simulation Loop
// ===================
// Enemies hunt units, units engage enemies, real-time combat
setInterval(() => {
  activeGames.forEach((game, gameId) => {
    const units = game.state.tocUnits;
    const enemies = game.state.enemies;

    // Enemy AI: Hunt and engage units
    enemies.forEach(enemy => {
      let closestUnit = null;
      let closestDist = Infinity;

      // Find nearest unit
      units.forEach(unit => {
        const dist = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestUnit = unit;
        }
      });

      if (closestUnit) {
        // Hunt the unit
        const dx = closestUnit.x - enemy.x;
        const dy = closestUnit.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 5) {
          enemy.x += (dx / dist) * 3; // Move toward unit
          enemy.y += (dy / dist) * 3;
        }

        // Open fire if close
        if (dist < 100 && Math.random() < 0.15) {
          closestUnit.health -= Math.random() * 15;
          if (closestUnit.health < 0) closestUnit.health = 0;
        }
      } else {
        // Patrol randomly
        enemy.x += (Math.random() - 0.5) * 8;
        enemy.y += (Math.random() - 0.5) * 8;
      }

      // Keep in bounds
      enemy.x = Math.max(20, Math.min(380, enemy.x));
      enemy.y = Math.max(20, Math.min(380, enemy.y));
    });

    // Unit counter-fire and morale
    units.forEach(unit => {
      let threatsNearby = 0;
      enemies.forEach(enemy => {
        const dist = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
        if (dist < 120) {
          threatsNearby++;
          // Return fire
          if (Math.random() < 0.20) {
            enemy.health -= Math.random() * 20;
            if (enemy.health <= 0) {
              enemy.x = Math.random() * 400;
              enemy.y = Math.random() * 400;
              enemy.health = 50; // Respawn
            }
          }
        }
      });

      // Morale affects movement
      if (unit.health > 75) {
        unit.status = '✅ Ready';
      } else if (unit.health > 50) {
        unit.status = '⚠️ Engaged';
      } else if (unit.health > 25) {
        unit.status = '🔴 Pinned';
      } else {
        unit.status = '💀 Critical';
      }
    });

    // Remove destroyed enemies
    game.state.enemies = enemies.filter(e => e.health > 0);

    // Broadcast real-time combat state
    io.to(gameId).emit('tactical:stateUpdate', {
      groundUnits: game.groundUnits,
      enemies: game.state.enemies,
      tocUnits: units,
      time: game.state.time--,
      combatActive: game.state.enemies.length > 0
    });

    console.log(`⚔️ ${gameId}: ${units.length} units (${units.map(u => u.health.toFixed(0)).join(',')}) vs ${enemies.length} enemies`);
  });
}, 500);

// ===================
// Helper Functions
// ===================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message, 'Secret exists:', !!process.env.JWT_SECRET);
      return res.status(403).json({ error: `Invalid token: ${err.message}` });
    }
    req.user = user;
    next();
  });
}

function startMatch(players) {
  const matchId = `match-${Date.now()}`;
  const alphaTeam = players.slice(0, 2);
  const bravoTeam = players.slice(2, 4);

  const match = {
    id: matchId,
    alphaTeam: alphaTeam.map(p => ({ socketId: p.socketId, userId: p.userId, username: p.username })),
    bravoTeam: bravoTeam.map(p => ({ socketId: p.socketId, userId: p.userId, username: p.username })),
    startedAt: Date.now(),
    alphaScore: 0,
    bravoScore: 0,
    status: 'active'
  };

  activeMatches.set(matchId, match);

  // Notify players
  alphaTeam.forEach(p => {
    io.to(p.socketId).emit('match:start', {
      matchId,
      team: 'alpha',
      opponents: bravoTeam.map(t => ({ userId: t.userId, username: t.username })),
      role: 'SquadLeader', // Simple role assignment for MVP
      mapName: 'Training Ground',
      duration: 1200 // 20 minutes
    });
  });

  bravoTeam.forEach(p => {
    io.to(p.socketId).emit('match:start', {
      matchId,
      team: 'bravo',
      opponents: alphaTeam.map(t => ({ userId: t.userId, username: t.username })),
      role: 'Rifleman',
      mapName: 'Training Ground',
      duration: 1200
    });
  });

  console.log(`🎮 Match started: ${matchId}`);

  // Auto-end match after 20 minutes (for MVP)
  setTimeout(() => {
    endMatch(matchId);
  }, 1200000);
}

function endMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (!match) return;

  const winner = match.alphaScore > match.bravoScore ? 'alpha' : 'bravo';

  // Notify players
  io.to(matchId).emit('match:end', {
    matchId,
    winner,
    alphaScore: match.alphaScore,
    bravoScore: match.bravoScore
  });

  activeMatches.delete(matchId);
  console.log(`🏁 Match ended: ${matchId} (${winner} wins)`);
}

function findPlayerMatchId(socketId) {
  for (const [matchId, match] of activeMatches) {
    if (match.alphaTeam.some(p => p.socketId === socketId) ||
        match.bravoTeam.some(p => p.socketId === socketId)) {
      return matchId;
    }
  }
  return null;
}

// ===================
// Error Handling & Startup
// ===================

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initializeDatabases();

    server.listen(PORT, () => {
      console.log(`\n🚀 Callsign Protocol Server Running`);
      console.log(`📍 http://localhost:${PORT}`);
      console.log(`🔗 WebSocket: ws://localhost:${PORT}`);
      console.log(`\n✅ Ready to accept connections\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await pgPool.end();
    if (mongoClient) await mongoClient.close();
    if (redisClient) await redisClient.disconnect();
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;

// ==========================================
// REAL-TIME AI SOLDIER COMMAND SIMULATOR
// ==========================================

// AI-controlled soldiers
let aiSoldiers = {};

// Generate AI soldier squad
async function generateSquad(scenario) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Generate 4 tactical soldiers for a ${scenario} mission. Return ONLY JSON (no markdown):
{
  "soldiers": [
    {"name": "CallsignName", "role": "Rifleman/Gunner/Medic/Leader", "specialty": "Brief specialty", "health": 100, "status": "ready", "x": 50, "y": 50}
  ]
}

Make realistic military names and roles.`
      }]
    });

    const content = response.content[0].text;
    const squad = JSON.parse(content);
    return squad.soldiers || [];
  } catch (err) {
    console.error('Squad generation failed:', err.message);
    return [
      {name: 'Falcon', role: 'Leader', specialty: 'Tactical command', health: 100, status: 'ready', x: 50, y: 50},
      {name: 'Storm', role: 'Rifleman', specialty: 'Assault', health: 100, status: 'ready', x: 60, y: 50},
      {name: 'Nexus', role: 'Gunner', specialty: 'Suppression', health: 100, status: 'ready', x: 70, y: 50},
      {name: 'Echo', role: 'Medic', specialty: 'Combat support', health: 100, status: 'ready', x: 80, y: 50}
    ];
  }
}

// AI interprets commands and controls soldiers
async function processAICommand(gameId, command, socket) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    const soldiers = aiSoldiers[gameId];
    if (!soldiers) return;

    const soldierNames = soldiers.map(s => s.name).join(', ');

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are ${soldierNames}, a tactical squad. The TOC commands: "${command}"

Respond as the FIRST soldier to speak, then any others who need to respond. Keep it tactical and brief.

Return JSON (ONLY):
{
  "responses": [
    {"soldier": "SoldierName", "action": "movement/combat/status", "message": "What they say"}
  ],
  "situation": "Current battlefield situation"
}

Actions: moving 30 units northwest / taking fire from building / suppressing enemy / advancing / holding position`
      }]
    });

    const content = response.content[0].text;
    const aiResponse = JSON.parse(content);

    // Broadcast AI responses to TOC
    aiResponse.responses.forEach(resp => {
      socket.emit('tactical:aiResponse', {
        unit: resp.soldier,
        message: resp.message,
        action: resp.action
      });
    });

    // Update situation
    socket.emit('tactical:situationUpdate', {
      situation: aiResponse.situation
    });

    console.log(`🤖 AI Squad: ${aiResponse.responses[0].message}`);
  } catch (err) {
    console.error('AI command processing failed:', err.message);
  }
}

// Real-time mission simulation
socket.on('tactical:startMission', async (data) => {
  const gameId = `mission_${Date.now()}`;
  let squad = [];

  try {
    squad = await generateSquad(data.scenario);
  } catch (err) {
    console.error('Squad generation failed, using fallback:', err.message);
    // Fallback squad
    squad = [
      {name: 'Falcon', role: 'Leader', specialty: 'Tactical command', health: 100, status: 'ready', x: 50, y: 50},
      {name: 'Storm', role: 'Rifleman', specialty: 'Assault', health: 100, status: 'ready', x: 60, y: 50},
      {name: 'Nexus', role: 'Gunner', specialty: 'Suppression', health: 100, status: 'ready', x: 70, y: 50},
      {name: 'Echo', role: 'Medic', specialty: 'Combat support', health: 100, status: 'ready', x: 80, y: 50}
    ];
  }

  aiSoldiers[gameId] = squad;

  socket.emit('tactical:missionBriefing', {
    gameId,
    squad,
    scenario: data.scenario
  });

  console.log(`🎖️ Started ${data.scenario} mission: ${gameId} with ${squad.length} soldiers`);
});

socket.on('tactical:sendCommand', async (data) => {
  if (data.gameId && aiSoldiers[data.gameId]) {
    await processAICommand(data.gameId, data.command, socket);

    // Simulate combat
    const soldiers = aiSoldiers[data.gameId];
    soldiers.forEach(soldier => {
      if (Math.random() > 0.6) {
        soldier.status = 'moving';
        setTimeout(() => { soldier.status = 'ready'; }, 2000);
      }
      if (Math.random() > 0.8) {
        soldier.health -= 10;
        soldier.status = 'engaged';
      }
    });

    socket.emit('tactical:squadUpdate', {
      squad: soldiers,
      gameState: {
        missionStatus: 'ACTIVE',
        time: 300,
        casualties: soldiers.filter(s => s.health <= 0).length,
        enemiesNeutralized: Math.floor(Math.random() * 5),
        situation: 'Units in combat, awaiting next command'
      }
    });
  }
});
