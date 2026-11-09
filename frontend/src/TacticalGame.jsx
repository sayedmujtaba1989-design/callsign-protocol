import React from 'react';

export default function TacticalGame({ user, onGameEnd }) {
  return (
    <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
      <h1>🎖️ Tactical Game</h1>
      <p>Test component - no socket code</p>
      <button onClick={onGameEnd} style={{padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>
        Exit
      </button>
    </div>
  );
}
