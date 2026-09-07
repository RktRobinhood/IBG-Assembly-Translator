const DEFAULT_ENDPOINT = 'https://api.mymemory.translated.net/get';

export class TranslationClient {
  constructor({ endpoint = DEFAULT_ENDPOINT, fetchImpl = fetch, timeoutMs = 7000, translatorApi = null } = {}) {
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
    this.translatorApi = translatorApi;
    this.nativeTranslators = new Map();
    this.disabledNativePairs = new Set();
  }

  async translate(text, from, to, externalSignal) {
    const clean = text.trim().slice(-480);
    if (!clean || from === to) return clean;
    const key = `${from}|${to}|${clean.toLocaleLowerCase()}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const nativeTranslator = await this.getNativeTranslator(from, to);
    if (nativeTranslator) {
      try {
        const translated = await nativeTranslator.translate(clean, { signal: externalSignal });
        this.remember(key, translated);
        return translated;
      } catch (error) {
        if (externalSignal?.aborted) throw error;
        const pair = `${from}|${to}`;
        this.disabledNativePairs.add(pair);
        this.nativeTranslators.delete(pair);
      }
    }
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
      this.remember(key, translated);
      return translated;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  remember(key, translated) {
    this.cache.set(key, translated);
    if (this.cache.size > 150) this.cache.delete(this.cache.keys().next().value);
  }

  async getNativeTranslator(from, to) {
    if (!this.translatorApi) return null;
    const key = `${from}|${to}`;
    if (this.disabledNativePairs.has(key)) return null;
    if (this.nativeTranslators.has(key)) return this.nativeTranslators.get(key);
    try {
      const availability = await this.translatorApi.availability({ sourceLanguage: from, targetLanguage: to });
      if (availability === 'unavailable') return null;
      const pending = this.translatorApi.create({ sourceLanguage: from, targetLanguage: to }).catch(() => null);
      this.nativeTranslators.set(key, pending);
      return pending;
    } catch {
      return null;
    }
  }
}

export function languageCode(locale) { return locale.toLowerCase().split('-')[0]; }

export function decodeEntities(value) {
  if (typeof DOMParser === 'undefined') return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const parser = new DOMParser();
  return parser.parseFromString(value, 'text/html').documentElement.textContent;
}
