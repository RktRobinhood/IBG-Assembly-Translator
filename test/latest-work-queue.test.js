import test from 'node:test';
import assert from 'node:assert/strict';
import { LatestWorkQueue } from '../latest-work-queue.js';

test('keeps the active job and only the newest waiting job', async () => {
  const completed = [];
  const superseded = [];
  let release;
  const first = new Promise((resolve) => { release = resolve; });
  const queue = new LatestWorkQueue({
    run: async (job) => { if (job === 'first') await first; completed.push(job); },
    onSuperseded: (job) => superseded.push(job)
  });

  queue.enqueue('first');
  queue.enqueue('old');
  queue.enqueue('newest');
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(completed, ['first', 'newest']);
  assert.deepEqual(superseded, ['old']);
});
