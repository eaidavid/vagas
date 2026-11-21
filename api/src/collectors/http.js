// Busca HTTP com ritmo humano: espera entre pedidos e tenta de novo em erro passageiro.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (min, max) => sleep(min + Math.random() * (max - min));

export async function fetchText(url, { headers = {}, retries = 2, timeout = 20000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8', ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retry: true });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (!(e.retry || e.name === 'TimeoutError' || e.cause)) break;
      await sleep(4000 * (i + 1));
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, { ...opts, headers: { accept: 'application/json', ...(opts?.headers || {}) } }));
}

/* HTML para texto simples, mantendo quebras de parágrafo e listas */
export function htmlToText(html = '') {
  return String(html)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
