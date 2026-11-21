import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api('/login', { method: 'POST', body: { email, password } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Vagas</h1>
        <p>Suas vagas, sua triagem, seu robô.</p>
        <label className="label">E-mail</label>
        <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label">Senha</label>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn primary" disabled={busy}>{busy ? <span className="spin" /> : 'Entrar'}</button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
