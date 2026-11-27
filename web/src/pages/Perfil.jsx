import { useEffect, useState } from 'react';
import { api, ago } from '../api.js';
import { Icon, Toggle, toast } from '../components/ui.jsx';

const TELA = '/tela/vnc.html?path=tela/websockify&autoconnect=1&resize=scale';
const SRC = { linkedin: 'LinkedIn', gupy: 'Gupy', remotar: 'Remotar', programathor: 'Programathor', github: 'GitHub (comunidade)', greenhouse: 'Greenhouse', lever: 'Lever' };
const lines = (arr) => (arr || []).join('\n');
const fromLines = (s) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export default function Perfil({ onChange }) {
  const [p, setP] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collect, setCollect] = useState(null);
  const [robo, setRobo] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [contas, setContas] = useState(null);
  const [contaForm, setContaForm] = useState({ linkedin: { email: '', senha: '' }, gupy: { email: '', senha: '' } });

  useEffect(() => {
    api('/profile').then(setP);
    api('/robo/config').then(setRobo).catch(() => {});
    api('/robo/contas').then((c) => {
      setContas(c);
      setContaForm({ linkedin: { email: c.linkedin.email, senha: '' }, gupy: { email: c.gupy.email, senha: '' } });
    }).catch(() => {});
  }, []);
  const [conectando, setConectando] = useState(null);
  const reloadContas = () => api('/robo/contas').then(setContas).catch(() => {});
  const desconectar = async (sv) => {
    await api('/robo/desconectar', { method: 'POST', body: { site: sv } });
    toast('Desconectando… em alguns segundos aparece aqui');
    setTimeout(reloadContas, 6000);
  };
  const salvarConta = async (servico) => {
    try {
      const c = await api(`/robo/contas/${servico}`, { method: 'PUT', body: contaForm[servico] });
      setContas((old) => ({ ...c, linkedin: { ...c.linkedin, conectado: old?.linkedin?.conectado ?? null }, gupy: { ...c.gupy, conectado: old?.gupy?.conectado ?? null } }));
      setContaForm((f) => ({ ...f, [servico]: { ...f[servico], senha: '' } }));
      toast(`Conta ${servico === 'linkedin' ? 'do LinkedIn' : 'da Gupy'} salva. O robô entra sozinho quando precisar.`);
    } catch (e) {
      toast(e.message);
    }
  };
  const setRoboCfg = async (patch) => {
    const next = { ...robo, ...patch };
    setRobo(next);
    try { setRobo(await api('/robo/config', { method: 'PUT', body: next })); } catch (e) { toast(e.message); }
  };
  useEffect(() => {
    const load = () => { api('/collect').then(setCollect).catch(() => {}); api('/pedidos').then(setPedidos).catch(() => {}); api('/robo/contas').then(setContas).catch(() => {}); };
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
                    {!r ? 'ainda não rodou' : !r.finished_at ? `buscando… ${r.found} lidas, ${r.inserted} novas` : r.error ? `erro: ${r.error}` : `${r.found} lidas · ${r.inserted} novas · ${ago(r.finished_at || r.started_at)}`}
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
            <h2>Claude</h2>
            <div className="muted small" style={{ margin: '6px 0 4px' }}>
              Conectado pelo conector personalizado no claude.ai (o link aparece no fim da instalação). Use <b>Pedir ao Claude</b> nas vagas e na Fila; depois, no chat do Claude, diga <b>Faz os pedidos do Vagas</b>.
            </div>
            {pedidos.length === 0 && <div className="switch"><span className="muted small">Nenhum pedido recente.</span></div>}
            {pedidos.map((r) => (
              <div key={r.id} className="switch">
                <span className="small">{{ analisar: 'Analisar', preparar: 'Preparar carta e respostas', responder: 'Responder perguntas' }[r.tipo]}{r.titulo ? ` · ${r.titulo}` : ''}</span>
                <span className="small" style={{ color: r.status === 'pendente' ? 'var(--warn)' : 'var(--good)', textAlign: 'right' }}>{r.status === 'pendente' ? 'esperando o Claude' : r.resultado || 'feito'}</span>
              </div>
            ))}
          </section>

          {robo && (
            <section className="panel">
              <h2>Robô</h2>
              <div className="switch"><span>Ligado</span><Toggle on={robo.ligado} onChange={(v) => setRoboCfg({ ligado: v })} /></div>
              <div className="switch">
                <span>Piloto automático<br /><span className="muted small">Coloca sozinho na fila as vagas com nota a partir de {robo.autoNota}, até o limite do dia</span></span>
                <Toggle on={!!robo.autoAplicar} onChange={async (v) => { await setRoboCfg({ autoAplicar: v }); if (v) toast('Piloto automático ligado: as melhores vagas vão para a fila sozinhas'); }} />
              </div>
              {robo.autoAplicar && (
                <div style={{ maxWidth: 260 }}>
                  <label className="label" htmlFor="robo-auto-nota">Nota mínima para aplicar sozinho</label>
                  <input id="robo-auto-nota" className="input" type="number" min="40" max="100" value={robo.autoNota} onChange={(e) => setRobo({ ...robo, autoNota: e.target.value })} onBlur={() => setRoboCfg({})} />
                </div>
              )}
              <div className="switch">
                <span>Modo ensaio<br /><span className="muted small">Preenche e para antes de enviar, com print pra conferir</span></span>
                <Toggle on={robo.ensaio} onChange={(v) => setRoboCfg({ ensaio: v })} />
              </div>
              <div className="grid2">
                <div>
                  <label className="label" htmlFor="robo-limite">Candidaturas por dia (no máximo)</label>
                  <input id="robo-limite" className="input" type="number" min="1" max="100" value={robo.limiteDia} onChange={(e) => setRobo({ ...robo, limiteDia: e.target.value })} onBlur={() => setRoboCfg({})} />
                </div>
                <div>
                  <label className="label" htmlFor="robo-horario">Horário (de / até)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="robo-horario" className="input" type="number" min="0" max="23" value={robo.horaInicio} onChange={(e) => setRobo({ ...robo, horaInicio: e.target.value })} onBlur={() => setRoboCfg({})} />
                    <input className="input" type="number" min="1" max="24" aria-label="Até" value={robo.horaFim} onChange={(e) => setRobo({ ...robo, horaFim: e.target.value })} onBlur={() => setRoboCfg({})} />
                  </div>
                </div>
              </div>
              <h3 className="sub">Contas dos sites de vaga</h3>
              <div className="muted small">Toque em <b>Conectar</b>, entre na sua conta do jeito que preferir (pode ser "Continuar com Google") e pronto: fica salvo no navegador do robô.</div>
              {contas && ['linkedin', 'gupy'].map((sv) => {
                const nome = sv === 'linkedin' ? 'LinkedIn' : 'Gupy';
                const c = contas[sv];
                return (
                  <div key={sv} className="conta">
                    <div className="conta-head">
                      <b>{nome}</b>
                      {c.conectado === true && <span className="tag auto"><i className="dot" />Conectado</span>}
                      {c.conectado === false && <span className="tag">Não conectado</span>}
                      {c.conectado == null && <span className="tag tentativa">Robô sem contato</span>}
                      <span style={{ flex: 1 }} />
                      {c.conectado ? (
                        <button className="btn sm ghost" onClick={() => desconectar(sv)}>Desconectar</button>
                      ) : (
                        <button className="btn sm primary" onClick={() => setConectando(sv)}>Conectar {nome}</button>
                      )}
                    </div>
                    <details className="conta-senha">
                      <summary>Ou salvar e-mail e senha {c.temSenha && <span className="tag auto">senha salva</span>}</summary>
                      <div className="muted small" style={{ margin: '6px 0' }}>O robô usa para entrar sozinho se a sessão cair. A senha fica criptografada na sua VPS e não volta para a tela.</div>
                      <div className="conta-row">
                        <input id={`conta-${sv}-email`} className="input" type="email" autoComplete="off" aria-label={`E-mail ${nome}`} placeholder="E-mail da conta" value={contaForm[sv].email} onChange={(e) => setContaForm({ ...contaForm, [sv]: { ...contaForm[sv], email: e.target.value } })} />
                        <input className="input" type="password" autoComplete="new-password" aria-label={`Senha ${nome}`} placeholder={c.temSenha ? 'Senha salva (deixe vazio pra manter)' : 'Senha'} value={contaForm[sv].senha} onChange={(e) => setContaForm({ ...contaForm, [sv]: { ...contaForm[sv], senha: e.target.value } })} />
                        <button className="btn sm" onClick={() => salvarConta(sv)}>Salvar</button>
                      </div>
                    </details>
                  </div>
                );
              })}
              <div className="switch" style={{ marginTop: 8 }}>
                <span>Tela do robô<br /><span className="muted small">Pra fazer login no LinkedIn e na Gupy uma vez, ou resolver um CAPTCHA</span></span>
                <a className="btn sm" href={TELA} target="_blank" rel="noreferrer">Abrir</a>
              </div>
            </section>
          )}

          <section className="panel">
            <h2>Áreas de vaga</h2>
            <div className="muted small" style={{ marginTop: 6 }}>Vagas de entrada em tecnologia: onde o que você já sabe (front-end, design, lógica, banco de dados) conta mais do que anos de prática. Desligue o que não quiser ver.</div>
            {(p.areasDisponiveis || []).map((a) => {
              const on = (pr.areas || []).includes(a.id);
              return (
                <div key={a.id} className="switch">
                  <span>{a.nome}</span>
                  <Toggle on={on} onChange={(v) => setPref({ areas: v ? [...(pr.areas || []), a.id] : (pr.areas || []).filter((x) => x !== a.id) })} />
                </div>
              );
            })}
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
                <label className="label">"Paga bem" a partir de (R$)</label>
                <input className="input" type="number" value={pr.salarioBom || 3000} onChange={(e) => setPref({ salarioBom: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label">Nota mínima para o feed</label>
                <input className="input" type="number" min="0" max="100" value={pr.notaMinimaFeed} onChange={(e) => setPref({ notaMinimaFeed: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {[['aceitaRemoto', 'Remoto (de qualquer lugar)'], ['aceitaHibrido', 'Híbrido (nas cidades acima)'], ['aceitaPresencial', 'Presencial (nas cidades acima)'], ['aceitaEstagio', 'Incluir estágio'], ['pcd', 'Sou pessoa com deficiência (mostrar vagas exclusivas PcD)']].map(([k, label]) => (
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
      {conectando && <ConectarModal site={conectando} onClose={() => { setConectando(null); reloadContas(); }} />}
    </>
  );
}

/* Janela "Conectar": mostra o navegador do robô já na página de login e fecha sozinha quando a conta conecta */
function ConectarModal({ site, onClose }) {
  const nome = site === 'linkedin' ? 'LinkedIn' : 'Gupy';
  const [tela, setTela] = useState(null);
  const [status, setStatus] = useState({});
  const [ok, setOk] = useState(false);
  useEffect(() => {
    api('/robo/conectar', { method: 'POST', body: { site } }).then((r) => setTela(r.tela)).catch((e) => toast(e.message));
    const h = setInterval(async () => {
      try {
        const c = await api('/robo/contas');
        setStatus({ aplicando: c.roboAplicando, semContato: c[site].conectado == null });
        if (c[site].conectado) { setOk(true); clearInterval(h); setTimeout(onClose, 1800); }
      } catch { /* tenta de novo */ }
    }, 3000);
    return () => clearInterval(h);
  }, [site]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <section className="sheet conectar" role="dialog" aria-modal="true" aria-label={`Conectar ${nome}`}>
        <header>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18 }}>{ok ? `${nome} conectado` : `Conectar ${nome}`}</h2>
            <div className="muted small">
              {ok ? 'Pronto! O robô já pode aplicar com a sua conta.'
                : status.semContato ? 'O robô não está respondendo agora. Confira se ele está ligado.'
                : status.aplicando ? 'O robô está terminando uma candidatura; a página de login abre logo em seguida.'
                : 'Entre na sua conta como preferir, inclusive "Continuar com Google". Esta janela fecha sozinha quando conectar.'}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">{Icon.x(18)}</button>
        </header>
        <div className="tela-wrap">
          {ok ? <div className="empty"><h2>Conectado ✓</h2></div> : tela ? <iframe title={`Login ${nome} no navegador do robô`} src={tela} allow="clipboard-read; clipboard-write" /> : <div className="empty"><span className="spin" /></div>}
        </div>
      </section>
    </>
  );
}
