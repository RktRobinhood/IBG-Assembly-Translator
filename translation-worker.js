import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

const MODELS = {
  'en|da': 'Xenova/opus-mt-en-da',
  'da|en': 'Xenova/opus-mt-da-en'
};
let translator = null;

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'prepare') {
      const model = MODELS[`${data.from}|${data.to}`];
      if (!model) throw new Error('This local language pair is not available');
      self.postMessage({ id: data.id, type: 'progress', message: 'Downloading translation model…' });
      translator = await pipeline('translation', model, {
        dtype: 'q8',
        progress_callback: (progress) => {
          if (progress.status !== 'progress' || !progress.total) return;
          const percent = Math.round(progress.loaded / progress.total * 100);
          self.postMessage({ id: data.id, type: 'progress', message: `Preparing local model · ${percent}%` });
        }
      });
      self.postMessage({ id: data.id, type: 'ready' });
      return;
    }
    if (data.type === 'translate') {
      if (!translator) throw new Error('Local translation model is not ready');
      const result = await translator(data.text, { max_new_tokens: 256 });
      const translation = result?.[0]?.translation_text;
      if (!translation) throw new Error('Local model returned no translation');
      self.postMessage({ id: data.id, type: 'result', translation });
    }
  } catch (error) {
    self.postMessage({ id: data.id, type: 'error', message: error.message || 'Local translation failed' });
  }
});
