import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function TacticalGame({ user, onGameEnd }) {
  const [screen, setScreen] = useState('mode');
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [gameData, setGameData] = useState({tocUnits: [], enemies: [], combatActive: false});
  const canvasRef = useRef(null);

  // Initialize socket
  useEffect(() => {
    let newSocket = null;
    try {
      newSocket = io(API_BASE, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => console.log('✅ Connected'));
      newSocket.on('tactical:gameCreated', (data) => {
        setGameId(data.gameId);
        setScreen('toc');
      });
      newSocket.on('tactical:stateUpdate', (data) => {
        setGameData(data);
      });

      setSocket(newSocket);
    } catch (err) {
      console.error('Socket error:', err);
    }

    return () => {
      if (newSocket) newSocket.close();
    };
  }, []);

  // Real-time combat canvas
  useEffect(() => {
    if (screen !== 'toc' || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dynamic background based on combat
      ctx.fillStyle = gameData.combatActive ? '#2a1a1a' : '#1a2a4a';
      ctx.fillRect(0, 0, 400, 400);

      // Grid
      ctx.strokeStyle = '#334455';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 40, 0);
        ctx.lineTo(i * 40, 400);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 40);
        ctx.lineTo(400, i * 40);
        ctx.stroke();
      }

      // Draw friendly units with health colors
      if (gameData.tocUnits) {
        gameData.tocUnits.forEach((unit, i) => {
          const hp = unit.health || 100;
          if (hp > 75) ctx.fillStyle = '#4da6ff'; // Blue healthy
          else if (hp > 50) ctx.fillStyle = '#ffaa00'; // Yellow wounded
          else if (hp > 0) ctx.fillStyle = '#ff4444'; // Red critical
          else ctx.fillStyle = '#333333'; // Gray dead

          ctx.beginPath();
          ctx.arc(unit.x, unit.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), unit.x, unit.y);
        });
      }

      // Draw enemies with health bars
      if (gameData.enemies) {
        gameData.enemies.forEach((enemy) => {
          ctx.fillStyle = '#ff4444';
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, 7, 0, Math.PI * 2);
          ctx.fill();

          // Health bar
          ctx.fillStyle = '#333';
          ctx.fillRect(enemy.x - 12, enemy.y - 15, 24, 3);
          const healthPercent = Math.max(0, enemy.health / 50);
          ctx.fillStyle = enemy.health > 30 ? '#00ff00' : '#ff0000';
          ctx.fillRect(enemy.x - 12, enemy.y - 15, healthPercent * 24, 3);
        });
      }

      // Crosshair
      ctx.strokeStyle = '#667eea';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(200, 185);
      ctx.lineTo(200, 215);
      ctx.moveTo(185, 200);
      ctx.lineTo(215, 200);
      ctx.stroke();

      // Combat status
      if (gameData.combatActive) {
        ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
        ctx.fillRect(0, 0, 400, 400);
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️ COMBAT ACTIVE', 200, 30);
      }
    } catch (err) {
      console.error('Canvas error:', err);
    }
  }, [screen, gameData]);

  // Mode selection
  if (screen === 'mode') {
    return (
      <div style={{padding: '40px', textAlign: 'center', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h1>🎖️ Callsign Protocol</h1>
        <p>Real-Time Tactical Command Game</p>
        <button
          onClick={() => socket?.emit('tactical:createGame', {scenario: 'patrol'})}
          style={{padding: '15px 40px', margin: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer'}}
        >
          🗺️ Create TOC
        </button>
        <button
          onClick={() => {
            const id = prompt('Enter Game ID:');
            if (id && socket) socket.emit('tactical:joinAsGround', {gameId: id});
          }}
          style={{padding: '15px 40px', margin: '10px', background: '#f44336', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer'}}
        >
          🪖 Join as Ground
        </button>
      </div>
    );
  }

  // TOC combat view
  if (screen === 'toc') {
    return (
      <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h2>🎖️ Tactical Operations Center</h2>
        <p>Game: {gameId?.substring(0, 8) || '...'}</p>

        <div style={{display: 'flex', gap: '20px'}}>
          {/* Canvas */}
          <div>
            <canvas
              ref={canvasRef}
              width="400"
              height="400"
              style={{border: gameData.combatActive ? '3px solid #ff4444' : '2px solid #667eea', background: '#0a0a1a', cursor: 'crosshair', borderRadius: '5px'}}
            />
            <p>{gameData.combatActive ? '⚔️ Combat Ongoing' : '📍 Patrol Mode'}</p>
          </div>

          {/* Status Panel */}
          <div style={{background: '#2a2a4e', padding: '15px', borderRadius: '5px', minWidth: '200px'}}>
            <h3>🎖️ Unit Status</h3>
            {gameData.tocUnits && gameData.tocUnits.map((unit, i) => (
              <div key={i} style={{padding: '8px', background: '#1a1a2e', marginBottom: '8px', borderRadius: '4px', borderLeft: `4px solid ${unit.health > 75 ? '#4da6ff' : unit.health > 50 ? '#ffaa00' : '#ff4444'}`}}>
                <strong>Unit {i+1}</strong> {unit.name}
                <br />HP: {unit.health?.toFixed(0) || 100}/100
                <br />{unit.status || '✅ Ready'}
              </div>
            ))}

            <h3 style={{marginTop: '20px'}}>🔴 Enemies</h3>
            <p>{gameData.enemies?.length || 0} active</p>

            <h3 style={{marginTop: '20px'}}>⚙️ Commands</h3>
            <button onClick={() => socket?.emit('tactical:sendOrder', {gameId, order: 'advance', target: 'objective'})} style={{display: 'block', width: '100%', padding: '8px', marginBottom: '5px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
              ↑ Advance
            </button>
            <button onClick={() => socket?.emit('tactical:sendOrder', {gameId, order: 'engage', target: 'enemies'})} style={{display: 'block', width: '100%', padding: '8px', marginBottom: '5px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
              🎯 Engage
            </button>
          </div>
        </div>

        <button onClick={() => onGameEnd()} style={{marginTop: '20px', padding: '10px 20px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
          Exit
        </button>
      </div>
    );
  }

  return null;
}
