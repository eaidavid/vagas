import { useEffect, useState } from 'react';
import { WORKPLACE, ago } from '../api.js';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const Icon = {
  list: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
  reels: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M10 9l5 3-5 3z" /></svg>,
  queue: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z" /></svg>,
  user: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>,
  x: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  check: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} strokeWidth="2.8"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  clock: (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  plus: (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>,
  out: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
  refresh: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>,
  undo: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" {...P}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>,
};

export function Score({ v }) {
  const cls = v >= 70 ? '' : v >= 45 ? 'mid' : 'low';
  return <div className={`score ${cls}`} style={{ '--v': v }} title={`Compatibilidade ${v}/100`}><span>{v}</span></div>;
}

export function AtsTag({ job }) {
  const info = job.atsInfo || { nome: job.ats, robo: 'tentativa' };
  const label = info.robo === 'auto' ? 'robô aplica' : info.robo === 'tentativa' ? 'robô tenta' : 'manual';
  return <span className={`tag ${info.robo}`} title={`Candidatura em: ${info.nome} · ${label}`}><i className="dot" />{info.nome}</span>;
}

export function JobTags({ job }) {
  return (
    <>
      {job.workplace && <span className="tag">{WORKPLACE[job.workplace]}</span>}
      {job.intern && <span className="tag">Estágio</span>}
      {!job.intern && job.employmentType && <span className="tag">{job.employmentType}</span>}
      {job.salaryText && <span className="tag">{job.salaryText}</span>}
      <AtsTag job={job} />
      {job.postedAt && <span className="tag">{ago(job.postedAt)}</span>}
    </>
  );
}

export function Reasons({ reasons, max = 99 }) {
  return (
    <div className="why">
      {reasons.slice(0, max).map((r, i) => <div key={i} className={r.t === '+' ? 'p' : 'm'}>{r.text}</div>)}
    </div>
  );
}

export function Logo({ job, size }) {
  const [err, setErr] = useState(false);
  if (job.logo && !err) return <img className="logo" src={job.logo} alt="" onError={() => setErr(true)} style={size ? { width: size, height: size } : null} />;
  return <div className="logo">{(job.company || '?').trim()[0]?.toUpperCase()}</div>;
}

export function ClaudeBox({ claude }) {
  if (!claude?.resumo) return null;
  return (
    <div className="claude-box">
      <div className="claude-head"><b>Análise do Claude</b>{claude.nota != null && <span className="tag">{claude.nota}/100</span>}</div>
      <p>{claude.resumo}</p>
      {claude.pontosFortes?.length > 0 && <div className="why">{claude.pontosFortes.map((t, i) => <div key={i} className="p">{t}</div>)}</div>}
      {claude.riscos?.length > 0 && <div className="why">{claude.riscos.map((t, i) => <div key={i} className="m">{t}</div>)}</div>}
    </div>
  );
}

export async function askClaude(api, body, okText) {
  try {
    const r = await api('/pedidos', { method: 'POST', body });
    toast(r.jaExistia ? 'Esse pedido já está na fila do Claude' : okText || 'Pedido enviado. No chat do Claude, diga: Faz os pedidos do Vagas');
  } catch (e) {
    toast(e.message);
  }
}

let toastSet = null;
export function toast(text, undo) { toastSet?.({ text, undo, id: Math.random() }); }
export function Toaster() {
  const [t, setT] = useState(null);
  toastSet = setT;
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), t.undo ? 5000 : 2600);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div className="toast" key={t.id}>
      <span>{t.text}</span>
      {t.undo && <button onClick={() => { t.undo(); setT(null); }}>Desfazer</button>}
    </div>
  );
}

export function Toggle({ on, onChange }) {
  return <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}
