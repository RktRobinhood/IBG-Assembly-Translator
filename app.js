import { TranslationClient, languageCode } from './translator.js';

const $ = (id) => document.getElementById(id);
const elements = {
  status: $('status'), statusDot: $('status-dot'), overlay: $('overlay-button'), start: $('start-button'), stop: $('stop-button'),
  sourceLanguage: $('source-language'), targetLanguage: $('target-language'), direction: $('direction-label'),
  sourceColumn: $('source-column-label'), targetColumn: $('target-column-label'), fontSize: $('font-size'),
  fontSizeValue: $('font-size-value'), showSource: $('show-source'), download: $('download-button'), clear: $('clear-button'),
  transcriptList: $('transcript-list'), transcriptEmpty: $('transcript-empty'), entryCount: $('entry-count'),
  sourceCaption: $('source-caption'), targetCaption: $('target-caption')
};

const LANGUAGE_NAMES = { en: 'English', da: 'Dansk' };
const DEFAULT_SETTINGS = { sourceLanguage: 'en-US', targetLanguage: 'da', fontSize: 48, showSource: true };
const translator = new TranslationClient();
const state = {
  running: false, recognition: null, microphone: null, overlayWindow: null, transcript: loadTranscript(),
  draftTimer: null, draftBusy: false, draftQueued: '', draftRequest: null, finalRequests: new Set(),
  translationSequence: 0, lastDraft: '', currentSource: '', currentTarget: ''
};
let settings = loadSettings();

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
}

function overlaySupported() { return 'documentPictureInPicture' in window; }

async function openOverlay() {
  if (!overlaySupported()) {
    setStatus('Always-on-top subtitles require current desktop Chrome or Edge', 'warning');
    return;
  }
  if (state.overlayWindow && !state.overlayWindow.closed) {
    state.overlayWindow.focus();
    return;
  }
  try {
    const pipWindow = await documentPictureInPicture.requestWindow({ width: 960, height: 260, preferInitialWindowPlacement: true });
    state.overlayWindow = pipWindow;
    pipWindow.document.title = 'IBG Live Subtitles';
    const style = pipWindow.document.createElement('style');
    style.textContent = overlayStyles();
    pipWindow.document.head.append(style);
    const frame = pipWindow.document.createElement('main');
    frame.className = 'subtitle-frame';
    frame.innerHTML = '<div class="overlay-status"><span></span><b>IBG LIVE SUBTITLES</b><em id="overlay-direction"></em></div><p id="overlay-source"></p><p id="overlay-target"></p>';
    pipWindow.document.body.append(frame);
    pipWindow.addEventListener('pagehide', () => {
      state.overlayWindow = null;
      elements.overlay.textContent = 'Open subtitle window';
      setStatus(state.running ? 'Listening · subtitle window closed' : 'Subtitle window closed', state.running ? 'warning' : '');
    }, { once: true });
    elements.overlay.textContent = 'Focus subtitle window';
    updateOverlayAppearance();
    renderOverlayCaptions();
    setStatus(state.running ? 'Listening · subtitles visible' : 'Subtitle window ready', state.running ? 'live' : '');
  } catch (error) {
    if (error.name !== 'NotAllowedError') setStatus(`Could not open subtitle window: ${error.message}`, 'warning');
  }
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
}

function renderOverlayCaptions() {
  const doc = state.overlayWindow?.document;
  if (!doc) return;
  const source = doc.getElementById('overlay-source');
  const target = doc.getElementById('overlay-target');
  if (source) source.textContent = state.currentSource || 'Waiting for speech…';
  if (target) target.textContent = state.currentTarget || 'Translation will appear here';
}

function updateOverlayStatus(message) {
  const status = state.overlayWindow?.document?.querySelector('.overlay-status b');
  if (status) status.textContent = state.running ? 'IBG · LIVE' : `IBG · ${message.toUpperCase()}`;
}

function speechRecognitionConstructor() { return window.SpeechRecognition || window.webkitSpeechRecognition; }

async function startSubtitles() {
  const SpeechRecognition = speechRecognitionConstructor();
  if (!SpeechRecognition) { setStatus('Speech recognition requires desktop Chrome or Edge', 'warning'); return; }
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
  setStatus(state.overlayWindow ? 'Listening · subtitles visible' : 'Listening · open subtitle window', state.overlayWindow ? 'live' : 'warning');
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
    scheduleDraftTranslation(interim.trim());
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
    const translated = await translator.translate(text, sourceCode(), settings.targetLanguage, state.draftRequest.signal);
    if (sequence === state.translationSequence) setCurrentCaptions(text, translated);
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('Listening · translation service delayed', 'warning');
  } finally {
    state.draftBusy = false;
    if (state.running && state.draftQueued !== text) state.draftTimer = window.setTimeout(runDraftTranslation, 350);
  }
}

async function commitFinalPhrase(text) {
  clearTimeout(state.draftTimer);
  state.draftTimer = null;
  state.draftRequest?.abort();
  const sequence = ++state.translationSequence;
  setCurrentCaptions(text, 'Translating…');
  const entry = { id: crypto.randomUUID(), time: new Date().toISOString(), source: text, translation: '' };
  state.transcript.push(entry);
  saveTranscript();
  renderTranscript();
  const request = new AbortController();
  state.finalRequests.add(request);
  try {
    entry.translation = await translator.translate(text, sourceCode(), settings.targetLanguage, request.signal);
    if (sequence === state.translationSequence) setCurrentCaptions(text, entry.translation);
    if (state.running) setStatus(state.overlayWindow ? 'Listening · subtitles visible' : 'Listening · open subtitle window', state.overlayWindow ? 'live' : 'warning');
  } catch (error) {
    if (request.signal.aborted) return;
    entry.translation = 'Translation unavailable';
    if (sequence === state.translationSequence) setCurrentCaptions(text, entry.translation);
    if (state.running) setStatus(`Listening · ${error.message}`, 'warning');
  } finally {
    state.finalRequests.delete(request);
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
  clearTimeout(state.draftTimer);
  state.draftTimer = null;
  state.draftRequest?.abort();
  state.finalRequests.forEach((request) => request.abort());
  state.finalRequests.clear();
  state.translationSequence += 1;
  elements.start.disabled = false;
  elements.stop.disabled = true;
  setStatus('Stopped');
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
elements.sourceLanguage.addEventListener('change', () => {
  settings.sourceLanguage = elements.sourceLanguage.value;
  settings.targetLanguage = sourceCode() === 'en' ? 'da' : 'en';
  saveSettings(); applySettings(); restartRecognition(); renderTranscript();
});
elements.targetLanguage.addEventListener('change', () => { settings.targetLanguage = elements.targetLanguage.value; saveSettings(); applySettings(); });
elements.fontSize.addEventListener('input', () => { settings.fontSize = Number(elements.fontSize.value); saveSettings(); applySettings(); });
elements.showSource.addEventListener('change', () => { settings.showSource = elements.showSource.checked; saveSettings(); applySettings(); });
elements.download.addEventListener('click', downloadTranscript);
elements.clear.addEventListener('click', () => {
  if (state.transcript.length && !confirm('Clear the complete assembly transcript?')) return;
  state.transcript = []; saveTranscript(); renderTranscript(); setCurrentCaptions('', ''); setStatus('Transcript cleared');
});
window.addEventListener('beforeunload', stopSubtitles);

applySettings();
renderTranscript();
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
else if (!overlaySupported()) setStatus('Update Chrome or Edge for always-on-top subtitles', 'warning');
