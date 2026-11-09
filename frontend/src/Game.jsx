import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://callsign-protocol.onrender.com/api';
const GRID_SIZE = 10;

export default function Game({ user, onGameEnd }) {
  const [gameState, setGameState] = useState('squad-setup'); // squad-setup, playing, ended
  const [squad, setSquad] = useState(null);
  const [turn, setTurn] = useState(1);
  const [gameBoard, setGameBoard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [matchStats, setMatchStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // Initialize game board
  const initializeBoard = (squadSetup) => {
    const board = {
      squad: {
        positions: [
          { id: 'sniper', name: 'Sniper', x: 1, y: 1, role: 'Sniper', kills: 0, status: 'alive' },
          { id: 'rifleman', name: 'Rifleman', x: 2, y: 1, role: 'Rifleman', kills: 0, status: 'alive' },
          { id: 'medic', name: 'Medic', x: 1, y: 2, role: 'Medic', kills: 0, status: 'alive' },
        ],
      },
      enemies: [
        { id: 'enemy1', x: 8, y: 8, alive: true, revealed: false },
        { id: 'enemy2', x: 7, y: 9, alive: true, revealed: false },
        { id: 'enemy3', x: 9, y: 7, alive: true, revealed: false },
      ],
      turn: 1,
      maxTurns: 4,
    };
    setGameBoard(board);
  };

  const startGame = (squadSetup) => {
    setSquad(squadSetup);
    initializeBoard(squadSetup);
    setGameState('playing');
    setTurn(1);
  };

  const moveUnit = (unitId, direction) => {
    if (!gameBoard) return;

    const unit = gameBoard.squad.positions.find(u => u.id === unitId);
    if (!unit) return;

    let newX = unit.x, newY = unit.y;
    switch (direction) {
      case 'up': newY = Math.max(0, newY - 1); break;
      case 'down': newY = Math.min(GRID_SIZE - 1, newY + 1); break;
      case 'left': newX = Math.max(0, newX - 1); break;
      case 'right': newX = Math.min(GRID_SIZE - 1, newX + 1); break;
      default: break;
    }

    const updatedBoard = { ...gameBoard };
    const unitIndex = updatedBoard.squad.positions.findIndex(u => u.id === unitId);
    updatedBoard.squad.positions[unitIndex].x = newX;
    updatedBoard.squad.positions[unitIndex].y = newY;

    // Check if unit spots enemies
    updatedBoard.enemies.forEach(enemy => {
      const distance = Math.abs(enemy.x - newX) + Math.abs(enemy.y - newY);
      if (distance <= 3) enemy.revealed = true;
    });

    setGameBoard(updatedBoard);
  };

  const attackUnit = (unitId, targetEnemyId) => {
    if (!gameBoard) return;

    const unit = gameBoard.squad.positions.find(u => u.id === unitId);
    const enemy = gameBoard.enemies.find(e => e.id === targetEnemyId);

    if (!unit || !enemy || !enemy.alive) return;

    const distance = Math.abs(enemy.x - unit.x) + Math.abs(enemy.y - unit.y);
    const hitChance = Math.max(0.3, 1 - distance * 0.15); // Distance reduces accuracy
    const hit = Math.random() < hitChance;

    const updatedBoard = { ...gameBoard };
    if (hit) {
      const enemyIndex = updatedBoard.enemies.findIndex(e => e.id === targetEnemyId);
      updatedBoard.enemies[enemyIndex].alive = false;
      updatedBoard.enemies[enemyIndex].revealed = true;
      unit.kills += 1;
    } else {
      enemy.revealed = true; // Shot reveals enemy
    }

    setGameBoard(updatedBoard);
  };

  const endTurn = async () => {
    if (!gameBoard) return;

    const newTurn = turn + 1;
    setTurn(newTurn);

    if (newTurn > gameBoard.maxTurns) {
      // Game over
      await endMatch();
    } else {
      // Simulate enemy movement/actions
      const updatedBoard = { ...gameBoard };
      updatedBoard.enemies.forEach(enemy => {
        if (enemy.alive && Math.random() > 0.5) {
          enemy.x += Math.random() > 0.5 ? 1 : -1;
          enemy.y += Math.random() > 0.5 ? 1 : -1;
          enemy.x = Math.max(0, Math.min(GRID_SIZE - 1, enemy.x));
          enemy.y = Math.max(0, Math.min(GRID_SIZE - 1, enemy.y));
        }
      });
      setGameBoard(updatedBoard);
    }
  };

  const endMatch = async () => {
    setLoading(true);
    try {
      const stats = {
        total_kills: gameBoard.squad.positions.reduce((sum, u) => sum + u.kills, 0),
        total_deaths: gameBoard.squad.positions.filter(u => u.status === 'dead').length,
        total_assists: 0,
        total_matches: 1,
      };

      // Record match to backend
      const token = localStorage.getItem('authToken');
      const userId = localStorage.getItem('userId');

      // Create match
      const matchRes = await axios.post(`${API_BASE}/matches`, {
        map_name: 'Training Grounds',
        game_mode: 'Tactical',
        duration_seconds: turn * 60,
        team_score_1: stats.total_kills,
        team_score_2: 0,
        winner: 'team_1',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Record player stats
      if (matchRes.data.id) {
        await axios.post(`${API_BASE}/matches/${matchRes.data.id}/players`, {
          user_id: userId,
          team: 'team_1',
          role: 'Squad Lead',
          kills: stats.total_kills,
          deaths: stats.total_deaths,
          assists: stats.total_assists,
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      setMatchStats(stats);
      setGameState('ended');
    } catch (err) {
      console.error('Error ending match:', err);
    } finally {
      setLoading(false);
    }
  };

  if (gameState === 'squad-setup') {
    return <SquadSetup onStart={startGame} />;
  }

  if (!gameBoard) return <div style={styles.loading}>Initializing game...</div>;

  const aliveEnemies = gameBoard.enemies.filter(e => e.alive).length;

  return (
    <div style={styles.gameContainer}>
      <div style={styles.gameHeader}>
        <h2>Tactical Match</h2>
        <div style={styles.gameInfo}>
          <span>Turn: {turn}/{gameBoard.maxTurns}</span>
          <span>Enemies Alive: {aliveEnemies}</span>
          <span>Squad Health: {gameBoard.squad.positions.filter(u => u.status === 'alive').length}/3</span>
        </div>
      </div>

      <div style={styles.gameContent}>
        {/* Tactical Grid */}
        <div style={styles.gridContainer}>
          <div style={styles.grid}>
            {Array.from({ length: GRID_SIZE }).map((_, y) =>
              Array.from({ length: GRID_SIZE }).map((_, x) => {
                const squad = gameBoard.squad.positions.find(u => u.x === x && u.y === y);
                const enemy = gameBoard.enemies.find(e => e.x === x && e.y === y);
                const isSelected = selectedUnit?.id === squad?.id;

                return (
                  <div
                    key={`${x}-${y}`}
                    style={{
                      ...styles.cell,
                      background: squad
                        ? isSelected
                          ? '#4CAF50'
                          : '#2196F3'
                        : enemy?.alive && enemy.revealed
                        ? '#f44336'
                        : enemy?.alive
                        ? '#f9f9f9'
                        : '#f9f9f9',
                      border: isSelected ? '3px solid gold' : '1px solid #ddd',
                      cursor: squad ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (squad) setSelectedUnit(squad);
                    }}
                    title={squad ? `${squad.name} (${squad.role})` : enemy?.alive ? 'Enemy' : ''}
                  >
                    {squad && <span style={styles.cellText}>{squad.name[0]}</span>}
                    {enemy?.alive && enemy.revealed && <span style={styles.cellText}>E</span>}
                    {enemy?.alive && !enemy.revealed && <span style={styles.cellText}>?</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div style={styles.controlPanel}>
          {selectedUnit ? (
            <>
              <h3>{selectedUnit.name}</h3>
              <p>Role: {selectedUnit.role}</p>
              <p>Kills: {selectedUnit.kills}</p>
              <div style={styles.buttonGroup}>
                <button onClick={() => moveUnit(selectedUnit.id, 'up')} style={styles.btn}>↑ Move Up</button>
                <button onClick={() => moveUnit(selectedUnit.id, 'down')} style={styles.btn}>↓ Move Down</button>
                <button onClick={() => moveUnit(selectedUnit.id, 'left')} style={styles.btn}>← Move Left</button>
                <button onClick={() => moveUnit(selectedUnit.id, 'right')} style={styles.btn}>→ Move Right</button>
              </div>
              <div style={styles.buttonGroup}>
                {gameBoard.enemies.filter(e => e.alive && e.revealed).map(enemy => (
                  <button
                    key={enemy.id}
                    onClick={() => {
                      attackUnit(selectedUnit.id, enemy.id);
                      setSelectedUnit(null);
                    }}
                    style={styles.attackBtn}
                  >
                    🎯 Attack Enemy
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>Select a unit to command</p>
          )}
          <button onClick={endTurn} style={styles.endTurnBtn} disabled={loading}>
            {loading ? 'Processing...' : `End Turn (${turn}/${gameBoard.maxTurns})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SquadSetup({ onStart }) {
  const [squad, setSquad] = useState([
    { id: 'sniper', name: 'Sniper', role: 'Sniper' },
    { id: 'rifleman', name: 'Rifleman', role: 'Rifleman' },
    { id: 'medic', name: 'Medic', role: 'Medic' },
  ]);

  return (
    <div style={styles.setupContainer}>
      <h2>Squad Setup</h2>
      <p>Your squad is ready for deployment:</p>
      <div style={styles.squadList}>
        {squad.map(unit => (
          <div key={unit.id} style={styles.squadCard}>
            <div style={styles.unitIcon}>
              {unit.role === 'Sniper' && '🔍'}
              {unit.role === 'Rifleman' && '🎯'}
              {unit.role === 'Medic' && '🏥'}
            </div>
            <div>
              <h4>{unit.name}</h4>
              <p>{unit.role}</p>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => onStart(squad)} style={styles.startBtn}>
        Start Mission
      </button>
    </div>
  );
}

const styles = {
  gameContainer: {
    padding: '20px',
    background: '#f5f5f5',
    minHeight: '100vh',
    fontFamily: 'Arial, sans-serif',
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
  gameInfo: {
    display: 'flex',
    gap: '20px',
    fontSize: '14px',
  },
  gameContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: '20px',
  },
  gridContainer: {
    background: 'white',
    padding: '20px',
    borderRadius: '5px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(10, 1fr)`,
    gap: '2px',
    backgroundColor: '#f0f0f0',
    padding: '10px',
    borderRadius: '5px',
  },
  cell: {
    width: '50px',
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
    borderRadius: '3px',
  },
  cellText: {
    color: 'white',
    fontWeight: 'bold',
  },
  controlPanel: {
    background: 'white',
    padding: '20px',
    borderRadius: '5px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    maxHeight: '500px',
    overflow: 'auto',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '15px',
  },
  btn: {
    padding: '10px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  attackBtn: {
    padding: '10px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  endTurnBtn: {
    width: '100%',
    padding: '12px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginTop: '20px',
    fontSize: '16px',
  },
  setupContainer: {
    maxWidth: '600px',
    margin: '50px auto',
    background: 'white',
    padding: '30px',
    borderRadius: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  squadList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    margin: '20px 0',
  },
  squadCard: {
    display: 'flex',
    gap: '15px',
    padding: '15px',
    background: '#f9f9f9',
    borderRadius: '5px',
    border: '1px solid #eee',
    alignItems: 'center',
  },
  unitIcon: {
    fontSize: '32px',
  },
  startBtn: {
    padding: '12px 30px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '18px',
    color: '#667eea',
  },
};
