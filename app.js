import { chooseCaptionTheme } from './contrast.js';
import { TranslationClient, languageCode } from './translator.js';

const $ = (id) => document.getElementById(id);
const elements = {
  stage: $('stage'), presentation: $('presentation'), empty: $('empty-state'), captions: $('captions'),
  sourceCaption: $('source-caption'), targetCaption: $('target-caption'), status: $('status'), dot: $('live-dot'),
  start: $('start-button'), stop: $('stop-button'), share: $('share-button'), emptyShare: $('empty-share'),
  fullscreen: $('fullscreen-button'), settings: $('settings-button'), dialog: $('settings-dialog'),
  sourceLanguage: $('source-language'), targetLanguage: $('target-language'), fontSize: $('font-size'),
  fontSizeValue: $('font-size-value'), scrim: $('scrim'), scrimValue: $('scrim-value'),
  showSource: $('show-source'), adaptive: $('adaptive-colour'), download: $('download-button'),
  clear: $('clear-button'), sampler: $('sampler')
};

const DEFAULT_SETTINGS = { sourceLanguage: 'en-US', targetLanguage: 'da', fontSize: 52, scrim: 56, showSource: true, adaptive: true };
const state = {
  running: false, recognition: null, microphone: null, presentation: null, transcript: [],
  draftTimer: null, draftRequest: null, draftQueued: '', draftBusy: false,
  translationSequence: 0, lastDraft: '', theme: 'dark', uiTimer: null
};
const translator = new TranslationClient();
let settings = loadSettings();

function setStatus(message, active = state.running) {
  elements.status.textContent = message;
  elements.dot.classList.toggle('active', active);
}

function showCaption(element, text) {
  element.textContent = text;
  element.classList.toggle('visible', Boolean(text));
}

function applySettings() {
  elements.sourceLanguage.value = settings.sourceLanguage;
  elements.targetLanguage.value = settings.targetLanguage;
  elements.fontSize.value = settings.fontSize;
  elements.fontSizeValue.value = `${settings.fontSize} px`;
  elements.scrim.value = settings.scrim;
  elements.scrimValue.value = `${settings.scrim}%`;
  elements.showSource.checked = settings.showSource;
  elements.adaptive.checked = settings.adaptive;
  document.documentElement.style.setProperty('--caption-size', `${settings.fontSize}px`);
  elements.sourceCaption.style.display = settings.showSource ? '' : 'none';
  applyTheme(settings.adaptive ? state.theme : 'dark');
}

function applyTheme(theme) {
  state.theme = theme;
  const visibleTheme = settings.adaptive ? theme : 'dark';
  elements.captions.classList.toggle('caption-theme-light', visibleTheme === 'light');
  elements.captions.classList.toggle('caption-theme-dark', visibleTheme !== 'light');
  const alpha = settings.scrim / 100;
  const scrim = visibleTheme === 'light' ? `rgba(255,255,255,${Math.min(.88, alpha + .12)})` : `rgba(0,0,0,${alpha})`;
  document.documentElement.style.setProperty('--caption-scrim', scrim);
}

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ibg-live-settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function persistSettings() { localStorage.setItem('ibg-live-settings', JSON.stringify(settings)); }

async function sharePresentation() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus('Screen sharing requires Chrome or Edge over HTTPS', false);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    stopPresentation();
    state.presentation = stream;
    elements.presentation.srcObject = stream;
    await elements.presentation.play();
    elements.presentation.classList.add('active');
    elements.empty.classList.add('hidden');
    elements.share.textContent = 'Change presentation';
    stream.getVideoTracks()[0].addEventListener('ended', stopPresentation, { once: true });
    setStatus(state.running ? 'Listening · presentation shared' : 'Presentation shared', state.running);
  } catch (error) {
    if (error.name !== 'NotAllowedError') setStatus(`Could not share presentation: ${error.message}`, false);
  }
}

function stopPresentation() {
  state.presentation?.getTracks().forEach((track) => track.stop());
  state.presentation = null;
  elements.presentation.srcObject = null;
  elements.presentation.classList.remove('active');
  elements.empty.classList.remove('hidden');
  elements.share.textContent = 'Share presentation';
  applyTheme('dark');
}

function speechRecognitionConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition; }

async function startSubtitles() {
  const SpeechRecognition = speechRecognitionConstructor();
  if (!SpeechRecognition) {
    setStatus('Live speech recognition requires Chrome or Edge', false);
    return;
  }
  try {
    state.microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch (error) {
    setStatus(error.name === 'NotAllowedError' ? 'Microphone permission was not granted' : `Microphone error: ${error.message}`, false);
    return;
  }

  state.running = true;
  elements.start.disabled = true;
  elements.stop.disabled = false;
  createRecognition(SpeechRecognition);
  setStatus('Listening…');
}

function createRecognition(SpeechRecognition = speechRecognitionConstructor()) {
  if (!state.running || !SpeechRecognition) return;
  const recognition = new SpeechRecognition();
  state.recognition = recognition;
  recognition.lang = settings.sourceLanguage;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => setStatus('Listening…');
  recognition.onresult = handleSpeechResult;
  recognition.onerror = ({ error }) => {
    if (['aborted', 'no-speech'].includes(error)) return;
    const messages = { 'not-allowed': 'Microphone permission was blocked', 'audio-capture': 'No microphone is available', network: 'Speech service network error' };
    setStatus(messages[error] || `Speech recognition error: ${error}`, error === 'network');
  };
  recognition.onend = () => {
    if (state.running && state.recognition === recognition) window.setTimeout(() => createRecognition(SpeechRecognition), 300);
  };
  try { recognition.start(); }
  catch (error) { setStatus(`Could not start speech recognition: ${error.message}`, false); }
}

function handleSpeechResult(event) {
  let interim = '';
  const finals = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const text = event.results[index][0].transcript.trim();
    if (event.results[index].isFinal) finals.push(text);
    else interim += `${text} `;
  }
  const cleanInterim = interim.trim();
  if (cleanInterim) {
    showCaption(elements.sourceCaption, cleanInterim);
    scheduleDraftTranslation(cleanInterim);
  }
  finals.filter(Boolean).forEach(commitFinalPhrase);
}

function scheduleDraftTranslation(text) {
  if (text.length < 3 || text === state.lastDraft) return;
  state.lastDraft = text;
  state.draftQueued = text;
  if (state.draftTimer || state.draftBusy) return;
  state.draftTimer = window.setTimeout(runDraftTranslation, 450);
}

async function runDraftTranslation() {
  state.draftTimer = null;
  state.draftBusy = true;
  const text = state.draftQueued;
  state.draftRequest = new AbortController();
  const sequence = ++state.translationSequence;
  try {
    const translated = await translator.translate(text, languageCode(settings.sourceLanguage), settings.targetLanguage, state.draftRequest.signal);
    if (sequence === state.translationSequence) showCaption(elements.targetCaption, translated);
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('Listening · translation service delayed');
  } finally {
    state.draftBusy = false;
    if (state.running && state.draftQueued !== text) state.draftTimer = window.setTimeout(runDraftTranslation, 350);
  }
}

async function commitFinalPhrase(text) {
  clearTimeout(state.draftTimer);
  state.draftRequest?.abort();
  const sequence = ++state.translationSequence;
  showCaption(elements.sourceCaption, text);
  setStatus('Translating…');
  const entry = { time: new Date().toISOString(), source: text, translation: '' };
  state.transcript.push(entry);
  try {
    const translated = await translator.translate(text, languageCode(settings.sourceLanguage), settings.targetLanguage);
    entry.translation = translated;
    if (sequence === state.translationSequence) showCaption(elements.targetCaption, translated);
    setStatus('Listening…');
  } catch (error) {
    entry.translation = '[translation unavailable]';
    if (sequence === state.translationSequence) showCaption(elements.targetCaption, 'Translation unavailable');
    setStatus(`Listening · ${error.message}`);
  }
}

function stopSubtitles() {
  state.running = false;
  state.recognition?.abort();
  state.recognition = null;
  state.microphone?.getTracks().forEach((track) => track.stop());
  state.microphone = null;
  clearTimeout(state.draftTimer);
  state.draftRequest?.abort();
  elements.start.disabled = false;
  elements.stop.disabled = true;
  setStatus('Stopped', false);
}

function restartForLanguageChange() {
  if (!state.running) return;
  const previous = state.recognition;
  state.recognition = null;
  previous?.abort();
  createRecognition();
}

function samplePresentationColour() {
  if (!state.presentation || elements.presentation.readyState < 2 || !settings.adaptive) return;
  const context = elements.sampler.getContext('2d', { willReadFrequently: true });
  const width = elements.sampler.width;
  const height = elements.sampler.height;
  const videoWidth = elements.presentation.videoWidth;
  const videoHeight = elements.presentation.videoHeight;
  if (!videoWidth || !videoHeight) return;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  context.drawImage(elements.presentation, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const sample = context.getImageData(0, Math.floor(height * .62), width, Math.ceil(height * .38));
  applyTheme(chooseCaptionTheme(sample));
}

function downloadTranscript() {
  if (!state.transcript.length) { setStatus('There is no transcript to download', state.running); return; }
  const lines = ['IBG ASSEMBLY TRANSCRIPT', new Date().toLocaleString(), ''];
  for (const entry of state.transcript) {
    lines.push(`[${new Date(entry.time).toLocaleTimeString()}] ${entry.source}`, entry.translation, '');
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `ibg-transcript-${new Date().toISOString().slice(0, 10)}.txt` });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function showUiTemporarily() {
  document.body.classList.remove('ui-idle');
  clearTimeout(state.uiTimer);
  if (state.presentation && !elements.dialog.open) state.uiTimer = window.setTimeout(() => document.body.classList.add('ui-idle'), 2800);
}

elements.start.addEventListener('click', startSubtitles);
elements.stop.addEventListener('click', stopSubtitles);
elements.share.addEventListener('click', sharePresentation);
elements.emptyShare.addEventListener('click', sharePresentation);
elements.fullscreen.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : elements.stage.requestFullscreen());
elements.settings.addEventListener('click', () => { elements.dialog.showModal(); elements.settings.setAttribute('aria-expanded', 'true'); });
elements.dialog.addEventListener('close', () => { elements.settings.setAttribute('aria-expanded', 'false'); showUiTemporarily(); });
elements.sourceLanguage.addEventListener('change', () => {
  settings.sourceLanguage = elements.sourceLanguage.value;
  settings.targetLanguage = languageCode(settings.sourceLanguage) === 'en' ? 'da' : 'en';
  persistSettings(); applySettings(); restartForLanguageChange();
});
elements.targetLanguage.addEventListener('change', () => { settings.targetLanguage = elements.targetLanguage.value; persistSettings(); });
elements.fontSize.addEventListener('input', () => { settings.fontSize = Number(elements.fontSize.value); persistSettings(); applySettings(); });
elements.scrim.addEventListener('input', () => { settings.scrim = Number(elements.scrim.value); persistSettings(); applySettings(); });
elements.showSource.addEventListener('change', () => { settings.showSource = elements.showSource.checked; persistSettings(); applySettings(); });
elements.adaptive.addEventListener('change', () => { settings.adaptive = elements.adaptive.checked; persistSettings(); applySettings(); });
elements.download.addEventListener('click', downloadTranscript);
elements.clear.addEventListener('click', () => { state.transcript = []; showCaption(elements.sourceCaption, ''); showCaption(elements.targetCaption, ''); setStatus('Transcript cleared', state.running); });
document.addEventListener('mousemove', showUiTemporarily, { passive: true });
document.addEventListener('keydown', (event) => {
  showUiTemporarily();
  if (event.key === 'Escape' || /input|select/i.test(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); state.running ? stopSubtitles() : startSubtitles(); }
  if (event.key.toLowerCase() === 'f') elements.fullscreen.click();
});
window.addEventListener('beforeunload', () => { stopSubtitles(); stopPresentation(); });
window.setInterval(samplePresentationColour, 450);

applySettings();
if (new URLSearchParams(location.search).has('demo')) {
  showCaption(elements.sourceCaption, 'Welcome to today’s assembly');
  showCaption(elements.targetCaption, 'Velkommen til dagens fællessamling');
}
if (!window.isSecureContext) setStatus('Open over HTTPS or localhost to use microphone and screen sharing', false);
else if (!speechRecognitionConstructor()) setStatus('Use Chrome or Edge for live speech recognition', false);
