import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('all local HTML assets exist and use repository-relative URLs', async () => {
  const html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  const localReferences = references.filter((reference) => !/^(?:https?:|#|data:)/.test(reference));

  assert.ok(localReferences.length > 0, 'expected local static assets');
  for (const reference of localReferences) {
    assert.ok(!reference.startsWith('/'), `${reference} would break under a GitHub project subpath`);
    await access(resolve(projectRoot, reference));
  }
});

test('JavaScript module imports are repository-relative and resolvable', async () => {
  const app = await readFile(resolve(projectRoot, 'app.js'), 'utf8');
  const imports = [...app.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  for (const modulePath of imports) {
    assert.ok(modulePath.startsWith('./'), `${modulePath} is not a relative module import`);
    await access(resolve(projectRoot, modulePath));
  }
});

test('assembly UI uses an always-on-top subtitle window instead of presentation capture', async () => {
  const app = await readFile(resolve(projectRoot, 'app.js'), 'utf8');
  const html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');

  assert.match(app, /documentPictureInPicture\.requestWindow/);
  assert.doesNotMatch(app, /getDisplayMedia/);
  assert.match(html, /Bilingual transcript/);
  assert.match(html, /Open subtitle window/);
});
