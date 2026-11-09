import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_BASE = 'https://callsign-protocol.onrender.com/api';
const GRID_SIZE = 10;
const CELL_SIZE = 50;
const GAME_DURATION = 60;

export default function Game({ user, onGameEnd }) {
  const [gameState, setGameState] = useState('squad-setup');
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [kills, setKills] = useState(0);
  const [matchStats, setMatchStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const gameDataRef = useRef(null);
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);

  const startGame = () => {
    gameDataRef.current = {
      squad: [
        { id: 'sniper', name: 'Sniper', x: 2, y: 2, vx: 0, vy: 0, role: 'Sniper', kills: 0, health: 100, targetX: null, targetY: null },
        { id: 'rifleman', name: 'Rifleman', x: 4, y: 2, vx: 0, vy: 0, role: 'Rifleman', kills: 0, health: 100, targetX: null, targetY: null },
        { id: 'medic', name: 'Medic', x: 3, y: 4, vx: 0, vy: 0, role: 'Medic', kills: 0, health: 100, targetX: null, targetY: null },
      ],
      enemies: [
        { id: 'e1', x: 8, y: 8, vx: 0, vy: 0, health: 30, targetX: null, targetY: null, revealed: false },
        { id: 'e2', x: 7, y: 1, vx: 0, vy: 0, health: 30, targetX: null, targetY: null, revealed: false },
        { id: 'e3', x: 9, y: 5, vx: 0, vy: 0, health: 30, targetX: null, targetY: null, revealed: false },
      ],
      time: GAME_DURATION,
      kills: 0,
    };

    setGameState('playing');
    setTimeLeft(GAME_DURATION);
    setKills(0);
    startGameLoop();
  };

  const startGameLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let lastTime = Date.now();

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      const gameData = gameDataRef.current;
      gameData.time -= deltaTime;

      if (gameData.time <= 0) {
        endMatch(gameData);
        return;
      }

      // Update squad movement
      gameData.squad.forEach(unit => {
        if (unit.targetX !== null && unit.targetY !== null) {
          const dx = unit.targetX - unit.x;
          const dy = unit.targetY - unit.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.1) {
            const speed = 3;
            unit.x += (dx / dist) * speed * deltaTime;
            unit.y += (dy / dist) * speed * deltaTime;
          } else {
            unit.targetX = null;
            unit.targetY = null;
          }
        }

        // Auto-attack nearby enemies
        gameData.enemies.forEach(enemy => {
          if (!enemy.health) return;
          const dist = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
          if (dist < 4 && Math.random() < 0.02) {
            enemy.health -= 10;
            if (enemy.health <= 0) {
              unit.kills++;
              gameData.kills++;
              setKills(gameData.kills);
            }
            enemy.revealed = true;
          }
        });
      });

      // Enemy AI
      gameData.enemies.forEach(enemy => {
        if (!enemy.health) return;

        // Simple AI: move toward nearest squad member
        let nearest = null;
        let nearestDist = Infinity;
        gameData.squad.forEach(unit => {
          const dist = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = unit;
          }
        });

        if (nearest) {
          const dx = nearest.x - enemy.x;
          const dy = nearest.y - enemy.y;
          const dist = Math.hypot(dx, dy);
          const speed = 2;
          if (dist > 0.5) {
            enemy.x += (dx / dist) * speed * deltaTime;
            enemy.y += (dy / dist) * speed * deltaTime;
          }
          if (dist < 5) enemy.revealed = true;

          // Enemy counterattack
          if (dist < 3 && Math.random() < 0.01) {
            nearest.health -= 5;
          }
        }
      });

      // Draw game
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);

      // Draw grid
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, GRID_SIZE * CELL_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(GRID_SIZE * CELL_SIZE, i * CELL_SIZE);
        ctx.stroke();
      }

      // Draw squad
      gameData.squad.forEach(unit => {
        const color = unit.health > 50 ? '#2196F3' : unit.health > 25 ? '#FF9800' : '#f44336';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(unit.x * CELL_SIZE + CELL_SIZE / 2, unit.y * CELL_SIZE + CELL_SIZE / 2, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.name[0], unit.x * CELL_SIZE + CELL_SIZE / 2, unit.y * CELL_SIZE + CELL_SIZE / 2);
      });

      // Draw enemies
      gameData.enemies.forEach(enemy => {
        if (!enemy.health) return;
        if (enemy.revealed) {
          ctx.fillStyle = '#f44336';
          ctx.beginPath();
          ctx.arc(enemy.x * CELL_SIZE + CELL_SIZE / 2, enemy.y * CELL_SIZE + CELL_SIZE / 2, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('E', enemy.x * CELL_SIZE + CELL_SIZE / 2, enemy.y * CELL_SIZE + CELL_SIZE / 2);
        }
      });

      setTimeLeft(Math.ceil(gameData.time));
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const handleCanvasClick = (e) => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / CELL_SIZE;
    const y = (e.clientY - rect.top) / CELL_SIZE;

    // Command nearest unit to move there
    const gameData = gameDataRef.current;
    let nearest = gameData.squad[0];
    let nearestDist = Infinity;
    gameData.squad.forEach(unit => {
      const dist = Math.hypot(unit.x - x, unit.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = unit;
      }
    });

    nearest.targetX = Math.max(0, Math.min(GRID_SIZE - 0.5, x));
    nearest.targetY = Math.max(0, Math.min(GRID_SIZE - 0.5, y));
  };

  const endMatch = async (gameData) => {
    setLoading(true);
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);

    try {
      const stats = {
        total_kills: gameData.kills,
        total_deaths: gameData.squad.filter(u => u.health <= 0).length,
      };

      const token = localStorage.getItem('authToken');
      const userId = localStorage.getItem('userId');

      const matchRes = await axios.post(`${API_BASE}/matches`, {
        map_name: 'Combat Zone',
        game_mode: 'Real-Time Action',
        duration_seconds: GAME_DURATION,
        team_score_1: stats.total_kills,
        team_score_2: 0,
        winner: 'team_1',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (matchRes.data.id) {
        await axios.post(`${API_BASE}/matches/${matchRes.data.id}/players`, {
          user_id: userId,
          team: 'team_1',
          role: 'Squad Lead',
          kills: stats.total_kills,
          deaths: stats.total_deaths,
          assists: 0,
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      setMatchStats(stats);
      setGameState('ended');
    } catch (err) {
      console.error('Error:', err);
      setGameState('ended');
    } finally {
      setLoading(false);
    }
  };

  if (gameState === 'squad-setup') {
    return (
      <div style={styles.setupContainer}>
        <h2>🎮 Real-Time Combat</h2>
        <p>60-second action match. Click on the battlefield to move units.</p>
        <div style={styles.squadList}>
          <div style={styles.squadCard}>🔍 Sniper</div>
          <div style={styles.squadCard}>🎯 Rifleman</div>
          <div style={styles.squadCard}>🏥 Medic</div>
        </div>
        <button onClick={startGame} style={styles.startBtn}>
          Start Combat
        </button>
      </div>
    );
  }

  if (gameState === 'playing') {
    return (
      <div style={styles.gameContainer}>
        <div style={styles.gameHeader}>
          <h2>Real-Time Combat</h2>
          <div style={styles.gameStats}>
            <span>⏱ Time: {timeLeft}s</span>
            <span>💀 Kills: {kills}</span>
          </div>
        </div>
        <div style={styles.gameArea}>
          <canvas
            ref={canvasRef}
            width={GRID_SIZE * CELL_SIZE}
            height={GRID_SIZE * CELL_SIZE}
            onClick={handleCanvasClick}
            style={styles.canvas}
          />
          <div style={styles.instructions}>
            <p><strong>Click anywhere to move units</strong></p>
            <p>Units auto-attack nearby enemies</p>
            <p>Survive 60 seconds!</p>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'ended') {
    return (
      <div style={styles.endScreen}>
        <h2>Mission Complete!</h2>
        <div style={styles.statsDisplay}>
          <div style={styles.stat}>
            <div>Kills</div>
            <div style={styles.statValue}>{kills}</div>
          </div>
          <div style={styles.stat}>
            <div>Deaths</div>
            <div style={styles.statValue}>{matchStats?.total_deaths || 0}</div>
          </div>
        </div>
        <p style={styles.recordedText}>✅ Match recorded to leaderboard!</p>
        <button onClick={() => onGameEnd()} style={styles.backBtn}>
          Back to Dashboard
        </button>
      </div>
    );
  }
}

const styles = {
  setupContainer: {
    maxWidth: '600px',
    margin: '100px auto',
    background: 'white',
    padding: '40px',
    borderRadius: '10px',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  squadList: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    margin: '20px 0',
  },
  squadCard: {
    padding: '15px 20px',
    background: '#f0f0f0',
    borderRadius: '5px',
    fontWeight: 'bold',
    fontSize: '18px',
  },
  startBtn: {
    padding: '15px 40px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '18px',
  },
  gameContainer: {
    padding: '20px',
    background: '#f5f5f5',
    minHeight: '100vh',
  },
  gameHeader: {
    background: '#667eea',
    color: 'white',
    padding: '15px',
    borderRadius: '5px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameStats: {
    display: 'flex',
    gap: '20px',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  gameArea: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
  },
  canvas: {
    background: 'white',
    border: '2px solid #333',
    cursor: 'crosshair',
    borderRadius: '5px',
  },
  instructions: {
    background: 'white',
    padding: '20px',
    borderRadius: '5px',
    width: '200px',
    fontSize: '14px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  endScreen: {
    maxWidth: '500px',
    margin: '100px auto',
    background: 'white',
    padding: '40px',
    borderRadius: '10px',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  statsDisplay: {
    display: 'flex',
    gap: '40px',
    justifyContent: 'center',
    margin: '30px 0',
  },
  stat: {
    fontSize: '16px',
    color: '#666',
  },
  statValue: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#667eea',
  },
  recordedText: {
    color: '#4CAF50',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  backBtn: {
    padding: '12px 30px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
};
