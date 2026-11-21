import { useEffect, useState } from 'react';
import { api, ago } from '../api.js';
import { Icon, Toggle, toast } from '../components/ui.jsx';

const SRC = { linkedin: 'LinkedIn', gupy: 'Gupy', greenhouse: 'Greenhouse', lever: 'Lever' };
const lines = (arr) => (arr || []).join('\n');
const fromLines = (s) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export default function Perfil({ onChange }) {
  const [p, setP] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collect, setCollect] = useState(null);

  useEffect(() => { api('/profile').then(setP); }, []);
  useEffect(() => {
    const load = () => api('/collect').then(setCollect).catch(() => {});
    load();
    const h = setInterval(load, 8000);
    return () => clearInterval(h);
  }, []);

  if (!p) return null;
  const set = (patch) => { setP({ ...p, ...patch }); setDirty(true); };
  const setPref = (patch) => set({ preferencias: { ...p.preferencias, ...patch } });
  const setLink = (k, v) => set({ links: { ...p.links, [k]: v } });

  const save = async () => {
    setSaving(true);
    try {
      const r = await api('/profile', { method: 'PUT', body: p });
      setDirty(false);
      toast(`Perfil salvo. ${r.rescored} vagas tiveram a nota recalculada.`);
      onChange();
    } catch (e) {
      toast(e.message);
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    let bin = '';
    new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
    try {
      await api('/profile/curriculo', { method: 'POST', body: { base64: btoa(bin) } });
      setP({ ...p, temCurriculo: true });
      toast('Currículo salvo');
    } catch (e) {
      toast(e.message);
    }
  };

  const logout = async () => { await api('/logout', { method: 'POST' }); location.reload(); };

  const pr = p.preferencias;
  const lastBySource = {};
  (collect?.runs || []).forEach((r) => { if (!lastBySource[r.source]) lastBySource[r.source] = r; });

  return (
    <>
      <div className="topbar">
        <h1>Perfil</h1>
        <button className="btn sm ghost" onClick={logout}>Sair</button>
      </div>
      <main className="main">
        <div className="wrap">
          <section className="panel">
            <h2>Buscas</h2>
            <div className="muted small" style={{ margin: '6px 0 10px' }}>
              {collect?.running ? 'Buscando agora…' : collect?.last ? `Última busca ${ago(collect.last.at)}. Roda sozinha a cada 6 horas.` : 'Nenhuma busca ainda.'}
            </div>
            {Object.keys(SRC).map((s) => {
              const r = lastBySource[s];
              return (
                <div key={s} className="switch">
                  <span>{SRC[s]}</span>
                  <span className="small" style={{ color: r?.error ? 'var(--bad)' : 'var(--muted)', textAlign: 'right' }}>
                    {!r ? 'ainda não rodou' : r.error ? `erro: ${r.error}` : `${r.found} lidas · ${r.inserted} novas · ${ago(r.finished_at || r.started_at)}`}
                  </span>
                </div>
              );
            })}
            {collect?.activity?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="muted small" style={{ cursor: 'pointer' }}>Registro da última busca</summary>
                <div className="log">{collect.activity.slice(-30).map((a, i) => <div key={i}>{new Date(a.at).toLocaleTimeString('pt-BR')} · {a.text}</div>)}</div>
              </details>
            )}
          </section>

          <section className="panel">
            <h2>O que buscar</h2>
            <label className="label">Termos de busca (um por linha)</label>
            <textarea className="textarea" value={lines(pr.termos)} onChange={(e) => setPref({ termos: fromLines(e.target.value) })} />
            <label className="label">Cidades aceitas para híbrido e presencial</label>
            <textarea className="textarea" style={{ minHeight: 70 }} value={lines(pr.cidadesPresencial)} onChange={(e) => setPref({ cidadesPresencial: fromLines(e.target.value) })} />
            <div className="grid2">
              <div>
                <label className="label">Salário mínimo (R$)</label>
                <input className="input" type="number" value={pr.salarioMinimo} onChange={(e) => setPref({ salarioMinimo: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Nota mínima para o feed</label>
                <input className="input" type="number" min="0" max="100" value={pr.notaMinimaFeed} onChange={(e) => setPref({ notaMinimaFeed: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {[['aceitaRemoto', 'Remoto (de qualquer lugar)'], ['aceitaHibrido', 'Híbrido (nas cidades acima)'], ['aceitaPresencial', 'Presencial (nas cidades acima)'], ['aceitaEstagio', 'Incluir estágio']].map(([k, label]) => (
                <div key={k} className="switch"><span>{label}</span><Toggle on={!!pr[k]} onChange={(v) => setPref({ [k]: v })} /></div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Currículo</h2>
            <div className="switch">
              <span>{p.temCurriculo ? 'PDF enviado' : 'Nenhum PDF enviado'}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                {p.temCurriculo && <a className="btn sm" href="/api/profile/curriculo" target="_blank" rel="noreferrer">Ver</a>}
                <label className="btn sm primary">
                  {p.temCurriculo ? 'Trocar' : 'Enviar PDF'}
                  <input type="file" accept="application/pdf" hidden onChange={(e) => upload(e.target.files[0])} />
                </label>
              </span>
            </div>
            <div className="grid2">
              <div><label className="label">Nome</label><input className="input" value={p.nome} onChange={(e) => set({ nome: e.target.value })} /></div>
              <div><label className="label">Título</label><input className="input" value={p.titulo} onChange={(e) => set({ titulo: e.target.value })} /></div>
              <div><label className="label">E-mail</label><input className="input" type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} /></div>
              <div><label className="label">Telefone</label><input className="input" type="tel" placeholder="(62) 9…" value={p.telefone} onChange={(e) => set({ telefone: e.target.value })} /></div>
              <div><label className="label">Cidade</label><input className="input" value={p.cidade} onChange={(e) => set({ cidade: e.target.value })} /></div>
              <div><label className="label">Estado</label><input className="input" value={p.estado} onChange={(e) => set({ estado: e.target.value })} /></div>
              <div><label className="label">LinkedIn</label><input className="input" value={p.links.linkedin} onChange={(e) => setLink('linkedin', e.target.value)} /></div>
              <div><label className="label">GitHub</label><input className="input" value={p.links.github} onChange={(e) => setLink('github', e.target.value)} /></div>
              <div><label className="label">Portfólio</label><input className="input" value={p.links.portfolio} onChange={(e) => setLink('portfolio', e.target.value)} /></div>
              <div><label className="label">Inglês</label><input className="input" value={p.ingles} onChange={(e) => set({ ingles: e.target.value })} /></div>
            </div>
            <label className="label">Resumo profissional</label>
            <textarea className="textarea" value={p.resumo} onChange={(e) => set({ resumo: e.target.value })} />
            <label className="label">Habilidades (separadas por vírgula)</label>
            <input className="input" value={p.habilidades.join(', ')} onChange={(e) => set({ habilidades: fromLines(e.target.value) })} />
            <label className="label">Formação</label>
            <input className="input" value={p.formacao} onChange={(e) => set({ formacao: e.target.value })} />
          </section>

          <section className="panel">
            <h2>Respostas padrão do robô</h2>
            <div className="muted small" style={{ marginTop: 6 }}>O robô usa estas respostas nos formulários. Quando aparecer uma pergunta nova, ele pede pra você na Fila e guarda a resposta aqui.</div>
            {p.respostas.map((r, i) => (
              <div key={i} className="qa">
                <input className="input" placeholder="Pergunta" value={r.pergunta} onChange={(e) => set({ respostas: p.respostas.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)) })} />
                <input className="input" placeholder="Resposta" value={r.resposta} onChange={(e) => set({ respostas: p.respostas.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)) })} />
                <button className="icon-btn" aria-label="Remover" onClick={() => set({ respostas: p.respostas.filter((_, j) => j !== i) })}>{Icon.x(16)}</button>
              </div>
            ))}
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => set({ respostas: [...p.respostas, { pergunta: '', resposta: '' }] })}>{Icon.plus(16)} Adicionar</button>
          </section>

          <section className="panel">
            <h2>Empresas com quadro próprio</h2>
            <div className="muted small" style={{ marginTop: 6 }}>Nome que aparece na URL do quadro de vagas, um por linha. Ex.: em boards.greenhouse.io/<b>nubank</b>, escreva nubank.</div>
            <div className="grid2">
              <div><label className="label">Greenhouse</label><textarea className="textarea" style={{ minHeight: 70 }} value={lines(p.empresas.greenhouse)} onChange={(e) => set({ empresas: { ...p.empresas, greenhouse: fromLines(e.target.value) } })} /></div>
              <div><label className="label">Lever</label><textarea className="textarea" style={{ minHeight: 70 }} value={lines(p.empresas.lever)} onChange={(e) => set({ empresas: { ...p.empresas, lever: fromLines(e.target.value) } })} /></div>
            </div>
          </section>

          {dirty && (
            <div className="savebar">
              <button className="btn primary" onClick={save} disabled={saving}>{saving ? <span className="spin" /> : 'Salvar perfil'}</button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
