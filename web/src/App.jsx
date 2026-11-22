import { useCallback, useEffect, useState } from 'react';
import { api, DEMO } from './api.js';
import { Icon, Toaster } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Feed from './pages/Feed.jsx';
import Reels from './pages/Reels.jsx';
import Fila from './pages/Fila.jsx';
import Perfil from './pages/Perfil.jsx';

const TABS = [
  { id: 'vagas', label: 'Vagas', icon: Icon.list },
  { id: 'fila', label: 'Fila', icon: Icon.queue },
  { id: 'perfil', label: 'Perfil', icon: Icon.user },
];

const hash = () => location.hash.replace(/^#\/?/, '');
const tabFromHash = () => (hash() === 'reels' ? 'vagas' : TABS.some((t) => t.id === hash()) ? hash() : 'vagas');
const savedMode = () => {
  if (hash() === 'reels') return 'reels';
  try { return localStorage.getItem('vagasModo') === 'reels' ? 'reels' : 'lista'; } catch { return 'lista'; }
};

export default function App() {
  const [me, setMe] = useState(undefined);
  const [tab, setTab] = useState(tabFromHash);
  const [stats, setStats] = useState(null);
  const [mode, setModeState] = useState(savedMode);
  const setMode = (m) => { setModeState(m); try { localStorage.setItem('vagasModo', m); } catch { /* ok */ } };

  useEffect(() => { api('/me').then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => {
    const on = () => { setTab(tabFromHash()); if (hash() === 'reels') setModeState('reels'); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const refreshStats = useCallback(() => api('/stats').then(setStats).catch(() => {}), []);
  useEffect(() => {
    if (!me) return;
    refreshStats();
    const h = setInterval(refreshStats, DEMO ? 2000 : 15000);
    return () => clearInterval(h);
  }, [me, refreshStats]);

  if (me === undefined) return null;
  if (!me) return <Login onLogin={setMe} />;

  const go = (id) => {
    if (id === 'reels') { setMode('reels'); id = 'vagas'; }
    location.hash = `#${id}`;
    setTab(id);
  };
  const novas = stats?.novasVisiveis ?? 0;
  const need = stats?.applications?.precisa_voce || 0;

  return (
    <div className="shell">
      {DEMO && (
        <div className="demo-bar">
          <b>Demonstração</b> com vagas reais buscadas no LinkedIn. O robô é simulado e nada é salvo.
        </div>
      )}
      {tab === 'vagas' && mode === 'lista' && <Feed stats={stats} onChange={refreshStats} go={go} setMode={setMode} />}
      {tab === 'vagas' && mode === 'reels' && <Reels onChange={refreshStats} go={go} setMode={setMode} />}
      {tab === 'fila' && <Fila onChange={refreshStats} />}
      {tab === 'perfil' && <Perfil stats={stats} onChange={refreshStats} />}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
            {t.icon()}
            {t.label}
            {t.id === 'vagas' && novas > 0 && <span className="badge">{novas > 99 ? '99+' : novas}</span>}
            {t.id === 'fila' && need > 0 && <span className="badge bad">{need}</span>}
          </button>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
