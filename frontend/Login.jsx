import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = 'https://callsign-protocol.onrender.com/api';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let endpoint = isRegister ? '/auth/register' : '/auth/login';
      let payload = isRegister
        ? { username, email, password }
        : { username, password };

      const response = await axios.post(`${API_BASE}${endpoint}`, payload);

      if (response.data.token) {
        // Store token in localStorage
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('userId', response.data.playerId);
        localStorage.setItem('username', response.data.username);

        // Callback to parent
        onLoginSuccess({
          token: response.data.token,
          playerId: response.data.playerId,
          username: response.data.username
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Callsign Protocol</h1>
        <p style={styles.subtitle}>{isRegister ? 'Create Account' : 'Login'}</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            required
          />

          {isRegister && (
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
            />
          )}

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
          />

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Loading...' : (isRegister ? 'Register' : 'Login')}
          </button>
        </form>

        <p style={styles.toggle}>
          {isRegister ? 'Have an account? ' : "Don't have an account? "}
          <button
            onClick={() => setIsRegister(!isRegister)}
            style={styles.toggleBtn}
          >
            {isRegister ? 'Login' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    background: 'white',
    padding: '40px',
    borderRadius: '10px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    margin: '0 0 20px 0',
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  input: {
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    outline: 'none',
  },
  button: {
    padding: '12px',
    fontSize: '16px',
    fontWeight: 'bold',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'background 0.3s',
  },
  error: {
    background: '#fee',
    color: '#c00',
    padding: '10px',
    borderRadius: '5px',
    marginBottom: '15px',
    fontSize: '14px',
  },
  toggle: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    cursor: 'pointer',
    fontWeight: 'bold',
    textDecoration: 'underline',
  },
};
