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

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(express.json());
app.use(cors());

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
    mongoClient = new MongoClient(process.env.MONGODB_URL);
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

// ===================
// WebSocket Events (Socket.IO)
// ===================

// Store active matches and players
const activeMatches = new Map();
const connectedPlayers = new Map();
const matchmakingQueue = [];

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
});

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
      return res.status(403).json({ error: 'Invalid token' });
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
