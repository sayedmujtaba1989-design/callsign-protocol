import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function TacticalGame({ user, onGameEnd }) {
  const [screen, setScreen] = useState('mode');
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const canvasRef = useRef(null);

  // Initialize socket SAFELY
  useEffect(() => {
    let newSocket = null;
    try {
      newSocket = io(API_BASE, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to tactical server');
      });

      newSocket.on('tactical:gameCreated', (data) => {
        console.log('🎖️ TOC game created:', data.gameId);
        setGameId(data.gameId);
        setScreen('toc');
      });

      newSocket.on('tactical:gameJoined', (data) => {
        console.log('🪖 Ground unit joined:', data.gameId);
        setGameId(data.gameId);
        setScreen('ground');
      });

      setSocket(newSocket);
    } catch (err) {
      console.error('Socket init error:', err);
    }

    return () => {
      if (newSocket) newSocket.close();
    };
  }, []);

  // Canvas drawing for TOC
  useEffect(() => {
    if (screen !== 'toc' || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw background
      ctx.fillStyle = '#1a2a4a';
      ctx.fillRect(0, 0, 400, 400);

      // Draw grid
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

      // Draw crosshair
      ctx.strokeStyle = '#667eea';
      ctx.beginPath();
      ctx.moveTo(200, 185);
      ctx.lineTo(200, 215);
      ctx.moveTo(185, 200);
      ctx.lineTo(215, 200);
      ctx.stroke();
    } catch (err) {
      console.error('Canvas error:', err);
    }
  }, [screen]);

  // Mode selection
  if (screen === 'mode') {
    return (
      <div style={{padding: '40px', textAlign: 'center', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h1>🎖️ Callsign Protocol</h1>
        <p>Tactical Command Game</p>
        <button
          onClick={() => {
            if (socket) socket.emit('tactical:createGame', {scenario: 'patrol'});
          }}
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

  // TOC screen
  if (screen === 'toc') {
    return (
      <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h2>🎖️ Tactical Operations Center</h2>
        <p>Game: {gameId?.substring(0, 8) || '...'}</p>
        <canvas
          ref={canvasRef}
          width="400"
          height="400"
          style={{border: '2px solid #667eea', background: '#0a0a1a', cursor: 'crosshair', borderRadius: '5px'}}
        />
        <p>Real-time Battlefield Map</p>
        <button onClick={() => onGameEnd()} style={{padding: '10px 20px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
          Exit
        </button>
      </div>
    );
  }

  // Ground unit screen
  if (screen === 'ground') {
    return (
      <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h2>🪖 Ground Unit Operations</h2>
        <p>Game: {gameId?.substring(0, 8) || '...'}</p>
        <div style={{padding: '20px', background: '#2a2a4e', borderRadius: '5px', marginBottom: '20px'}}>
          <p>Field of View</p>
          <p>Waiting for orders from TOC...</p>
        </div>
        <button onClick={() => onGameEnd()} style={{padding: '10px 20px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
          Exit
        </button>
      </div>
    );
  }

  return null;
}
