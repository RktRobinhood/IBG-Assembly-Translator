import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOverlayMode } from '../overlay-controller.js';

test('uses video Picture-in-Picture when Document Picture-in-Picture is unavailable', () => {
  assert.equal(selectOverlayMode({ documentPip: false, videoPip: true }), 'video');
});

test('reports native fallback when neither browser overlay is supported', () => {
  assert.equal(selectOverlayMode({ documentPip: false, videoPip: false }), 'unsupported');
});
