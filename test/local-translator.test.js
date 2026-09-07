import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalTranslationClient } from '../local-translator.js';

class FakeWorker {
  listeners = {};
  posts = [];
  addEventListener(type, listener) { this.listeners[type] = listener; }
  postMessage(message) { this.posts.push(message); }
  terminate() {}
  reply(message) { this.listeners.message({ data: message }); }
}

test('local translator must be prepared for the selected language pair', async () => {
  const worker = new FakeWorker();
  const client = new LocalTranslationClient({ workerFactory: () => worker });
  const preparing = client.prepare('en', 'da');
  worker.reply({ id: worker.posts[0].id, type: 'ready' });
  await preparing;

  assert.equal(client.readyFor('en', 'da'), true);
  assert.equal(client.readyFor('da', 'en'), false);
});

test('local translator returns worker results', async () => {
  const worker = new FakeWorker();
  const client = new LocalTranslationClient({ workerFactory: () => worker });
  const preparing = client.prepare('en', 'da');
  worker.reply({ id: worker.posts[0].id, type: 'ready' });
  await preparing;
  const translating = client.translate('Good morning', 'en', 'da');
  const request = worker.posts[1];
  worker.reply({ id: request.id, type: 'result', translation: 'Godmorgen' });

  assert.equal(await translating, 'Godmorgen');
});
