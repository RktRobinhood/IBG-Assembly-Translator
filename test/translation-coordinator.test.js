import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationCoordinator } from '../translation-coordinator.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('a final phrase clears queued interim speech and cannot be overwritten by it', async () => {
  const requests = [];
  const drafts = [];
  const coordinator = new TranslationCoordinator({
    translate: (text) => {
      const request = deferred();
      requests.push({ text, ...request });
      return request.promise;
    },
    onDraft: (source, translation) => drafts.push({ source, translation }),
    draftDelay: 0,
    repeatDelay: 0
  });

  coordinator.scheduleDraft('old interim');
  await new Promise((resolve) => setTimeout(resolve, 0));
  coordinator.scheduleDraft('newer interim');
  const finalResult = coordinator.translateFinal('final phrase');
  requests[0].resolve('old translation');
  requests[1].resolve('final translation');

  assert.deepEqual(await finalResult, { translation: 'final translation', isCurrent: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(requests.map(({ text }) => text), ['old interim', 'final phrase']);
  assert.deepEqual(drafts, []);
});

test('stopping hides an in-flight final result without cancelling its transcript translation', async () => {
  const final = deferred();
  let finalSignal;
  const coordinator = new TranslationCoordinator({
    translate: (_text, signal) => { finalSignal = signal; return final.promise; },
    onDraft: () => {}
  });

  const result = coordinator.translateFinal('last phrase');
  coordinator.stopDrafts();
  final.resolve('sidste sætning');

  assert.deepEqual(await result, { translation: 'sidste sætning', isCurrent: false });
  assert.equal(finalSignal.aborted, false);
});
