import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const action = mode === 'signin' ? signIn : signUp;
    const { error } = await action(email, password);
    if (error) return setError(error.message);
    if (mode === 'signup') return setInfo('Check your email to confirm your account.');
    navigate(params.get('next') || '/');
  }

  return (
    <div style={{ maxWidth: 360, margin: '60px auto', padding: 24 }}>
      <h2>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {info && <p style={{ color: '#0a7d2e' }}>{info}</p>}
      <form onSubmit={handleSubmit}>
        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        <button type="submit" style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#111', color: '#fff' }}>
          {mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>
      </form>
      <p style={{ marginTop: 12, fontSize: 14 }}>
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={{ border: 'none', background: 'none', color: '#111', textDecoration: 'underline', cursor: 'pointer' }}>
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}

const input = { width: '100%', padding: 10, margin: '8px 0', border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' };
