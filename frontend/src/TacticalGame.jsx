import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function TacticalGame({ user, onGameEnd }) {
  const [screen, setScreen] = useState('mode');
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [objective, setObjective] = useState('');
  const [gameData, setGameData] = useState({
    tocUnits: [],
    enemies: [],
    combatActive: false,
    time: 120,
    missionStatus: 'ACTIVE',
    morale: 100,
    casualties: 0,
    enemiesKilled: 0
  });
  const [problem, setProblem] = useState(null);
  const [decisionResult, setDecisionResult] = useState(null);
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
        setScenario(data.scenario);
        setObjective(data.objective);
        setGameData(data.initialState);
        setScreen('toc');
      });
      newSocket.on('tactical:stateUpdate', (data) => {
        setGameData(prev => ({...prev, ...data}));
      });
      newSocket.on('tactical:missionEvent', (data) => {
        if (data.type === 'decision') {
          setProblem(data);
          setDecisionResult(null);
        } else if (data.type === 'extraction') {
          setProblem({ text: data.text, type: 'extraction' });
        }
      });
      newSocket.on('tactical:decisionResult', (data) => {
        setDecisionResult(data);
        setTimeout(() => setProblem(null), 3000);
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
        <p>Real-Time Tactical Command - MAKE REAL DECISIONS</p>
        <div style={{marginTop: '40px'}}>
          <button
            onClick={() => socket?.emit('tactical:createGame', {scenario: 'rescue'})}
            style={{display: 'block', padding: '20px 40px', margin: '15px auto', background: '#ff6b6b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', cursor: 'pointer', fontWeight: 'bold'}}
          >
            🆘 RESCUE VIP
          </button>
          <button
            onClick={() => socket?.emit('tactical:createGame', {scenario: 'defend'})}
            style={{display: 'block', padding: '20px 40px', margin: '15px auto', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', cursor: 'pointer', fontWeight: 'bold'}}
          >
            🛡️ DEFEND POSITION
          </button>
          <button
            onClick={() => socket?.emit('tactical:createGame', {scenario: 'patrol'})}
            style={{display: 'block', padding: '20px 40px', margin: '15px auto', background: '#51cf66', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', cursor: 'pointer', fontWeight: 'bold'}}
          >
            🗺️ PATROL MISSION
          </button>
        </div>
      </div>
    );
  }

  // TOC combat view with REAL DECISIONS
  if (screen === 'toc') {
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    const missionColor = gameData.missionStatus === 'ACTIVE' ? '#4da6ff' :
                         gameData.missionStatus === 'EXTRACT_NOW' ? '#ffaa00' : '#ff4444';

    return (
      <div style={{padding: '20px', background: '#1a1a2e', color: 'white', minHeight: '100vh'}}>
        <h2>🎖️ {scenario}</h2>
        <p style={{color: '#999'}}>Objective: {objective}</p>

        {/* DECISION PANEL - Only shows when TOC must decide */}
        {problem && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: problem.type === 'extraction' ? '#2a4a2a' : '#4a2a2a',
            border: problem.type === 'extraction' ? '3px solid #00ff00' : '3px solid #ff4444',
            borderRadius: '10px',
            padding: '30px',
            maxWidth: '600px',
            zIndex: 1000,
            boxShadow: '0 0 50px rgba(255, 68, 68, 0.5)'
          }}>
            <h3 style={{fontSize: '24px', marginTop: 0}}>{problem.text}</h3>

            {decisionResult ? (
              <div style={{background: '#1a1a2e', padding: '15px', borderRadius: '5px', marginTop: '15px'}}>
                <h4>✅ Decision Made</h4>
                <p><strong>{decisionResult.decision}</strong></p>
                <p style={{color: '#ffaa00'}}>{decisionResult.consequence}</p>
                <p>Morale: <span style={{color: decisionResult.morale > 100 ? '#00ff00' : '#ff4444'}}>{decisionResult.morale}</span></p>
              </div>
            ) : problem.type !== 'extraction' ? (
              <div style={{marginTop: '20px'}}>
                {problem.options && problem.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => socket?.emit('tactical:makeDecision', {
                      gameId,
                      decision: opt,
                      problemType: problem.problem
                    })}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '15px',
                      margin: '10px 0',
                      background: opt.risk === 'high' ? '#ff6b6b' : opt.risk === 'medium' ? '#ffaa00' : '#51cf66',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    {opt.label} ({opt.risk} risk)
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px'}}>
          <div style={{background: '#2a2a4e', padding: '10px', borderRadius: '5px', textAlign: 'center'}}>
            <div style={{fontSize: '12px', color: '#999'}}>TIME</div>
            <div style={{fontSize: '20px', fontWeight: 'bold'}}>{formatTime(gameData.time)}</div>
          </div>
          <div style={{background: '#2a2a4e', padding: '10px', borderRadius: '5px', textAlign: 'center'}}>
            <div style={{fontSize: '12px', color: '#999'}}>MORALE</div>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: gameData.morale > 80 ? '#00ff00' : gameData.morale > 50 ? '#ffaa00' : '#ff4444'}}>{gameData.morale}%</div>
          </div>
          <div style={{background: '#2a2a4e', padding: '10px', borderRadius: '5px', textAlign: 'center'}}>
            <div style={{fontSize: '12px', color: '#999'}}>CASUALTIES</div>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: '#ff4444'}}>{gameData.casualties}</div>
          </div>
          <div style={{background: '#2a2a4e', padding: '10px', borderRadius: '5px', textAlign: 'center'}}>
            <div style={{fontSize: '12px', color: '#999'}}>ENEMIES KIA</div>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: '#00ff00'}}>{gameData.enemiesKilled}</div>
          </div>
        </div>

        <div style={{display: 'flex', gap: '20px'}}>
          {/* Canvas */}
          <div>
            <canvas
              ref={canvasRef}
              width="400"
              height="400"
              style={{border: gameData.combatActive ? '3px solid #ff4444' : '2px solid #667eea', background: '#0a0a1a', cursor: 'crosshair', borderRadius: '5px'}}
            />
            <p style={{textAlign: 'center', color: missionColor, fontWeight: 'bold'}}>
              {gameData.missionStatus === 'ACTIVE' ? '📍 MISSION ACTIVE' :
               gameData.missionStatus === 'EXTRACT_NOW' ? '🚁 EXTRACT AT LZ' : '💀 MISSION FAILED'}
            </p>
          </div>

          {/* Status Panel */}
          <div style={{background: '#2a2a4e', padding: '15px', borderRadius: '5px', minWidth: '250px'}}>
            <h3>🎖️ Unit Status</h3>
            {gameData.tocUnits && gameData.tocUnits.map((unit, i) => {
              const status = unit.health > 75 ? '✅ Ready' : unit.health > 50 ? '⚠️ Engaged' : unit.health > 25 ? '🔴 Pinned' : '💀 Critical';
              return (
                <div key={i} style={{padding: '10px', background: '#1a1a2e', marginBottom: '8px', borderRadius: '4px', borderLeft: `4px solid ${unit.health > 75 ? '#4da6ff' : unit.health > 50 ? '#ffaa00' : '#ff4444'}`}}>
                  <strong>{unit.name}</strong> {unit.role && `(${unit.role})`}
                  <br />HP: {unit.health?.toFixed(0) || 100}/100
                  <br />{status}
                </div>
              );
            })}

            <h3 style={{marginTop: '20px'}}>🔴 Enemy Count</h3>
            <p>{gameData.enemies?.filter(e => e.health > 0).length || 0} active</p>

            <h3 style={{marginTop: '20px'}}>⚙️ Orders</h3>
            <button onClick={() => socket?.emit('tactical:sendOrder', {gameId, order: 'advance', target: 'objective'})} style={{display: 'block', width: '100%', padding: '8px', marginBottom: '5px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px'}}>
              ↑ Advance
            </button>
            <button onClick={() => socket?.emit('tactical:sendOrder', {gameId, order: 'hold', target: 'position'})} style={{display: 'block', width: '100%', padding: '8px', marginBottom: '5px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px'}}>
              🛡️ Hold Position
            </button>
            <button onClick={() => socket?.emit('tactical:sendOrder', {gameId, order: 'engage', target: 'enemies'})} style={{display: 'block', width: '100%', padding: '8px', marginBottom: '5px', background: '#ff6b6b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px'}}>
              🎯 Engage Enemies
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
