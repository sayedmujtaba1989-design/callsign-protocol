import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function AICommandSimulator({ user, onGameEnd }) {
  const [screen, setScreen] = useState('briefing');
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [squad, setSquad] = useState([]);
  const [commandLog, setCommandLog] = useState([]);
  const [inputCommand, setInputCommand] = useState('');
  const [gameState, setGameState] = useState({
    missionStatus: 'ACTIVE',
    time: 300,
    casualties: 0,
    enemiesNeutralized: 0,
    situation: 'Units standing by for orders'
  });

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
      
      newSocket.on('tactical:missionBriefing', (data) => {
        setSquad(data.squad);
        setGameId(data.gameId);
        setScreen('command');
      });

      newSocket.on('tactical:squadUpdate', (data) => {
        setSquad(data.squad);
        setGameState(data.gameState);
      });

      newSocket.on('tactical:aiResponse', (data) => {
        setCommandLog(prev => [...prev, {
          type: 'ai',
          unit: data.unit,
          message: data.message,
          timestamp: new Date()
        }]);
      });

      setSocket(newSocket);
    } catch (err) {
      console.error('Socket error:', err);
    }

    return () => {
      if (newSocket) newSocket.close();
    };
  }, []);

  const sendCommand = () => {
    if (!inputCommand.trim() || !socket) return;

    setCommandLog(prev => [...prev, {
      type: 'toc',
      message: inputCommand,
      timestamp: new Date()
    }]);

    socket.emit('tactical:sendCommand', {
      gameId,
      command: inputCommand,
      userId: user?.userId
    });

    setInputCommand('');
  };

  if (screen === 'briefing') {
    const handleStartMission = (scenario) => {
      if (!socket || !socket.connected) {
        alert('Connecting to server... try again in a moment');
        return;
      }
      socket.emit('tactical:startMission', {scenario});
    };

    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: 'white',
        minHeight: '100vh',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h1>🎖️ TACTICAL COMMAND CENTER</h1>
        <p>Real-Time AI Soldier Control Simulator</p>

        <div style={{marginTop: '40px'}}>
          <button onClick={() => handleStartMission('rescue')}
            style={{
              display: 'block',
              width: '300px',
              margin: '15px auto',
              padding: '20px',
              background: '#ff6b6b',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}>
            🆘 RESCUE MISSION
          </button>
          <button onClick={() => handleStartMission('defend')}
            style={{
              display: 'block',
              width: '300px',
              margin: '15px auto',
              padding: '20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}>
            🛡️ DEFEND BASE
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'command') {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        background: '#0a0a1a',
        color: 'white',
        fontFamily: 'Courier New, monospace',
        fontSize: '14px'
      }}>
        
        {/* LEFT: Squad Status */}
        <div style={{width: '25%', background: '#1a1a2e', borderRight: '2px solid #667eea', overflowY: 'auto', padding: '20px'}}>
          <h3>🎯 SQUAD STATUS</h3>
          {squad.map((soldier, i) => (
            <div key={i} style={{
              background: '#2a2a4e',
              padding: '15px',
              marginBottom: '10px',
              borderRadius: '5px',
              borderLeft: soldier.status === 'engaged' ? '4px solid #ff4444' : soldier.status === 'moving' ? '4px solid #ffaa00' : '4px solid #4da6ff'
            }}>
              <strong>{soldier.name}</strong>
              <br/>Role: {soldier.role}
              <br/>HP: {soldier.health}/100
              <br/>Status: {soldier.status === 'engaged' ? '⚔️ In Combat' : soldier.status === 'moving' ? '🚶 Moving' : '✅ Ready'}
              <br/>Position: {soldier.x}, {soldier.y}
            </div>
          ))}
        </div>

        {/* CENTER: Command Log */}
        <div style={{flex: 1, background: '#0a0a1a', display: 'flex', flexDirection: 'column', borderRight: '2px solid #667eea'}}>
          <div style={{flex: 1, overflowY: 'auto', padding: '20px'}}>
            <h3>📡 COMMAND LOG</h3>
            {commandLog.map((log, i) => (
              <div key={i} style={{
                marginBottom: '15px',
                padding: '10px',
                background: log.type === 'toc' ? '#2a3a5a' : '#2a4a2a',
                borderRadius: '5px',
                borderLeft: log.type === 'toc' ? '3px solid #667eea' : '3px solid #51cf66'
              }}>
                <span style={{color: log.type === 'toc' ? '#667eea' : '#51cf66', fontWeight: 'bold'}}>
                  {log.type === 'toc' ? '🎖️ TOC' : `📢 ${log.unit || 'COMMAND'}`}
                </span>
                <br/>
                {log.message}
              </div>
            ))}
          </div>

          {/* Command Input */}
          <div style={{padding: '20px', borderTop: '2px solid #667eea'}}>
            <div style={{marginBottom: '10px'}}>
              <label>Give orders to your squad:</label>
              <textarea
                value={inputCommand}
                onChange={(e) => setInputCommand(e.target.value)}
                placeholder='E.g., "Alpha, advance to the building on your left. Bravo, provide covering fire."'
                style={{
                  width: '100%',
                  height: '80px',
                  padding: '10px',
                  background: '#1a1a2e',
                  color: 'white',
                  border: '2px solid #667eea',
                  borderRadius: '5px',
                  fontFamily: 'Courier New, monospace',
                  fontSize: '14px'
                }}
              />
            </div>
            <button onClick={sendCommand}
              style={{
                width: '100%',
                padding: '10px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}>
              📡 SEND COMMAND
            </button>
          </div>
        </div>

        {/* RIGHT: Mission Status */}
        <div style={{width: '25%', background: '#1a1a2e', borderLeft: '2px solid #667eea', padding: '20px', overflowY: 'auto'}}>
          <h3>📊 MISSION STATUS</h3>
          <div style={{background: '#2a2a4e', padding: '15px', borderRadius: '5px', marginBottom: '20px'}}>
            <div style={{marginBottom: '10px'}}>
              <span style={{color: '#999'}}>Status:</span>
              <br/>
              <strong style={{color: gameState.missionStatus === 'ACTIVE' ? '#4da6ff' : '#ffaa00'}}>
                {gameState.missionStatus}
              </strong>
            </div>
            <div style={{marginBottom: '10px'}}>
              <span style={{color: '#999'}}>Time Remaining:</span>
              <br/>
              <strong>{Math.floor(gameState.time / 60)}:{(gameState.time % 60).toString().padStart(2, '0')}</strong>
            </div>
            <div style={{marginBottom: '10px'}}>
              <span style={{color: '#999'}}>Casualties:</span>
              <br/>
              <strong style={{color: '#ff4444'}}>{gameState.casualties}</strong>
            </div>
            <div>
              <span style={{color: '#999'}}>Enemies Neutralized:</span>
              <br/>
              <strong style={{color: '#51cf66'}}>{gameState.enemiesNeutralized}</strong>
            </div>
          </div>

          <h3>📍 SITUATION</h3>
          <div style={{
            background: '#2a2a4e',
            padding: '15px',
            borderRadius: '5px',
            lineHeight: '1.6'
          }}>
            {gameState.situation}
          </div>

          <button onClick={() => onGameEnd()}
            style={{
              width: '100%',
              marginTop: '20px',
              padding: '10px',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}>
            EXIT COMMAND
          </button>
        </div>
      </div>
    );
  }

  return null;
}
