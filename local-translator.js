const WORKER_URL = new URL('./translation-worker.js', import.meta.url);

export class LocalTranslationClient {
  constructor({ workerFactory = () => new Worker(WORKER_URL, { type: 'module' }) } = {}) {
    this.workerFactory = workerFactory;
    this.worker = null;
    this.pair = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  readyFor(from, to) { return this.pair === `${from}|${to}`; }

  async prepare(from, to, onProgress = () => {}) {
    const pair = `${from}|${to}`;
    if (this.readyFor(from, to)) return;
    this.close();
    this.worker = this.workerFactory();
    this.worker.addEventListener('message', (event) => this.handleMessage(event.data));
    this.worker.addEventListener('error', (event) => this.failAll(new Error(event.message || 'Local translation worker failed')));
    const id = this.nextId++;
    await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ id, type: 'prepare', from, to });
    });
    this.pair = pair;
  }

  translate(text, from, to, signal) {
    if (!this.readyFor(from, to) || !this.worker) throw new Error('Local translation is not prepared');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        reject(signal.reason || new DOMException('Translation cancelled', 'AbortError'));
      };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => { signal?.removeEventListener('abort', abort); resolve(value); },
        reject: (error) => { signal?.removeEventListener('abort', abort); reject(error); },
        onProgress: () => {}
      });
      this.worker.postMessage({ id, type: 'translate', text });
    });
  }

  handleMessage(message) {
    const request = this.pending.get(message.id);
    if (!request) return;
    if (message.type === 'progress') { request.onProgress(message.message); return; }
    this.pending.delete(message.id);
    if (message.type === 'error') request.reject(new Error(message.message));
    else request.resolve(message.translation);
  }

  failAll(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.pair = null;
  }

  close() {
    this.worker?.terminate();
    this.worker = null;
    this.pair = null;
    this.failAll(new Error('Local translation worker restarted'));
  }
}
