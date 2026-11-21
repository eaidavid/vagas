import { useCallback, useEffect, useState } from 'react';
import { api, ago, DEMO } from '../api.js';
import { AtsTag, Icon, toast, askClaude } from '../components/ui.jsx';

const GROUPS = [
  { id: 'precisa_voce', title: 'Precisa de você' },
  { id: 'aplicando', title: 'Robô aplicando agora' },
  { id: 'aguardando', title: 'Na fila do robô' },
  { id: 'aplicada', title: 'Aplicadas' },
  { id: 'falhou', title: 'Não deu certo' },
  { id: 'cancelada', title: 'Canceladas' },
];

export default function Fila({ onChange }) {
  const [apps, setApps] = useState(null);
  const [roboSeen, setRoboSeen] = useState(null);
  const [robo, setRobo] = useState(null);

  const load = useCallback(async () => {
    setApps(await api('/applications'));
    api('/stats').then((s) => { setRoboSeen(s.roboLastSeen || null); setRobo(s.robo || null); }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const h = setInterval(load, DEMO ? 1500 : 10000);
    return () => clearInterval(h);
  }, [load]);

  const act = async (a, action, body, msg) => {
    try {
      await api(`/applications/${a.id}/${action}`, { method: 'POST', body });
      toast(msg);
      load();
      onChange();
    } catch (e) {
      toast(e.message);
    }
  };

  const roboOn = roboSeen && Date.now() - new Date(roboSeen).getTime() < 5 * 60000;

  return (
    <>
      <div className="topbar"><h1>Fila de aplicação</h1></div>
      <main className="main">
        <div className="wrap">
          {!roboOn && (
            <div className="notice">
              O robô não está conectado agora. As vagas esperam na fila; enquanto isso você pode abrir cada uma, aplicar e tocar em <b>Apliquei</b>.
            </div>
          )}
          {roboOn && robo?.ensaio && (
            <div className="notice">
              <b>Modo ensaio:</b> o robô preenche cada formulário e para antes de enviar, com um print pra você conferir. Desligue em Perfil → Robô quando estiver confiante.
            </div>
          )}
          {apps && !apps.length && (
            <div className="empty">
              <h2>Fila vazia</h2>
              <div>Na triagem, toque em <b>É minha!</b> e a vaga aparece aqui.</div>
            </div>
          )}
          {apps && GROUPS.map((g) => {
            const list = apps.filter((a) => a.status === g.id);
            if (!list.length) return null;
            return (
              <section key={g.id}>
                <div className="section-title">{g.title} <span className={`badge ${g.id === 'precisa_voce' ? 'bad' : ''}`}>{list.length}</span></div>
                <div className="list">{list.map((a) => <AppCard key={a.id} a={a} act={act} />)}</div>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}

function AppCard({ a, act }) {
  const [showLog, setShowLog] = useState(false);
  const lastEntry = a.log[a.log.length - 1] || {};
  const lastQ = lastEntry.questions || [];
  const isEnsaio = a.status === 'precisa_voce' && /^Ensaio/.test(lastEntry.text || '');
  const lastShot = [...a.log].reverse().find((l) => l.screenshot)?.screenshot;
  const lastFilled = [...a.log].reverse().find((l) => l.filled)?.filled || [];
  const [answers, setAnswers] = useState({});
  const j = a.job;
  return (
    <article className={`app ${a.status === 'precisa_voce' ? 'need' : ''}`}>
      <h3>{j.title}</h3>
      <div className="muted small">{j.company}{j.location ? ` · ${j.location}` : ''} · {ago(a.updatedAt)}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <AtsTag job={j} />
        {a.attempts > 0 && <span className="tag">{a.attempts} tentativa{a.attempts > 1 ? 's' : ''}</span>}
      </div>
      {a.error && <div className="err">{a.error}</div>}

      {a.status === 'precisa_voce' && lastQ.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {lastQ.map((q, i) => (
            <div key={i}>
              <label className="label" htmlFor={`q-${a.id}-${i}`}>{q.pergunta}</label>
              {q.opcoes?.length ? (
                <select id={`q-${a.id}-${i}`} className="select" value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}>
                  <option value="">Escolha…</option>
                  {q.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input id={`q-${a.id}-${i}`} className="input" value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="row">
            <button className="btn sm" onClick={() => askClaude(api, { tipo: 'responder', applicationId: a.id, jobId: j.id })}>Pedir ao Claude</button>
            <button className="btn primary sm" onClick={() => act(a, 'responder', { answers: lastQ.map((q, i) => ({ pergunta: q.pergunta, resposta: answers[i] || '' })) }, 'Respostas salvas. O robô tenta de novo.')}>
              Responder e continuar
            </button>
          </div>
        </div>
      )}

      {lastShot && (
        <a className="shot" href={`/api/prints/${lastShot}`} target="_blank" rel="noreferrer" title="Abrir o print em tamanho real">
          <img src={`/api/prints/${lastShot}`} alt="Print da tela do robô" loading="lazy" />
        </a>
      )}
      {isEnsaio && (
        <div className="row">
          <button className="btn primary sm" onClick={() => act(a, 'enviar', null, 'O robô vai enviar esta candidatura')}>{Icon.check(16)} Está certo, enviar</button>
        </div>
      )}
      <div className="row">
        <a className="btn sm" href={j.applyUrl || j.url} target="_blank" rel="noreferrer">Abrir vaga {Icon.out(14)}</a>
        {a.status === 'aguardando' && !j.claude?.preparado && (
          <button className="btn sm" onClick={() => askClaude(api, { tipo: 'preparar', jobId: j.id }, 'Pedido enviado: o Claude vai escrever a carta e as respostas desta vaga')}>Claude: preparar carta</button>
        )}
        {['aguardando', 'precisa_voce', 'falhou'].includes(a.status) && (
          <button className="btn sm" onClick={() => act(a, 'apliquei-eu', null, 'Marcada como aplicada')}>{Icon.check(16)} Apliquei</button>
        )}
        {['precisa_voce', 'falhou', 'cancelada'].includes(a.status) && (
          <button className="btn sm" onClick={() => act(a, 'tentar-de-novo', null, 'Voltou para a fila do robô')}>{Icon.refresh(14)} Tentar de novo</button>
        )}
        {['aguardando', 'precisa_voce', 'falhou'].includes(a.status) && (
          <button className="btn sm ghost danger" onClick={() => act(a, 'cancelar', null, 'Candidatura cancelada')}>Cancelar</button>
        )}
        <button className="btn sm ghost" onClick={() => setShowLog((v) => !v)}>{showLog ? 'Esconder histórico' : 'Histórico'}</button>
      </div>
      {showLog && (
        <div className="log">
          {a.log.map((l, i) => <div key={i}>{new Date(l.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {l.text}</div>)}
          {lastFilled.length > 0 && (
            <div className="filled">
              <b>O que o robô preencheu</b>
              {lastFilled.map((f, i) => <div key={i}><span>{f.campo}</span> {f.valor}</div>)}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
