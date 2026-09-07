import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationClient, decodeEntities, languageCode } from '../translator.js';

test('languageCode converts browser locales to translation codes', () => {
  assert.equal(languageCode('en-US'), 'en');
  assert.equal(languageCode('da-DK'), 'da');
});

test('translation requests are encoded and cached', async () => {
  let calls = 0;
  const client = new TranslationClient({ fetchImpl: async (url) => {
    calls += 1;
    assert.equal(url.searchParams.get('q'), 'Hello & welcome');
    assert.equal(url.searchParams.get('langpair'), 'en|da');
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Hej &amp; velkommen' } }) };
  }});
  assert.equal(await client.translate('Hello & welcome', 'en', 'da'), 'Hej & velkommen');
  assert.equal(await client.translate('Hello & welcome', 'en', 'da'), 'Hej & velkommen');
  assert.equal(calls, 1);
});

test('decodeEntities handles the entities returned by the service', () => assert.equal(decodeEntities('Rock &amp; roll'), 'Rock & roll'));

test('supported browsers use on-device translation without a network request', async () => {
  let networkCalls = 0;
  const translatorApi = {
    availability: async () => 'available',
    create: async () => ({ translate: async (text) => `local:${text}` })
  };
  const client = new TranslationClient({ translatorApi, fetchImpl: async () => { networkCalls += 1; } });
  assert.equal(await client.translate('Hello', 'en', 'da'), 'local:Hello');
  assert.equal(networkCalls, 0);
});

test('experimental built-in translation is opt-in', () => {
  assert.equal(new TranslationClient().translatorApi, null);
});

test('a crashed built-in translator is disabled after the first failure', async () => {
  let nativeCalls = 0;
  let networkCalls = 0;
  const translatorApi = {
    availability: async () => 'available',
    create: async () => ({
      translate: async () => {
        nativeCalls += 1;
        throw new Error('The translation service crashed.');
      }
    })
  };
  const fetchImpl = async () => {
    networkCalls += 1;
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'fallback' } }) };
  };
  const client = new TranslationClient({ translatorApi, fetchImpl });

  assert.equal(await client.translate('First phrase', 'en', 'da'), 'fallback');
  assert.equal(await client.translate('Second phrase', 'en', 'da'), 'fallback');
  assert.equal(nativeCalls, 1, 'the crashed native translator must not be reused');
  assert.equal(networkCalls, 2);
});
