import { TranslationClient, languageCode } from './translator.js';
import { LocalTranslationClient } from './local-translator.js';
import { TranslationCoordinator } from './translation-coordinator.js';
import { selectOverlayMode } from './overlay-controller.js';
import { SpeechSegmenter } from './speech-segmenter.js';
import { NativeOverlayClient } from './native-overlay-client.js';

const $ = (id) => document.getElementById(id);
const elements = {
  status: $('status'), statusDot: $('status-dot'), overlay: $('overlay-button'), start: $('start-button'), stop: $('stop-button'),
  sourceLanguage: $('source-language'), targetLanguage: $('target-language'), direction: $('direction-label'),
  sourceColumn: $('source-column-label'), targetColumn: $('target-column-label'), fontSize: $('font-size'),
  prepare: $('prepare-button'), modelStatus: $('model-status'),
  modelNotice: $('model-notice'), noticePrepare: $('notice-prepare-button'), swapLanguage: $('swap-language-button'),
  nativeNotice: $('native-notice'),
  fontSizeValue: $('font-size-value'), showSource: $('show-source'), download: $('download-button'), clear: $('clear-button'),
  transcriptList: $('transcript-list'), transcriptEmpty: $('transcript-empty'), entryCount: $('entry-count'),
  sourceCaption: $('source-caption'), targetCaption: $('target-caption')
};

const LANGUAGE_NAMES = { en: 'English', da: 'Dansk' };
const DEFAULT_SETTINGS = { sourceLanguage: 'en-US', targetLanguage: 'da', fontSize: 48, showSource: true };
const translator = new TranslationClient();
const localTranslator = new LocalTranslationClient();
const state = {
  running: false, recognition: null, microphone: null, overlayWindow: null, videoOverlay: null,
  overlayOpenedAt: 0, preferVideoOverlay: false, nativeConnected: false, transcript: loadTranscript(),
  currentSource: '', currentTarget: ''
};
let settings = loadSettings();
const translationCoordinator = new TranslationCoordinator({
  translate: (text, signal) => translateText(text, signal),
  onDraft: (source, translation) => setCurrentCaptions(source, translation),
  onError: () => setStatus('Listening · translation service delayed', 'warning'),
  isActive: () => state.running
});
const speechSegmenter = new SpeechSegmenter({ maxInterimMs: 1000, onSegment: (text) => commitFinalPhrase(text) });
const nativeOverlay = new NativeOverlayClient({ onConnectionChange: handleNativeConnection });

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ibg-console-settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function loadTranscript() {
  try { return JSON.parse(localStorage.getItem('ibg-assembly-transcript') || '[]'); }
  catch { return []; }
}

function saveSettings() { localStorage.setItem('ibg-console-settings', JSON.stringify(settings)); }
function saveTranscript() { localStorage.setItem('ibg-assembly-transcript', JSON.stringify(state.transcript.slice(-500))); }

function sourceCode() { return languageCode(settings.sourceLanguage); }
function hasOverlay() { return Boolean(state.nativeConnected || (state.overlayWindow && !state.overlayWindow.closed) || state.videoOverlay); }
function updateListeningStatus() { setStatus(hasOverlay() ? 'Listening · subtitles visible' : 'Listening · open subtitle window', hasOverlay() ? 'live' : 'warning'); }
function setStatus(message, tone = state.running ? 'live' : '') {
  elements.status.textContent = message;
  elements.statusDot.className = `status-dot ${tone}`.trim();
  updateOverlayStatus(message);
}

function applySettings() {
  elements.sourceLanguage.value = settings.sourceLanguage;
  elements.targetLanguage.value = settings.targetLanguage;
  elements.fontSize.value = settings.fontSize;
  elements.fontSizeValue.value = `${settings.fontSize} px`;
  elements.showSource.checked = settings.showSource;
  elements.direction.textContent = `${sourceCode().toUpperCase()} → ${settings.targetLanguage.toUpperCase()}`;
  elements.sourceColumn.textContent = LANGUAGE_NAMES[sourceCode()];
  elements.targetColumn.textContent = LANGUAGE_NAMES[settings.targetLanguage];
  updateOverlayAppearance();
}

function setCurrentCaptions(source, target = state.currentTarget) {
  state.currentSource = source;
  state.currentTarget = target;
  elements.sourceCaption.textContent = source || 'Waiting for speech…';
  elements.targetCaption.textContent = target || 'Translation will appear here';
  renderOverlayCaptions();
  nativeOverlay.send({
    type: 'caption', source: state.currentSource || 'Waiting for speech…', target: state.currentTarget || 'Translation will appear here',
    direction: `${sourceCode().toUpperCase()} → ${settings.targetLanguage.toUpperCase()}`, fontSize: settings.fontSize, showSource: settings.showSource
  });
}

function handleNativeConnection(connected) {
  state.nativeConnected = connected;
  elements.nativeNotice.classList.toggle('hidden', connected);
  elements.overlay.disabled = connected;
  elements.overlay.textContent = connected ? 'Native overlay connected' : 'Try browser overlay';
  nativeOverlay.send({ type: 'status', live: state.running });
  if (connected) setCurrentCaptions(state.currentSource, state.currentTarget);
  if (state.running) updateListeningStatus();
}

function overlayMode() {
  const video = document.createElement('video');
  const support = {
    documentPip: 'documentPictureInPicture' in window,
    videoPip: typeof video.requestPictureInPicture === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
  };
  if (state.preferVideoOverlay && support.videoPip) return 'video';
  return selectOverlayMode(support);
}

async function openOverlay() {
  const mode = overlayMode();
  if (mode === 'video') { await openVideoOverlay(); return; }
  if (mode === 'unsupported') { setStatus('No browser overlay is available · native app required', 'warning'); return; }
  if (state.overlayWindow && !state.overlayWindow.closed) {
    state.overlayWindow.focus();
    return;
  }
  try {
    const pipWindow = await documentPictureInPicture.requestWindow({ width: 820, height: 210, preferInitialWindowPlacement: true });
    state.overlayWindow = pipWindow;
    state.overlayOpenedAt = performance.now();
    pipWindow.document.title = 'IBG Live Subtitles';
    const style = pipWindow.document.createElement('style');
    style.textContent = overlayStyles();
    pipWindow.document.head.append(style);
    const frame = pipWindow.document.createElement('main');
    frame.className = 'subtitle-frame';
    frame.innerHTML = '<div class="overlay-status"><span></span><b>IBG LIVE SUBTITLES</b><em id="overlay-direction"></em></div><p id="overlay-source"></p><p id="overlay-target"></p>';
    pipWindow.document.body.append(frame);
    pipWindow.addEventListener('pagehide', () => {
      const closedImmediately = performance.now() - state.overlayOpenedAt < 1800;
      state.overlayWindow = null;
      state.preferVideoOverlay = closedImmediately;
      elements.overlay.textContent = closedImmediately ? 'Try compatibility overlay' : 'Open subtitle window';
      setStatus(closedImmediately ? 'Subtitle window was blocked · try compatibility overlay' : (state.running ? 'Listening · subtitle window closed' : 'Subtitle window closed'), closedImmediately || state.running ? 'warning' : '');
    }, { once: true });
    elements.overlay.textContent = 'Focus subtitle window';
    updateOverlayAppearance();
    renderOverlayCaptions();
    state.running ? updateListeningStatus() : setStatus('Subtitle window ready');
  } catch (error) {
    const video = document.createElement('video');
    const canUseVideo = typeof video.requestPictureInPicture === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    if (canUseVideo) {
      state.preferVideoOverlay = true;
      await openVideoOverlay();
    } else if (error.name !== 'NotAllowedError') setStatus(`Could not open subtitle window: ${error.message}`, 'warning');
  }
}

async function openVideoOverlay() {
  if (state.videoOverlay && document.pictureInPictureElement === state.videoOverlay.video) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 320;
  canvas.hidden = true;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0';
  const stream = canvas.captureStream(12);
  video.srcObject = stream;
  document.body.append(canvas, video);
  state.videoOverlay = { canvas, video, stream };
  drawVideoOverlay();
  try {
    await video.play();
    await video.requestPictureInPicture();
    elements.overlay.textContent = 'Subtitle window is open';
    state.running ? updateListeningStatus() : setStatus('Subtitle window ready');
    video.addEventListener('leavepictureinpicture', closeVideoOverlay, { once: true });
  } catch (error) {
    closeVideoOverlay();
    setStatus(`Could not open subtitle window: ${error.message}`, 'warning');
  }
}

function closeVideoOverlay() {
  const overlay = state.videoOverlay;
  if (!overlay) return;
  overlay.stream.getTracks().forEach((track) => track.stop());
  overlay.video.remove();
  overlay.canvas.remove();
  state.videoOverlay = null;
  elements.overlay.textContent = 'Open subtitle window';
  setStatus(state.running ? 'Listening · subtitle window closed' : 'Subtitle window closed', state.running ? 'warning' : '');
}

function drawVideoOverlay() {
  const canvas = state.videoOverlay?.canvas;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.fillStyle = '#050706';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.fillStyle = '#73d8bb';
  context.font = '800 18px system-ui';
  context.fillText(`IBG · ${state.running ? 'LIVE' : 'READY'} · ${sourceCode().toUpperCase()} → ${settings.targetLanguage.toUpperCase()}`, canvas.width / 2, 35);
  if (settings.showSource) {
    context.fillStyle = '#b8c2bf';
    context.font = `600 ${Math.max(25, settings.fontSize * .7)}px system-ui`;
    drawWrappedText(context, state.currentSource || 'Waiting for speech…', canvas.width / 2, 88, canvas.width - 80, Math.max(34, settings.fontSize * .78), 2);
  }
  context.fillStyle = '#fff';
  context.font = `800 ${Math.max(42, settings.fontSize * 1.25)}px system-ui`;
  drawWrappedText(context, state.currentTarget || 'Translation will appear here', canvas.width / 2, settings.showSource ? 182 : 105, canvas.width - 70, Math.max(52, settings.fontSize * 1.35), 2);
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const visible = lines.slice(-maxLines);
  visible.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}

function overlayStyles() {
  return `
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #050706; }
    body { display: grid; place-items: center; }
    .subtitle-frame { width: 100%; padding: 12px 22px 18px; text-align: center; }
    .overlay-status { display: flex; align-items: center; justify-content: center; gap: 7px; margin-bottom: 8px; color: #a7b2ae; font-size: 10px; letter-spacing: .1em; }
    .overlay-status span { width: 7px; height: 7px; border-radius: 50%; background: #20c997; box-shadow: 0 0 0 4px rgba(32,201,151,.12); }
    .overlay-status em { margin-left: 5px; color: #73d8bb; font-style: normal; font-weight: 800; }
    p { margin: 0 auto; max-width: 100%; overflow-wrap: anywhere; text-wrap: balance; }
    #overlay-source { display: ${settings.showSource ? 'block' : 'none'}; margin-bottom: 5px; color: #b8c2bf; font-size: ${Math.max(18, settings.fontSize * .52)}px; line-height: 1.18; }
    #overlay-target { color: #fff; font-size: ${settings.fontSize}px; font-weight: 850; line-height: 1.13; letter-spacing: -.025em; text-shadow: 0 2px 4px #000; }
  `;
}

function updateOverlayAppearance() {
  const doc = state.overlayWindow?.document;
  if (!doc) return;
  const style = doc.querySelector('style');
  if (style) style.textContent = overlayStyles();
  const direction = doc.getElementById('overlay-direction');
  if (direction) direction.textContent = `${sourceCode().toUpperCase()} → ${settings.targetLanguage.toUpperCase()}`;
  drawVideoOverlay();
  if (state.nativeConnected) setCurrentCaptions(state.currentSource, state.currentTarget);
}

function renderOverlayCaptions() {
  const doc = state.overlayWindow?.document;
  if (!doc) return;
  const source = doc.getElementById('overlay-source');
  const target = doc.getElementById('overlay-target');
  if (source) source.textContent = state.currentSource || 'Waiting for speech…';
  if (target) target.textContent = state.currentTarget || 'Translation will appear here';
  drawVideoOverlay();
}

function updateOverlayStatus(message) {
  const status = state.overlayWindow?.document?.querySelector('.overlay-status b');
  if (status) status.textContent = state.running ? 'IBG · LIVE' : `IBG · ${message.toUpperCase()}`;
  drawVideoOverlay();
  nativeOverlay.send({ type: 'status', live: state.running });
}

function speechRecognitionConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition; }

async function startSubtitles() {
  const SpeechRecognition = speechRecognitionConstructor();
  if (!SpeechRecognition) { setStatus('Speech recognition requires desktop Chrome or Edge', 'warning'); return; }
  if (!localTranslator.readyFor(sourceCode(), settings.targetLanguage)) {
    elements.modelNotice.classList.remove('hidden', 'attention');
    void elements.modelNotice.offsetWidth;
    elements.modelNotice.classList.add('attention');
  }
  try {
    state.microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch (error) {
    setStatus(error.name === 'NotAllowedError' ? 'Microphone permission was not granted' : `Microphone error: ${error.message}`, 'warning');
    return;
  }
  state.running = true;
  elements.start.disabled = true;
  elements.stop.disabled = false;
  createRecognition(SpeechRecognition);
  updateListeningStatus();
}

function createRecognition(SpeechRecognition = speechRecognitionConstructor()) {
  if (!state.running || !SpeechRecognition) return;
  const recognition = new SpeechRecognition();
  state.recognition = recognition;
  recognition.lang = settings.sourceLanguage;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = handleSpeechResult;
  recognition.onerror = ({ error }) => {
    if (['aborted', 'no-speech'].includes(error)) return;
    const messages = { 'not-allowed': 'Microphone permission was blocked', 'audio-capture': 'No microphone is available', network: 'Speech service network error' };
    setStatus(messages[error] || `Speech recognition error: ${error}`, 'warning');
  };
  recognition.onend = () => {
    if (state.running && state.recognition === recognition) window.setTimeout(() => createRecognition(SpeechRecognition), 300);
  };
  try { recognition.start(); }
  catch (error) { setStatus(`Could not start speech recognition: ${error.message}`, 'warning'); }
}

function handleSpeechResult(event) {
  let interim = '';
  const finals = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const text = event.results[index][0].transcript.trim();
    if (event.results[index].isFinal) finals.push(text);
    else interim += `${text} `;
  }
  if (interim.trim()) {
    setCurrentCaptions(interim.trim());
    speechSegmenter.receiveInterim(interim.trim());
  }
  finals.filter(Boolean).forEach((text) => speechSegmenter.receiveFinal(text));
}

async function commitFinalPhrase(text) {
  setCurrentCaptions(text, 'Translating…');
  const entry = { id: crypto.randomUUID(), time: new Date().toISOString(), source: text, translation: '' };
  state.transcript.push(entry);
  saveTranscript();
  renderTranscript();
  try {
    const result = await translationCoordinator.translateFinal(text);
    entry.translation = result.translation;
    if (result.isCurrent) setCurrentCaptions(text, entry.translation);
    if (state.running) updateListeningStatus();
  } catch (error) {
    entry.translation = 'Translation unavailable';
    if (error.isCurrent) setCurrentCaptions(text, entry.translation);
    if (state.running) setStatus(`Listening · ${error.message}`, 'warning');
  } finally {
    saveTranscript();
    renderTranscript();
  }
}

function stopSubtitles() {
  state.running = false;
  state.recognition?.abort();
  state.recognition = null;
  state.microphone?.getTracks().forEach((track) => track.stop());
  state.microphone = null;
  translationCoordinator.stopDrafts();
  speechSegmenter.reset();
  elements.start.disabled = false;
  elements.stop.disabled = true;
  setStatus('Stopped');
}

function translateText(text, signal) {
  if (localTranslator.readyFor(sourceCode(), settings.targetLanguage)) {
    return localTranslator.translate(text, sourceCode(), settings.targetLanguage, signal);
  }
  return translator.translate(text, sourceCode(), settings.targetLanguage, signal);
}

async function prepareLocalTranslation() {
  elements.prepare.disabled = true;
  elements.noticePrepare.disabled = true;
  elements.modelStatus.textContent = 'Starting model download…';
  try {
    await localTranslator.prepare(sourceCode(), settings.targetLanguage, (message) => { elements.modelStatus.textContent = message; });
    elements.prepare.textContent = 'Local translation ready';
    elements.noticePrepare.textContent = 'Local translation ready';
    elements.prepare.parentElement.classList.add('ready');
    elements.modelNotice.classList.add('hidden');
    elements.modelStatus.textContent = 'Ready · translation now runs locally without quotas';
    setStatus('Local translation ready');
  } catch (error) {
    elements.prepare.disabled = false;
    elements.noticePrepare.disabled = false;
    elements.modelStatus.textContent = `Could not prepare model · ${error.message}`;
    setStatus('Using online translation fallback', 'warning');
  }
}

function resetLocalTranslation() {
  localTranslator.close();
  elements.prepare.disabled = false;
  elements.noticePrepare.disabled = false;
  elements.prepare.textContent = 'Prepare local translation';
  elements.noticePrepare.textContent = 'Prepare now';
  elements.prepare.parentElement.classList.remove('ready');
  elements.modelStatus.textContent = 'Recommended before the assembly · one-time model download';
  elements.modelNotice.classList.remove('hidden');
}

function swapLanguages() {
  settings.sourceLanguage = sourceCode() === 'en' ? 'da-DK' : 'en-US';
  settings.targetLanguage = sourceCode() === 'en' ? 'da' : 'en';
  resetLocalTranslation(); saveSettings(); applySettings(); restartRecognition();
  setStatus('Language direction changed · prepare the matching local model', 'warning');
}

function restartRecognition() {
  if (!state.running) return;
  const previous = state.recognition;
  state.recognition = null;
  previous?.abort();
  createRecognition();
}

function renderTranscript() {
  elements.transcriptList.replaceChildren();
  if (!state.transcript.length) {
    elements.transcriptList.append(elements.transcriptEmpty);
  } else {
    for (const entry of state.transcript) {
      const row = document.createElement('article');
      row.className = 'transcript-row';
      const time = document.createElement('time');
      time.className = 'row-time';
      time.dateTime = entry.time;
      time.textContent = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const source = document.createElement('p');
      source.className = 'row-source';
      source.textContent = entry.source;
      const target = document.createElement('p');
      target.className = `row-target${entry.translation ? '' : ' pending'}`;
      target.textContent = entry.translation || 'Translating…';
      row.append(time, source, target);
      elements.transcriptList.append(row);
    }
    elements.transcriptList.scrollTop = elements.transcriptList.scrollHeight;
  }
  const count = state.transcript.length;
  elements.entryCount.textContent = `${count} ${count === 1 ? 'phrase' : 'phrases'}`;
}

function downloadTranscript() {
  if (!state.transcript.length) { setStatus('There is no transcript to download', 'warning'); return; }
  const lines = ['IBG ASSEMBLY TRANSCRIPT', new Date().toLocaleString(), `${LANGUAGE_NAMES[sourceCode()]} → ${LANGUAGE_NAMES[settings.targetLanguage]}`, ''];
  for (const entry of state.transcript) lines.push(`[${new Date(entry.time).toLocaleTimeString()}] ${entry.source}`, entry.translation, '');
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `ibg-transcript-${new Date().toISOString().slice(0, 10)}.txt` });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

elements.overlay.addEventListener('click', openOverlay);
elements.start.addEventListener('click', startSubtitles);
elements.stop.addEventListener('click', stopSubtitles);
elements.prepare.addEventListener('click', prepareLocalTranslation);
elements.noticePrepare.addEventListener('click', prepareLocalTranslation);
elements.swapLanguage.addEventListener('click', swapLanguages);
elements.sourceLanguage.addEventListener('change', () => {
  settings.sourceLanguage = elements.sourceLanguage.value;
  settings.targetLanguage = sourceCode() === 'en' ? 'da' : 'en';
  resetLocalTranslation(); saveSettings(); applySettings(); restartRecognition(); renderTranscript();
});
elements.targetLanguage.addEventListener('change', () => { settings.targetLanguage = elements.targetLanguage.value; resetLocalTranslation(); saveSettings(); applySettings(); });
elements.fontSize.addEventListener('input', () => { settings.fontSize = Number(elements.fontSize.value); saveSettings(); applySettings(); });
elements.showSource.addEventListener('change', () => { settings.showSource = elements.showSource.checked; saveSettings(); applySettings(); });
elements.download.addEventListener('click', downloadTranscript);
elements.clear.addEventListener('click', () => {
  if (state.transcript.length && !confirm('Clear the complete assembly transcript?')) return;
  state.transcript = []; saveTranscript(); renderTranscript(); setCurrentCaptions('', ''); setStatus('Transcript cleared');
});
window.addEventListener('beforeunload', () => { stopSubtitles(); nativeOverlay.close(); });
document.addEventListener('keydown', (event) => { if (event.key.toLocaleLowerCase() === 'l' && !/input|select/i.test(event.target.tagName)) swapLanguages(); });

applySettings();
renderTranscript();
nativeOverlay.connect();
if (new URLSearchParams(location.search).has('demo')) {
  state.transcript = [
    { id: 'demo-1', time: new Date(Date.now() - 60000).toISOString(), source: 'Good morning and welcome to today’s assembly.', translation: 'Godmorgen og velkommen til dagens fællessamling.' },
    { id: 'demo-2', time: new Date().toISOString(), source: 'We will begin with this week’s announcements.', translation: 'Vi begynder med denne uges meddelelser.' }
  ];
  renderTranscript();
  setCurrentCaptions(state.transcript[1].source, state.transcript[1].translation);
}
if (!window.isSecureContext) setStatus('Open over HTTPS to use microphone and subtitle window', 'warning');
else if (!speechRecognitionConstructor()) setStatus('Use current desktop Chrome or Edge', 'warning');
else if (overlayMode() === 'unsupported') setStatus('No browser overlay available · native app required', 'warning');
