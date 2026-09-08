# IBG Assembly Translator

A practical operator console for live English ↔ Danish school-assembly subtitles.

## Assembly workflow

1. Download and run `IBG-Subtitle-Overlay.exe` from the [latest release](https://github.com/RktRobinhood/IBG-Assembly-Translator/releases/latest).
2. Open the [live site](https://rktrobinhood.github.io/IBG-Assembly-Translator/) in a current desktop version of Chrome or Edge. The red overlay warning disappears when the companion connects.
3. Drag and resize the native subtitle window along the bottom of the projector display.
4. Before the event, select **Prepare local translation** once and wait for the model to report ready. The model is cached by the browser.
5. Select **Start listening** and allow microphone access.
6. Run PowerPoint normally. Keep the operator console open in the background.

The main console retains the bilingual transcript throughout the assembly. The native subtitle window is borderless, always on top, and has a high-contrast surface, so it remains readable regardless of the slide behind it. It deliberately does not capture or duplicate the presentation. Browser Picture-in-Picture remains available as a fallback where supported.

## Browser and service requirements

- Windows 10/11 is required for the native overlay companion. Browser Picture-in-Picture is only a fallback.
- The page must be served over HTTPS (GitHub Pages provides this).
- Speech recognition requires internet access.
- Prepared translation runs locally in the browser using a cached English/Danish model. The first model download is approximately 100 MB per direction and requires internet access.
- Until the local model is ready, the public MyMemory service is used as a quick-start fallback and may enforce usage limits. Chrome's experimental built-in Translator remains disabled because its language-model process can crash on otherwise supported systems.

## Operator features

- Always-on-top subtitle window for PowerPoint and other applications
- Immediate display of interim speech
- English → Danish and Danish → English modes
- Persistent bilingual transcript with timestamps
- Downloadable plain-text assembly transcript
- Adjustable subtitle size and optional original-language line
- Session state survives an accidental page refresh
- Native Rust overlay connected over localhost; no caption data is sent to the companion over the network

## Run and test locally

```powershell
npm start
npm test
```

Add `?demo=1` to the URL to inspect the complete operator layout without microphone access.

## GitHub Pages

The project uses only static HTML, CSS, and JavaScript. All asset paths are repository-relative and covered by static hosting tests. Pushes to `main` update the existing branch-based Pages deployment.

## Build the Windows overlay

```powershell
cargo build --manifest-path native-overlay/Cargo.toml --release
```
