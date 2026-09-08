import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechSegmenter } from '../speech-segmenter.js';

test('promotes continuing interim speech without waiting for the recognizer to declare a final pause', () => {
  const promoted = [];
  const segmenter = new SpeechSegmenter({ maxInterimMs: 1200, onSegment: (text) => promoted.push(text) });

  segmenter.receiveInterim('Welcome everyone', 0);
  segmenter.receiveInterim('Welcome everyone to the assembly', 1300);

  assert.deepEqual(promoted, ['Welcome everyone to the assembly']);
});

test('does not emit the same browser final again after promoting it as an interim segment', () => {
  const promoted = [];
  const segmenter = new SpeechSegmenter({ maxInterimMs: 1000, onSegment: (text) => promoted.push(text) });

  segmenter.receiveInterim('Good morning everyone', 0);
  segmenter.receiveInterim('Good morning everyone', 1100);
  segmenter.receiveFinal('Good morning everyone');

  assert.deepEqual(promoted, ['Good morning everyone']);
});
