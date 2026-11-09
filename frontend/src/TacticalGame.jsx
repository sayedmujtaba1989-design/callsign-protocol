import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_BASE = 'https://callsign-protocol.onrender.com';

export default function TacticalGame({ user, onGameEnd }) {
  const [gameState, setGameState] = useState('mode-select'); // mode-select, toc, ground
  const [gameId, setGameId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [roleState, setRoleState] = useState('TOC'); // TOC or GROUND
  const [gameData, setGameData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);

  useEffect(() => {
    const newSocket = io(API_BASE, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    newSocket.on('connect', () => {
      console.log('Connected to tactical server');
    });

    newSocket.on('tactical:gameCreated', (data) => {
      setGameId(data.gameId);
      setGameState('toc');
      setRoleState('TOC');
      setGameData({ units: [], enemies: [], intel: [] });
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
      setGameData(prev => ({
        ...prev,
        groundUnits: data.groundUnits,
        enemies: data.enemies,
        time: data.time
      }));
    });

    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  const createGame = () => {
    if (socket) {
      socket.emit('tactical:createGame', { scenario: 'patrol' });
    }
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

  if (gameState === 'toc') {
    return (
      <div style={styles.tocContainer}>
        <div style={styles.tocHeader}>
          <h2>🎖️ Tactical Operations Center</h2>
          <span style={styles.gameId}>Game: {gameId?.substring(0, 8)}</span>
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
            <p style={styles.hint}>Click map to send move orders</p>
          </div>

          {/* Intel & Orders */}
          <div style={styles.intelSection}>
            <div>
              <h3>📊 Unit Reports</h3>
              <div style={styles.intelList}>
                {gameData?.intel?.slice(-3).map((report, i) => (
                  <div key={i} style={styles.intelItem}>
                    <strong>{report.unit}</strong>
                    <br/>Position: ({Math.round(report.x)}, {Math.round(report.y)})
                    <br/><small>{report.status}</small>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.orderPanel}>
              <h3>⚙️ Commands</h3>
              <button onClick={() => sendOrder('advance', 'North')} style={styles.orderBtn}>↑ Advance North</button>
              <button onClick={() => sendOrder('hold', 'Position')} style={styles.orderBtn}>⏸ Hold Position</button>
              <button onClick={() => sendOrder('engage', 'Hostiles')} style={styles.orderBtn}>🎯 Engage Enemies</button>
              <button onClick={() => sendOrder('retreat', 'South')} style={styles.orderBtn}>↓ Retreat South</button>
            </div>
          </div>
        </div>

        <p style={styles.message}>{message}</p>
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
