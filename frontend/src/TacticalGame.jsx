import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function TacticalGame({ user, onGameEnd }) {
  const [screen, setScreen] = useState('mode'); // mode, toc, ground
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const canvasRef = useRef(null);

  // Initialize socket
  useEffect(() => {
    const newSocket = io(API_BASE, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => console.log('✅ Connected'));
    newSocket.on('tactical:gameCreated', (data) => {
      console.log('🎖️ Game created:', data.gameId);
      setGameId(data.gameId);
      setScreen('toc');
    });
    newSocket.on('tactical:gameJoined', (data) => {
      console.log('🪖 Game joined:', data.gameId);
      setGameId(data.gameId);
      setScreen('ground');
    });

    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  // Canvas drawing
  useEffect(() => {
    if (screen !== 'toc' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a2a4a';
    ctx.fillRect(0, 0, 400, 400);
    ctx.strokeStyle = '#334455';
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
  }, [screen]);

  if (screen === 'mode') {
    return (
      <div style={{padding: '40px', textAlign: 'center', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h1>🎖️ Callsign Protocol</h1>
        <button
          onClick={() => socket?.emit('tactical:createGame', {scenario: 'patrol'})}
          style={{padding: '15px 40px', margin: '10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer'}}
        >
          🗺️ Create TOC
        </button>
        <button
          onClick={() => {
            const id = prompt('Enter Game ID:');
            if (id) socket?.emit('tactical:joinAsGround', {gameId: id});
          }}
          style={{padding: '15px 40px', margin: '10px', background: '#f44336', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer'}}
        >
          🪖 Join as Ground
        </button>
      </div>
    );
  }

  if (screen === 'toc') {
    return (
      <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h2>🎖️ Tactical Operations Center</h2>
        <p>Game: {gameId?.substring(0, 8)}</p>
        <canvas
          ref={canvasRef}
          width="400"
          height="400"
          style={{border: '2px solid #667eea', background: '#0a0a1a', cursor: 'crosshair'}}
        />
        <p>Battlefield Map (Real-time)</p>
        <button onClick={() => onGameEnd()} style={{padding: '10px 20px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
          Exit
        </button>
      </div>
    );
  }

  if (screen === 'ground') {
    return (
      <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h2>🪖 Ground Unit</h2>
        <p>Game: {gameId?.substring(0, 8)}</p>
        <p>Field of View</p>
        <button onClick={() => onGameEnd()} style={{padding: '10px 20px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
          Exit
        </button>
      </div>
    );
  }
}
