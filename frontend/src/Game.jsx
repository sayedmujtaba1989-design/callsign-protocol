import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_BASE = 'https://callsign-protocol.onrender.com/api';
const GAME_DURATION = 60;

export default function Game({ user, onGameEnd }) {
  const [gameState, setGameState] = useState('setup');
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [kills, setKills] = useState(0);
  const canvasRef = useRef(null);
  const gameRef = useRef({
    squad: [
      { id: 's1', x: 200, y: 200, color: '#2196F3', name: 'S', vx: 0, vy: 0, health: 100 },
      { id: 's2', x: 250, y: 250, color: '#1976D2', name: 'R', vx: 0, vy: 0, health: 100 },
      { id: 's3', x: 300, y: 200, color: '#1565C0', name: 'M', vx: 0, vy: 0, health: 100 },
    ],
    enemies: [
      { id: 'e1', x: 450, y: 100, color: '#f44336', health: 50, vx: 0, vy: 0 },
      { id: 'e2', x: 100, y: 450, color: '#f44336', health: 50, vx: 0, vy: 0 },
      { id: 'e3', x: 450, y: 450, color: '#f44336', health: 50, vx: 0, vy: 0 },
    ],
    time: GAME_DURATION,
    kills: 0,
  });

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;

    const gameLoop = () => {
      const game = gameRef.current;
      game.time -= 0.016; // ~60 FPS
      setTimeLeft(Math.ceil(game.time));

      if (game.time <= 0) {
        endGame();
        return;
      }

      // Clear canvas
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, 500, 500);

      // Draw grid
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 50, 0);
        ctx.lineTo(i * 50, 500);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 50);
        ctx.lineTo(500, i * 50);
        ctx.stroke();
      }

      // Update and draw squad
      game.squad.forEach(unit => {
        // Move toward enemies
        let targetX = 250, targetY = 250;
        game.enemies.forEach(enemy => {
          const dist = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
          if (dist < 150) {
            targetX = enemy.x;
            targetY = enemy.y;
          }
        });

        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          unit.x += (dx / dist) * 2;
          unit.y += (dy / dist) * 2;
        }

        // Auto-attack
        game.enemies.forEach(enemy => {
          if (Math.hypot(enemy.x - unit.x, enemy.y - unit.y) < 80 && Math.random() < 0.02) {
            enemy.health -= 10;
            if (enemy.health <= 0) {
              game.kills++;
              setKills(game.kills);
              enemy.x = Math.random() * 500;
              enemy.y = Math.random() * 500;
              enemy.health = 50;
            }
          }
        });

        // Draw unit
        ctx.fillStyle = unit.color;
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.name, unit.x, unit.y);
      });

      // Update and draw enemies
      game.enemies.forEach(enemy => {
        // Move toward nearest squad member
        let minDist = Infinity;
        let targetUnit = game.squad[0];
        game.squad.forEach(unit => {
          const d = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
          if (d < minDist) {
            minDist = d;
            targetUnit = unit;
          }
        });

        const dx = targetUnit.x - enemy.x;
        const dy = targetUnit.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          enemy.x += (dx / dist) * 1.5;
          enemy.y += (dy / dist) * 1.5;
        }

        // Counterattack
        if (dist < 50 && Math.random() < 0.01) {
          targetUnit.health -= 5;
        }

        // Draw enemy
        ctx.fillStyle = enemy.health > 25 ? '#f44336' : '#ff9800';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', enemy.x, enemy.y);
      });

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [gameState]);

  const startGame = () => {
    setGameState('playing');
    setTimeLeft(GAME_DURATION);
    setKills(0);
    gameRef.current.time = GAME_DURATION;
    gameRef.current.kills = 0;
  };

  const endGame = async () => {
    setGameState('ended');
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');

    try {
      const matchRes = await axios.post(`${API_BASE}/matches`, {
        map_name: 'Combat Arena',
        game_mode: 'Real-Time',
        duration_seconds: GAME_DURATION,
        team_score_1: kills,
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
          kills,
          deaths: gameRef.current.squad.filter(u => u.health <= 0).length,
          assists: 0,
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  if (gameState === 'setup') {
    return (
      <div style={styles.setupContainer}>
        <h2>🎮 Real-Time Combat</h2>
        <p>60-second action match. Survive and eliminate enemies!</p>
        <div style={styles.squadList}>
          <div style={styles.squadCard}>🔍 Sniper</div>
          <div style={styles.squadCard}>🎯 Rifleman</div>
          <div style={styles.squadCard}>🏥 Medic</div>
        </div>
        <button onClick={startGame} style={styles.startBtn}>
          🎬 Start Combat
        </button>
      </div>
    );
  }

  if (gameState === 'playing') {
    return (
      <div style={styles.gameContainer}>
        <div style={styles.header}>
          <h2>⚔️ Real-Time Combat</h2>
          <div style={styles.stats}>
            <span>⏱ {timeLeft}s</span>
            <span>💀 {kills} kills</span>
          </div>
        </div>
        <div style={styles.gameArea}>
          <canvas
            ref={canvasRef}
            width={500}
            height={500}
            style={styles.canvas}
          />
          <div style={styles.info}>
            <p><strong>🔵 Blue = Your Squad</strong></p>
            <p><strong>🔴 Red = Enemies</strong></p>
            <p>Units move & attack automatically!</p>
            <p>Survive 60 seconds to win!</p>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'ended') {
    return (
      <div style={styles.endContainer}>
        <h2>✅ Mission Complete!</h2>
        <div style={styles.finalStats}>
          <div><strong>Kills:</strong> <span style={styles.bigNumber}>{kills}</span></div>
          <div><strong>Time:</strong> <span style={styles.bigNumber}>60s</span></div>
        </div>
        <p style={styles.recorded}>📊 Match recorded to leaderboard!</p>
        <button onClick={() => onGameEnd()} style={styles.backBtn}>
          Back to Dashboard
        </button>
      </div>
    );
  }
}

const styles = {
  setupContainer: {
    maxWidth: '500px',
    margin: '80px auto',
    background: 'white',
    padding: '40px',
    borderRadius: '10px',
    textAlign: 'center',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
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
    fontSize: '16px',
  },
  startBtn: {
    padding: '15px 40px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  gameContainer: {
    padding: '20px',
    background: '#f5f5f5',
    minHeight: '100vh',
  },
  header: {
    background: '#667eea',
    color: 'white',
    padding: '15px 20px',
    borderRadius: '5px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stats: {
    display: 'flex',
    gap: '20px',
    fontWeight: 'bold',
  },
  gameArea: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    background: 'white',
    border: '3px solid #333',
    borderRadius: '5px',
    cursor: 'crosshair',
  },
  info: {
    background: 'white',
    padding: '20px',
    borderRadius: '5px',
    width: '200px',
    fontSize: '14px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  endContainer: {
    maxWidth: '400px',
    margin: '100px auto',
    background: 'white',
    padding: '40px',
    borderRadius: '10px',
    textAlign: 'center',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
  },
  finalStats: {
    display: 'flex',
    justifyContent: 'space-around',
    margin: '30px 0',
    fontSize: '16px',
  },
  bigNumber: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#667eea',
    display: 'block',
  },
  recorded: {
    color: '#4CAF50',
    fontWeight: 'bold',
    marginBottom: '20px',
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
