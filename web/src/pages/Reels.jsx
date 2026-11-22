import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ClaudeBox, Icon, JobTags, Logo, ModeSwitch, Reasons, Score, toast } from '../components/ui.jsx';

const THRESHOLD = 110;

export default function Reels({ onChange, go, setMode }) {
  const [items, setItems] = useState(null);
  const [done, setDone] = useState(0);
  const [drag, setDrag] = useState({ dx: 0, active: false });
  const [leaving, setLeaving] = useState(null); // 'yes' | 'no' | 'later'
  const start = useRef(null);
  const busy = useRef(false);

  const load = useCallback(() => api('/triagem').then(setItems), []);
  useEffect(() => { load(); }, [load]);

  const job = items?.[0];
  const next = items?.[1];

  const decide = useCallback(async (kind) => {
    if (!job || busy.current) return;
    busy.current = true;
    setLeaving(kind);
    const current = job;
    setTimeout(async () => {
      setItems((list) => (kind === 'later' ? [...list.slice(1), list[0]] : list.slice(1)));
      setLeaving(null);
      setDrag({ dx: 0, active: false });
      busy.current = false;
      if (kind !== 'later') setDone((d) => d + 1);
      try {
        if (kind === 'yes') {
          await api(`/jobs/${current.id}/minha`, { method: 'POST' });
          toast('É sua! Foi para a fila de aplicação', async () => {
            await api(`/jobs/${current.id}/desfazer-minha`, { method: 'POST' });
            setItems((l) => [current, ...l]);
            setDone((d) => d - 1);
            onChange();
          });
        } else if (kind === 'no') {
          await api('/jobs/status', { method: 'POST', body: { ids: [current.id], status: 'descartada' } });
          toast('Descartada', async () => {
            await api('/jobs/status', { method: 'POST', body: { ids: [current.id], status: 'nova' } });
            setItems((l) => [current, ...l]);
            setDone((d) => d - 1);
            onChange();
          });
        } else {
          await api(`/triagem/${current.id}/depois`, { method: 'POST' });
        }
      } catch (e) {
        toast(`Não deu certo: ${e.message}`);
        load();
      }
      onChange();
    }, 220);
  }, [job, onChange, load]);

  useEffect(() => {
    const k = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') decide('yes');
      if (e.key === 'ArrowLeft') decide('no');
      if (e.key === 'ArrowDown') decide('later');
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [decide]);

  const onDown = (e) => {
    if (e.target.closest('a, button')) return;
    start.current = { x: e.clientX, y: e.clientY, locked: null };
  };
  const onMove = (e) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.locked === 'x') e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (s.locked === 'x') setDrag({ dx, active: true });
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.locked !== 'x') return;
    if (drag.dx > THRESHOLD) decide('yes');
    else if (drag.dx < -THRESHOLD) decide('no');
    else setDrag({ dx: 0, active: false });
  };

  if (!items) return <main className="main full" />;

  const total = items.length + done;
  let transform = `translateX(${drag.dx}px) rotate(${drag.dx / 22}deg)`;
  if (leaving === 'yes') transform = 'translateX(130%) rotate(18deg)';
  if (leaving === 'no') transform = 'translateX(-130%) rotate(-18deg)';
  if (leaving === 'later') transform = 'translateY(-110%) scale(0.9)';
  const yes = Math.max(0, Math.min(1, drag.dx / THRESHOLD));
  const no = Math.max(0, Math.min(1, -drag.dx / THRESHOLD));

  return (
    <main className="main full">
      <div className="reels">
        <div className="reels-top">
          <h1>Vagas</h1>
          <span className="muted small">{items.length ? `${items.length} nova${items.length > 1 ? 's' : ''}` : ''}</span>
        </div>
        <div style={{ padding: '0 4px 10px' }}><ModeSwitch mode="reels" setMode={setMode} /></div>
        {total > 0 && total <= 40 && (
          <div className="progress">{Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? 'done' : ''} />)}</div>
        )}

        {!job ? (
          <div className="empty" style={{ margin: 'auto' }}>
            <h2>{done ? 'Triagem em dia' : 'Nada para triar'}</h2>
            <div>{done ? `Você decidiu ${done} vaga${done === 1 ? '' : 's'}. As que forem suas já estão na fila do robô.` : 'Nenhuma vaga nova agora. Na lista, toque em Buscar agora.'}</div>
            <button className="btn primary" onClick={() => (done ? go('fila') : setMode('lista'))}>{done ? 'Ver fila de aplicação' : 'Ver a lista'}</button>
          </div>
        ) : (
          <>
            <div className="stack">
              {next && <ReelCard job={next} behind />}
              <ReelCard
                key={job.id}
                job={job}
                style={{ transform, transition: drag.active && !leaving ? 'none' : 'transform 0.22s ease-out' }}
                yes={leaving === 'yes' ? 1 : yes}
                no={leaving === 'no' ? 1 : no}
                handlers={{ onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp }}
              />
            </div>
            <div className="decide">
              <button className="round no" onClick={() => decide('no')} aria-label="Não é pra mim">{Icon.x(26)}</button>
              <button className="round later" onClick={() => decide('later')} aria-label="Ver depois" title="Ver depois">{Icon.clock(20)}</button>
              <button className="mine" onClick={() => decide('yes')}>{Icon.check(22)} É minha!</button>
            </div>
            <div className="hint">Arraste para a direita se é sua, para a esquerda se não é</div>
          </>
        )}
      </div>
    </main>
  );
}

function ReelCard({ job, behind, style, yes = 0, no = 0, handlers = {} }) {
  return (
    <article className={`reel ${behind ? 'behind' : ''}`} style={style} {...handlers}>
      {!behind && <div className="stamp yes" style={{ opacity: yes }}>É minha</div>}
      {!behind && <div className="stamp no" style={{ opacity: no }}>Não</div>}
      <div className="head">
        <div className="company"><Logo job={job} /> <span>{job.company}</span></div>
        <h2>{job.title}</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>{job.location}</div>
        <div className="tags"><JobTags job={job} /></div>
      </div>
      <div className="scroll">
        <div className="fit">
          <div className="fit-top"><Score v={job.score} /><b>Por que combina com você</b></div>
          <Reasons reasons={job.reasons} />
        </div>
        <ClaudeBox claude={job.claude} />
        <div className="desc">{job.description || 'Descrição não disponível.'}</div>
        <div style={{ marginTop: 14 }}>
          <a className="btn sm" href={job.applyUrl || job.url} target="_blank" rel="noreferrer">Ver no site {Icon.out(14)}</a>
        </div>
      </div>
    </article>
  );
}
