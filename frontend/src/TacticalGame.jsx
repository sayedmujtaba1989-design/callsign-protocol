import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function TacticalGame({ user, onGameEnd }) {
  const [gameState, setGameState] = useState('mode-select'); // mode-select, toc, ground
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [roleState, setRoleState] = useState('TOC'); // TOC or GROUND
  const [gameData, setGameData] = useState({
    tocUnits: [],
    enemies: [],
    groundUnits: [],
    tocIntel: [],
    time: 300
  });
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);

  useEffect(() => {
    const newSocket = io(API_BASE, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to tactical server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    newSocket.on('disconnect', () => {
      console.log('⚠️ Disconnected from tactical server');
    });

    newSocket.on('tactical:gameCreated', (data) => {
      console.log('🎖️ TOC game created:', data.gameId);
      setGameId(data.gameId);
      setGameState('toc');
      setRoleState('TOC');
      setGameData(data.initialState || {
        tocUnits: [],
        enemies: [],
        groundUnits: [],
        tocIntel: [],
        time: 300
      });
    });

    newSocket.on('tactical:gameJoined', (data) => {
      setGameId(data.gameId);
      setGameState('ground');
      setRoleState('GROUND');
      setGameData({ x: 50, y: 50, orders: [], visibility: [] });
    });

    newSocket.on('tactical:orderReceived', (data) => {
      setOrders(prev => [...prev, {
        ...data,
        received: new Date().toLocaleTimeString()
      }]);
    });

    newSocket.on('tactical:playerJoined', (data) => {
      setMessage(`${data.username} joined as ${data.role}`);
    });

    newSocket.on('tactical:unitReport', (data) => {
      setGameData(prev => ({
        ...prev,
        intel: [...(prev.intel || []), data]
      }));
    });

    newSocket.on('tactical:stateUpdate', (data) => {
      console.log('📍 State update:', data);
      setGameData(prev => {
        if (!prev) {
          return {
            tocUnits: data.tocUnits || [],
            enemies: data.enemies || [],
            groundUnits: data.groundUnits || [],
            tocIntel: [],
            time: data.time || 300
          };
        }
        return {
          ...prev,
          groundUnits: data.groundUnits || prev.groundUnits,
          enemies: data.enemies || prev.enemies,
          tocUnits: data.tocUnits || prev.tocUnits,
          time: data.time
        };
      });
    });

    newSocket.on('tactical:unitPositionUpdate', (data) => {
      console.log('🎯 Unit moved:', data);
      setGameData(prev => ({
        ...prev,
        groundUnits: (prev.groundUnits || []).map(u =>
          u.id === data.unitId ? { ...u, x: data.x, y: data.y } : u
        )
      }));
    });

    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  const createGame = () => {
    if (!socket) {
      alert('Connecting to server... please wait and try again');
      return;
    }
    if (!socket.connected) {
      alert('Server connection not ready. Please wait...');
      return;
    }
    console.log('Creating TOC game...');
    socket.emit('tactical:createGame', { scenario: 'patrol' });
  };

  const joinGame = () => {
    const joinGameId = prompt('Enter Game ID:');
    if (joinGameId && socket) {
      socket.emit('tactical:joinAsGround', { gameId: joinGameId });
    }
  };

  const sendOrder = (order, target) => {
    if (socket && gameId) {
      socket.emit('tactical:sendOrder', { gameId, order, target });
    }
  };

  const updatePosition = (x, y) => {
    if (socket && gameId) {
      socket.emit('tactical:unitPosition', {
        gameId,
        x,
        y,
        status: 'moving'
      });
      setGameData(prev => ({ ...prev, x, y }));
    }
  };

  if (gameState === 'mode-select') {
    return (
      <div style={styles.container}>
        <h1>🎖️ Tactical Operations</h1>
        <p>Real-time tactical command game</p>
        <div style={styles.modeSelect}>
          <button onClick={createGame} style={styles.tocBtn}>
            🗺️ Create TOC<br/>
            <small>(Command Center)</small>
          </button>
          <button onClick={joinGame} style={styles.groundBtn}>
            🪖 Join as Ground Unit<br/>
            <small>(Field Operative)</small>
          </button>
        </div>
      </div>
    );
  }

  // Canvas rendering for TOC
  useEffect(() => {
    if (gameState !== 'toc' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationId;

    const drawCanvas = () => {
      // Clear background
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
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(200, 185);
      ctx.lineTo(200, 215);
      ctx.moveTo(185, 200);
      ctx.lineTo(215, 200);
      ctx.stroke();

      // Draw your units (blue)
      try {
        const units = gameData?.tocUnits || gameData?.groundUnits || [];
        if (Array.isArray(units) && units.length > 0) {
          units.forEach((unit, i) => {
            if (!unit) return;
            const x = Math.max(10, Math.min(390, unit.x || 100 + i * 50));
            const y = Math.max(10, Math.min(390, unit.y || 100 + i * 50));
            ctx.fillStyle = '#4da6ff';
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(unit.name?.charAt(0) || String(i + 1), x, y);
          });
        }
      } catch (err) {
        console.error('Error drawing units:', err);
      }

      // Draw enemies (red)
      try {
        const enemies = gameData?.enemies || [];
        if (Array.isArray(enemies) && enemies.length > 0) {
          enemies.forEach((enemy) => {
            if (!enemy) return;
            const x = Math.max(10, Math.min(390, enemy.x || Math.random() * 400));
            const y = Math.max(10, Math.min(390, enemy.y || Math.random() * 400));
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('E', x, y);
          });
        }
      } catch (err) {
        console.error('Error drawing enemies:', err);
      }

      animationId = requestAnimationFrame(drawCanvas);
    };

    animationId = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, gameData]);

  if (gameState === 'toc') {
    return (
      <div style={styles.tocContainer}>
        <div style={styles.tocHeader}>
          <h2>🎖️ Tactical Operations Center</h2>
          <div style={styles.gameId}>
            {gameId && `Game: ${gameId.substring(0, 8)}`}
          </div>
        </div>

        <div style={styles.tocLayout}>
          {/* Map */}
          <div style={styles.mapSection}>
            <h3>Battlefield Map</h3>
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              style={styles.canvas}
              onClick={(e) => {
                const rect = canvasRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                sendOrder('move', `(${Math.round(x)}, ${Math.round(y)})`);
              }}
            />
            <p style={styles.hint}>🔵 Blue = Units | 🔴 Red = Enemies | Click to order</p>
          </div>

          {/* Status & Orders */}
          <div style={styles.intelSection}>
            <div style={{padding: '15px', background: '#2a2a4e', borderRadius: '5px', marginBottom: '15px'}}>
              <h3 style={{margin: '0 0 10px 0'}}>📊 Status</h3>
              <p style={{margin: '5px 0'}}>Units: <strong>{(gameData && gameData.tocUnits && gameData.tocUnits.length) || 0}</strong></p>
              <p style={{margin: '5px 0'}}>Enemies: <strong>{(gameData && gameData.enemies && gameData.enemies.length) || 0}</strong></p>
              <p style={{margin: '5px 0'}}>Time: <strong>{(gameData && gameData.time) || 0}s</strong></p>
            </div>

            <div style={{padding: '15px', background: '#2a2a4e', borderRadius: '5px'}}>
              <h3 style={{margin: '0 0 10px 0'}}>⚙️ Commands</h3>
              <button onClick={() => sendOrder('advance', 'North')} style={styles.orderBtn}>↑ Advance North</button>
              <button onClick={() => sendOrder('hold', 'Position')} style={styles.orderBtn}>⏸ Hold Position</button>
              <button onClick={() => sendOrder('engage', 'Hostiles')} style={styles.orderBtn}>🎯 Engage</button>
              <button onClick={() => sendOrder('retreat', 'South')} style={styles.orderBtn}>↓ Retreat South</button>
            </div>
          </div>
        </div>

        <button onClick={() => onGameEnd()} style={styles.exitBtn}>Exit Game</button>
      </div>
    );
  }

  if (gameState === 'ground') {
    return (
      <div style={styles.groundContainer}>
        <div style={styles.groundHeader}>
          <h2>🪖 Ground Unit Operations</h2>
          <span style={styles.gameId}>Game: {gameId?.substring(0, 8)}</span>
        </div>

        <div style={styles.groundLayout}>
          {/* Ground View */}
          <div style={styles.groundView}>
            <h3>Field of View</h3>
            <div style={styles.terrainMap}>
              <div style={styles.positionMarker}>
                📍 You
              </div>
              {gameData?.enemies?.map((enemy, i) => (
                <div key={i} style={{ ...styles.enemyMarker, left: `${enemy.x}px`, top: `${enemy.y}px` }}>
                  🔴
                </div>
              ))}
            </div>
          </div>

          {/* Status & Orders */}
          <div style={styles.statusSection}>
            <div>
              <h3>📍 Position</h3>
              <p>X: {Math.round(gameData?.x || 0)}</p>
              <p>Y: {Math.round(gameData?.y || 0)}</p>
            </div>

            <div style={styles.orderHistory}>
              <h3>📬 Active Orders</h3>
              {orders.slice(-3).map((order, i) => (
                <div key={i} style={styles.orderItem}>
                  <strong>{order.order}</strong>
                  <br/>{order.target}
                  <br/><small>{order.received}</small>
                </div>
              ))}
            </div>

            <div>
              <h3>⚡ Actions</h3>
              <button onClick={() => updatePosition(gameData?.x + 20, gameData?.y)} style={styles.actionBtn}>→ Move East</button>
              <button onClick={() => updatePosition(gameData?.x - 20, gameData?.y)} style={styles.actionBtn}>← Move West</button>
              <button onClick={() => updatePosition(gameData?.x, gameData?.y + 20)} style={styles.actionBtn}>↓ Move South</button>
              <button onClick={() => updatePosition(gameData?.x, gameData?.y - 20)} style={styles.actionBtn}>↑ Move North</button>
            </div>
          </div>
        </div>

        <p style={styles.message}>{message}</p>
        <button onClick={() => onGameEnd()} style={styles.exitBtn}>Exit Game</button>
      </div>
    );
  }
}

const styles = {
  container: {
    padding: '40px',
    textAlign: 'center',
    minHeight: '100vh',
    background: '#1a1a2e',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
  },
  modeSelect: {
    display: 'flex',
    gap: '30px',
    justifyContent: 'center',
    marginTop: '40px',
  },
  tocBtn: {
    padding: '20px 40px',
    fontSize: '18px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  groundBtn: {
    padding: '20px 40px',
    fontSize: '18px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  tocContainer: {
    padding: '20px',
    background: '#1a1a2e',
    color: 'white',
    minHeight: '100vh',
    fontFamily: 'Arial, sans-serif',
  },
  tocHeader: {
    background: '#667eea',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameId: {
    background: 'rgba(255,255,255,0.2)',
    padding: '8px 15px',
    borderRadius: '5px',
    fontSize: '14px',
  },
  tocLayout: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
  },
  mapSection: {
    flex: 1,
    background: '#2a2a4e',
    padding: '20px',
    borderRadius: '10px',
  },
  canvas: {
    width: '100%',
    maxWidth: '400px',
    height: '400px',
    background: '#333',
    border: '2px solid #667eea',
    borderRadius: '5px',
    cursor: 'crosshair',
  },
  hint: {
    fontSize: '12px',
    color: '#aaa',
    marginTop: '10px',
  },
  intelSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  intelList: {
    background: '#2a2a4e',
    padding: '15px',
    borderRadius: '5px',
    maxHeight: '150px',
    overflow: 'auto',
  },
  intelItem: {
    background: '#3a3a5e',
    padding: '10px',
    borderRadius: '5px',
    marginBottom: '8px',
    fontSize: '14px',
  },
  orderPanel: {
    background: '#2a2a4e',
    padding: '15px',
    borderRadius: '5px',
  },
  orderBtn: {
    display: 'block',
    width: '100%',
    padding: '10px',
    marginTop: '8px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  groundContainer: {
    padding: '20px',
    background: '#1a1a2e',
    color: 'white',
    minHeight: '100vh',
    fontFamily: 'Arial, sans-serif',
  },
  groundHeader: {
    background: '#f44336',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groundLayout: {
    display: 'flex',
    gap: '20px',
  },
  groundView: {
    flex: 1,
    background: '#2a2a4e',
    padding: '20px',
    borderRadius: '10px',
  },
  terrainMap: {
    position: 'relative',
    width: '100%',
    height: '400px',
    background: '#3a3a5e',
    borderRadius: '5px',
    overflow: 'hidden',
  },
  positionMarker: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '24px',
  },
  enemyMarker: {
    position: 'absolute',
    fontSize: '20px',
  },
  statusSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  orderHistory: {
    background: '#2a2a4e',
    padding: '15px',
    borderRadius: '5px',
  },
  orderItem: {
    background: '#3a3a5e',
    padding: '10px',
    borderRadius: '5px',
    marginTop: '8px',
    fontSize: '12px',
  },
  actionBtn: {
    display: 'block',
    width: '100%',
    padding: '10px',
    marginTop: '8px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  message: {
    marginTop: '20px',
    padding: '10px',
    background: '#3a3a5e',
    borderRadius: '5px',
    minHeight: '20px',
  },
  exitBtn: {
    marginTop: '20px',
    padding: '12px 30px',
    background: '#666',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};
