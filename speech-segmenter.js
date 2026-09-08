export class SpeechSegmenter {
  constructor({ maxInterimMs = 1400, onSegment }) {
    this.maxInterimMs = maxInterimMs;
    this.onSegment = onSegment;
    this.startedAt = null;
    this.promotedPrefix = '';
  }

  receiveInterim(text, now = performance.now()) {
    const clean = normalize(text);
    if (!clean) return;
    if (this.startedAt === null) this.startedAt = now;
    if (now - this.startedAt < this.maxInterimMs) return;
    const segment = removePrefix(clean, this.promotedPrefix);
    if (segment) this.onSegment(segment);
    this.promotedPrefix = clean;
    this.startedAt = now;
  }

  receiveFinal(text) {
    const clean = normalize(text);
    const segment = removePrefix(clean, this.promotedPrefix);
    if (segment) this.onSegment(segment);
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.promotedPrefix = '';
  }
}

function normalize(text) { return text.trim().replace(/\s+/g, ' '); }

function removePrefix(text, prefix) {
  if (!prefix) return text;
  if (text.toLocaleLowerCase() === prefix.toLocaleLowerCase()) return '';
  if (text.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) return text.slice(prefix.length).trim();
  return text;
}
