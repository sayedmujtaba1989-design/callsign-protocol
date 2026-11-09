import React, { useState, useEffect } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import Game from './Game';
import TacticalGame from './TacticalGame';
import AICommandSimulator from './AICommandSimulator';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, game, tactical, or aicommand
  const [gameMode, setGameMode] = useState(null); // 'action', 'tactical', or 'aicommand'

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');

    if (token && userId && username) {
      setUser({ token, userId, username });
    }
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    setUser(null);
  };

  const handlePlayGame = (mode = 'action') => {
    setGameMode(mode);
    setView('game');
  };

  const handleGameEnd = () => {
    setView('dashboard');
    setGameMode(null);
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (view === 'game') {
    if (gameMode === 'tactical') {
      return <TacticalGame user={user} onGameEnd={handleGameEnd} />;
    }
    if (gameMode === 'aicommand') {
      return <AICommandSimulator user={user} onGameEnd={handleGameEnd} />;
    }
    return <Game user={user} onGameEnd={handleGameEnd} />;
  }

  return (
    <Dashboard user={user} onLogout={handleLogout} onPlayGame={handlePlayGame} />
  );
}
