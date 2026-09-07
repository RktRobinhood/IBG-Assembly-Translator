const DEFAULT_ENDPOINT = 'https://api.mymemory.translated.net/get';

export class TranslationClient {
  constructor({ endpoint = DEFAULT_ENDPOINT, fetchImpl = fetch, timeoutMs = 7000 } = {}) {
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }

  async translate(text, from, to, externalSignal) {
    const clean = text.trim().slice(-480);
    if (!clean || from === to) return clean;
    const key = `${from}|${to}|${clean.toLocaleLowerCase()}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('Translation timed out')), this.timeoutMs);
    const cancel = () => timeout.abort(externalSignal.reason);
    externalSignal?.addEventListener('abort', cancel, { once: true });
    try {
      const url = new URL(this.endpoint);
      url.searchParams.set('q', clean);
      url.searchParams.set('langpair', `${from}|${to}`);
      const response = await this.fetchImpl(url, { signal: timeout.signal });
      if (!response.ok) throw new Error(`Translation service returned ${response.status}`);
      const payload = await response.json();
      if (payload.responseStatus !== 200 || !payload.responseData?.translatedText) throw new Error(payload.responseDetails || 'Translation failed');
      const translated = decodeEntities(payload.responseData.translatedText);
      this.cache.set(key, translated);
      if (this.cache.size > 150) this.cache.delete(this.cache.keys().next().value);
      return translated;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }
}

export function languageCode(locale) { return locale.toLowerCase().split('-')[0]; }

export function decodeEntities(value) {
  if (typeof DOMParser === 'undefined') return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const parser = new DOMParser();
  return parser.parseFromString(value, 'text/html').documentElement.textContent;
}
