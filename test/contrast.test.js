import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCaptionTheme, relativeLuminance } from '../contrast.js';

function image(red, green, blue, pixels = 16) {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < data.length; index += 4) data.set([red, green, blue, 255], index);
  return { data };
}

test('relative luminance follows the expected black and white bounds', () => {
  assert.equal(relativeLuminance(0, 0, 0), 0);
  assert.equal(relativeLuminance(255, 255, 255), 1);
});

test('dark backgrounds use light captions', () => assert.equal(chooseCaptionTheme(image(10, 10, 10)), 'dark'));
test('bright backgrounds use dark captions', () => assert.equal(chooseCaptionTheme(image(245, 245, 245)), 'light'));
test('missing pixels falls back to the safest dark theme', () => assert.equal(chooseCaptionTheme(null), 'dark'));
