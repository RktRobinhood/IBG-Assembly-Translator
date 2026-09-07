# IBG Assembly Translator

A practical operator console for live English ↔ Danish school-assembly subtitles.

## Assembly workflow

1. Open the [live site](https://rktrobinhood.github.io/IBG-Assembly-Translator/) in a current desktop version of Chrome or Edge.
2. Select **Open subtitle window**. A compact Picture-in-Picture window opens and remains above PowerPoint, video, browser tabs, and other applications.
3. Resize the subtitle window, place it along the bottom of the projector display, and leave it there.
4. Select **Start listening** and allow microphone access.
5. Run PowerPoint normally. Keep the operator console open in the background.

The main console retains the bilingual transcript throughout the assembly. The subtitle window has a solid, high-contrast surface, so it remains readable regardless of the slide behind it. It deliberately does not capture or duplicate the presentation.

## Browser and service requirements

- Desktop Chrome 116+ or a current Chromium-based Edge release is required for Document Picture-in-Picture.
- The page must be served over HTTPS (GitHub Pages provides this).
- Speech recognition and translation require internet access.
- Translation uses the public MyMemory service, which may enforce usage limits. Chrome's experimental built-in Translator is disabled because its language-model process can crash on otherwise supported systems.

## Operator features

- Always-on-top subtitle window for PowerPoint and other applications
- Immediate display of interim speech
- English → Danish and Danish → English modes
- Persistent bilingual transcript with timestamps
- Downloadable plain-text assembly transcript
- Adjustable subtitle size and optional original-language line
- Session state survives an accidental page refresh

## Run and test locally

```powershell
npm start
npm test
```

Add `?demo=1` to the URL to inspect the complete operator layout without microphone access.

## GitHub Pages

The project uses only static HTML, CSS, and JavaScript. All asset paths are repository-relative and covered by static hosting tests. Pushes to `main` update the existing branch-based Pages deployment.
