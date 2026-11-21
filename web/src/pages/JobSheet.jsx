import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ClaudeBox, Icon, JobTags, Logo, Reasons, Score, askClaude } from '../components/ui.jsx';

const SOURCE = { linkedin: 'LinkedIn', gupy: 'Gupy', greenhouse: 'Greenhouse', lever: 'Lever' };

export default function JobSheet({ id, onClose, actions }) {
  const [job, setJob] = useState(null);
  useEffect(() => { api(`/jobs/${id}`).then(setJob); }, [id]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true">
        {!job ? (
          <div className="content"><span className="spin" /></div>
        ) : (
          <>
            <header>
              <Logo job={job} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 19, lineHeight: 1.25 }}>{job.title}</h2>
                <div className="muted small">{job.company}{job.location ? ` · ${job.location}` : ''}</div>
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Fechar">{Icon.x(18)}</button>
            </header>
            <div className="content">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><JobTags job={job} /></div>
              <div className="fit" style={{ background: 'var(--card)', borderRadius: 14, padding: '12px 14px', margin: '14px 0' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                  <Score v={job.score} /><b>Por que essa nota</b>
                </div>
                <Reasons reasons={job.reasons} />
              </div>
              <ClaudeBox claude={job.claude} />
              <div className="desc">{job.description || 'Descrição não disponível. Abra a vaga no site.'}</div>
              <div className="muted small" style={{ marginTop: 16 }}>
                Encontrada em: {job.fontes.map((f, i) => <span key={i}>{i ? ', ' : ''}<a href={f.url} target="_blank" rel="noreferrer">{SOURCE[f.source] || f.source}</a></span>)}
              </div>
            </div>
            <footer>
              {actions?.(job)}
              <button className="btn" onClick={() => askClaude(api, { tipo: job.status === 'minha' ? 'preparar' : 'analisar', jobId: job.id })}>Pedir ao Claude</button>
              <a className="btn ghost" href={job.applyUrl || job.url} target="_blank" rel="noreferrer">Abrir vaga {Icon.out()}</a>
            </footer>
          </>
        )}
      </section>
    </>
  );
}
