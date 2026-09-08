export class LatestWorkQueue {
  constructor({ run, onSuperseded = () => {} }) {
    this.run = run;
    this.onSuperseded = onSuperseded;
    this.running = false;
    this.pending = null;
  }

  enqueue(job) {
    if (this.running) {
      if (this.pending) this.onSuperseded(this.pending);
      this.pending = job;
      return;
    }
    this.running = true;
    void this.drain(job);
  }

  async drain(job) {
    let current = job;
    while (current) {
      await this.run(current);
      current = this.pending;
      this.pending = null;
    }
    this.running = false;
  }
}
