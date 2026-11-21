// Modo demonstração (build com VITE_DEMO=1): sem servidor, dados de exemplo. Fica fora do build normal.
export const DEMO = import.meta.env.VITE_DEMO === '1';

export async function api(path, opts = {}) {
  if (import.meta.env.VITE_DEMO === '1') return (await import('./demo.js')).demoApi(path, opts);
  const { method = 'GET', body } = opts;
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erro ${res.status}`), { status: res.status });
  return data;
}

export const WORKPLACE = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };

export function ago(date) {
  if (!date) return '';
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
