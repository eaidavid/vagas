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
  { id: 'reels', label: 'Triagem', icon: Icon.reels },
  { id: 'fila', label: 'Fila', icon: Icon.queue },
  { id: 'perfil', label: 'Perfil', icon: Icon.user },
];

const tabFromHash = () => {
  const h = location.hash.replace(/^#\/?/, '');
  return TABS.some((t) => t.id === h) ? h : 'vagas';
};

export default function App() {
  const [me, setMe] = useState(undefined);
  const [tab, setTab] = useState(tabFromHash);
  const [stats, setStats] = useState(null);

  useEffect(() => { api('/me').then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => {
    const on = () => setTab(tabFromHash());
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

  const go = (id) => { location.hash = `#${id}`; setTab(id); };
  const novas = stats?.novasVisiveis ?? 0;
  const need = stats?.applications?.precisa_voce || 0;

  return (
    <div className="shell">
      {DEMO && (
        <div className="demo-bar">
          <b>Demonstração</b> com vagas reais buscadas no LinkedIn. O robô é simulado e nada é salvo.
        </div>
      )}
      {tab === 'vagas' && <Feed stats={stats} onChange={refreshStats} go={go} />}
      {tab === 'reels' && <Reels onChange={refreshStats} go={go} />}
      {tab === 'fila' && <Fila onChange={refreshStats} />}
      {tab === 'perfil' && <Perfil stats={stats} onChange={refreshStats} />}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
            {t.icon()}
            {t.label}
            {t.id === 'reels' && novas > 0 && <span className="badge">{novas > 99 ? '99+' : novas}</span>}
            {t.id === 'fila' && need > 0 && <span className="badge bad">{need}</span>}
          </button>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
