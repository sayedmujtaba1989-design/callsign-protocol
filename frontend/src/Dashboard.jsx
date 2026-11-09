import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://callsign-protocol.onrender.com/api';

export default function Dashboard({ user, onLogout, onPlayGame }) {
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('authToken');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const statsRes = await axios.get(`${API_BASE}/players/stats`, { headers });
      setStats(statsRes.data);

      const leaderboardRes = await axios.get(`${API_BASE}/leaderboard`);
      setLeaderboard(leaderboardRes.data);

      const rankingsRes = await axios.get(`${API_BASE}/rankings`);
      setRankings(rankingsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Callsign Protocol</h1>
        <div style={styles.userInfo}>
          <span>{user?.username}</span>
          <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={styles.tabs}>
        {['stats', 'leaderboard', 'rankings', 'play', 'tactical', 'aicommand'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              if (tab === 'play') {
                onPlayGame();
              } else if (tab === 'tactical') {
                onPlayGame && onPlayGame('tactical');
              } else if (tab === 'aicommand') {
                onPlayGame && onPlayGame('aicommand');
              } else {
                setActiveTab(tab);
              }
            }}
            style={{
              ...styles.tabBtn,
              background: activeTab === tab ? '#667eea' : '#ddd',
              color: activeTab === tab ? 'white' : '#333',
            }}
          >
            {tab === 'play' ? '🎮 Action' : tab === 'tactical' ? '🎖️ Tactical' : tab === 'aicommand' ? '🤖 AI Command' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === 'stats' && stats && (
          <div style={styles.statsBox}>
            <h2>Your Stats</h2>
            <div style={styles.statGrid}>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Total Kills</div>
                <div style={styles.statValue}>{stats.total_kills}</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Total Deaths</div>
                <div style={styles.statValue}>{stats.total_deaths}</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Total Assists</div>
                <div style={styles.statValue}>{stats.total_assists}</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Total Matches</div>
                <div style={styles.statValue}>{stats.total_matches}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div style={styles.tableBox}>
            <h2>Leaderboard (Top Killers)</h2>
            {leaderboard.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Kills</th>
                    <th>Deaths</th>
                    <th>Assists</th>
                    <th>Matches</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((player, i) => (
                    <tr key={player.id}>
                      <td>{i + 1}</td>
                      <td>{player.username}</td>
                      <td>{player.total_kills}</td>
                      <td>{player.total_deaths}</td>
                      <td>{player.total_assists}</td>
                      <td>{player.total_matches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p>No data yet</p>}
          </div>
        )}

        {activeTab === 'rankings' && (
          <div style={styles.tableBox}>
            <h2>Rankings (K/D Ratio)</h2>
            {rankings.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>K/D Ratio</th>
                    <th>Kills</th>
                    <th>Avg K/M</th>
                    <th>Matches</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((player, i) => (
                    <tr key={player.id}>
                      <td>{i + 1}</td>
                      <td>{player.username}</td>
                      <td style={{fontWeight: 'bold', color: '#667eea'}}>{player.kd_ratio}</td>
                      <td>{player.total_kills}</td>
                      <td>{player.avg_kills_per_match}</td>
                      <td>{player.total_matches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p>No data yet</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f5f5f5',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    background: '#667eea',
    color: 'white',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 'bold',
  },
  userInfo: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
  },
  logoutBtn: {
    padding: '8px 16px',
    background: 'white',
    color: '#667eea',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  tabs: {
    display: 'flex',
    gap: '10px',
    padding: '20px',
    justifyContent: 'center',
  },
  tabBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s',
  },
  content: {
    maxWidth: '1200px',
    margin: '20px auto',
    padding: '20px',
  },
  statsBox: {
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginTop: '20px',
  },
  stat: {
    background: '#f9f9f9',
    padding: '15px',
    borderRadius: '5px',
    textAlign: 'center',
    border: '1px solid #eee',
  },
  statLabel: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#667eea',
  },
  tableBox: {
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '15px',
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
