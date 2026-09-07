export class TranslationCoordinator {
  constructor({ translate, onDraft, onError = () => {}, isActive = () => true, draftDelay = 450, repeatDelay = 350, timers = globalThis }) {
    this.translate = translate;
    this.onDraft = onDraft;
    this.onError = onError;
    this.isActive = isActive;
    this.draftDelay = draftDelay;
    this.repeatDelay = repeatDelay;
    this.timers = timers;
    this.timer = null;
    this.busy = false;
    this.queued = '';
    this.lastDraft = '';
    this.draftRequest = null;
    this.generation = 0;
  }

  scheduleDraft(text) {
    if (text.length < 3 || text === this.lastDraft) return;
    this.lastDraft = text;
    this.queued = text;
    if (this.timer || this.busy) return;
    this.timer = this.timers.setTimeout(() => this.runDraft(), this.draftDelay);
  }

  async runDraft() {
    this.timer = null;
    this.busy = true;
    const text = this.queued;
    this.draftRequest = new AbortController();
    const generation = ++this.generation;
    try {
      const translation = await this.translate(text, this.draftRequest.signal);
      if (generation === this.generation) this.onDraft(text, translation);
    } catch (error) {
      if (!this.draftRequest.signal.aborted) this.onError(error);
    } finally {
      this.busy = false;
      if (this.isActive() && this.queued && this.queued !== text) {
        this.timer = this.timers.setTimeout(() => this.runDraft(), this.repeatDelay);
      }
    }
  }

  async translateFinal(text) {
    this.clearDrafts();
    const generation = ++this.generation;
    try {
      const translation = await this.translate(text, new AbortController().signal);
      return { translation, isCurrent: generation === this.generation };
    } catch (error) {
      const failure = new Error(error.message || 'Translation failed', { cause: error });
      failure.isCurrent = generation === this.generation;
      throw failure;
    }
  }

  stopDrafts() {
    this.clearDrafts();
    this.generation += 1;
  }

  clearDrafts() {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.draftRequest?.abort();
    this.draftRequest = null;
    this.queued = '';
    this.lastDraft = '';
  }
}
