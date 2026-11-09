import React, { useState, useEffect } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import Game from './Game';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard or game

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

  const handlePlayGame = () => {
    setView('game');
  };

  const handleGameEnd = () => {
    setView('dashboard');
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return view === 'game' ? (
    <Game user={user} onGameEnd={handleGameEnd} />
  ) : (
    <Dashboard user={user} onLogout={handleLogout} onPlayGame={handlePlayGame} />
  );
}
