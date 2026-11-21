import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ago } from '../api.js';
import { Icon, JobTags, Reasons, Score, toast } from '../components/ui.jsx';
import JobSheet from './JobSheet.jsx';

const FILTERS = [
  { id: '', label: 'Todas' },
  { id: 'remoto', label: 'Remoto' },
  { id: 'hibrido', label: 'Híbrido' },
  { id: 'presencial', label: 'Presencial' },
];

export default function Feed({ stats, onChange, go }) {
  const [view, setView] = useState('nova');
  const [workplace, setWorkplace] = useState('');
  const [text, setText] = useState('');
  const [showBlocked, setShowBlocked] = useState(false);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [collecting, setCollecting] = useState(false);
  const timer = useRef();

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ status: view, workplace, q: text, blocked: showBlocked || view !== 'nova' ? '1' : '0', limit: '150' });
    setData(await api(`/jobs?${qs}`));
  }, [view, workplace, text, showBlocked]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, text ? 250 : 0);
  }, [load, text]);

  useEffect(() => { setCollecting(!!stats?.collecting); }, [stats?.collecting]);
  useEffect(() => { if (!collecting) load(); }, [collecting]); // recarrega quando a busca termina

  const move = async (ids, status, label) => {
    const before = view;
    await api('/jobs/status', { method: 'POST', body: { ids, status } });
    setData((d) => ({ total: d.total - ids.length, items: d.items.filter((j) => !ids.includes(j.id)) }));
    onChange();
    toast(label, async () => {
      await api('/jobs/status', { method: 'POST', body: { ids, status: before } });
      load();
      onChange();
    });
  };

  const collect = async () => {
    setCollecting(true);
    await api('/collect', { method: 'POST', body: {} });
    toast('Buscando vagas novas. Isso leva alguns minutos.');
    onChange();
  };

  const items = data?.items || [];
  const top = items.filter((j) => j.score >= 70 && !j.block);
  const last = stats?.lastCollect?.at;

  return (
    <>
      <div className="topbar">
        <h1>Vagas</h1>
        <button className="btn sm" onClick={collect} disabled={collecting}>
          {collecting ? <><span className="spin" /> Buscando</> : <>{Icon.refresh(16)} Buscar agora</>}
        </button>
      </div>
      <main className="main">
        <div className="wrap">
          <div className="chips">
            <button className={`chip ${view === 'nova' ? 'on' : ''}`} onClick={() => setView('nova')}>Novas{stats?.jobs?.nova ? ` · ${stats.jobs.nova}` : ''}</button>
            <button className={`chip ${view === 'descartada' ? 'on' : ''}`} onClick={() => setView('descartada')}>Descartadas</button>
            <span style={{ width: 1, background: 'var(--line)', flex: 'none' }} />
            {FILTERS.map((f) => (
              <button key={f.id} className={`chip ${workplace === f.id ? 'on' : ''}`} onClick={() => setWorkplace(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="toolbar">
            <input className="input" placeholder="Buscar por cargo ou empresa" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {data && (
            <div className="count">
              <span>
                {data.total} vaga{data.total === 1 ? '' : 's'}
                {last && <> · última busca {ago(last)}</>}
              </span>
              {view === 'nova' && top.length > 1 && (
                <button className="btn sm" onClick={() => move(top.map((j) => j.id), 'triagem', `${top.length} vagas foram para a triagem`)}>
                  {Icon.plus(16)} {top.length} melhores para triagem
                </button>
              )}
            </div>
          )}

          {data && !items.length && (
            <div className="empty">
              {view === 'nova' ? (
                <>
                  <h2>{collecting ? 'Procurando vagas…' : 'Nada novo por aqui'}</h2>
                  <div>{collecting ? 'As vagas aparecem aqui assim que a busca terminar.' : 'Rode uma busca agora ou ajuste os termos no Perfil.'}</div>
                  {stats?.jobs?.triagem > 0 && <button className="btn primary" onClick={() => go('reels')}>Abrir triagem ({stats.jobs.triagem})</button>}
                </>
              ) : (
                <h2>Nenhuma vaga descartada</h2>
              )}
            </div>
          )}

          <div className="list">
            {items.map((j) => (
              <article key={j.id} className="job">
                <Score v={j.score} />
                <div className="body" onClick={() => setOpen(j.id)}>
                  <h3>{j.title}</h3>
                  <div className="meta">{j.company}{j.location ? ` · ${j.location}` : ''}</div>
                  <div className="tags"><JobTags job={j} /></div>
                  <Reasons reasons={j.reasons.filter((r) => (j.block ? r.t === '-' : r.t === '+'))} max={2} />
                </div>
                <div className="acts">
                  {view === 'nova' ? (
                    <>
                      <button className="icon-btn" title="Mandar para a triagem" onClick={() => move([j.id], 'triagem', 'Foi para a triagem')} style={{ color: 'var(--accent)' }}>{Icon.plus()}</button>
                      <button className="icon-btn" title="Descartar" onClick={() => move([j.id], 'descartada', 'Vaga descartada')} style={{ color: 'var(--muted)' }}>{Icon.x(18)}</button>
                    </>
                  ) : (
                    <button className="icon-btn" title="Restaurar" onClick={() => move([j.id], 'nova', 'Vaga restaurada')}>{Icon.undo()}</button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {view === 'nova' && data && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn ghost sm" onClick={() => setShowBlocked((v) => !v)}>
                {showBlocked ? 'Esconder vagas que não batem com o perfil' : 'Mostrar também as que não batem com o perfil'}
              </button>
            </div>
          )}
        </div>
      </main>
      {open && (
        <JobSheet
          id={open}
          onClose={() => setOpen(null)}
          actions={(job) =>
            view === 'nova' ? (
              <>
                <button className="btn primary" onClick={() => { move([job.id], 'triagem', 'Foi para a triagem'); setOpen(null); }}>{Icon.plus(18)} Triagem</button>
                <button className="btn" onClick={() => { move([job.id], 'descartada', 'Vaga descartada'); setOpen(null); }}>Descartar</button>
              </>
            ) : (
              <button className="btn" onClick={() => { move([job.id], 'nova', 'Vaga restaurada'); setOpen(null); }}>Restaurar</button>
            )
          }
        />
      )}
    </>
  );
}
