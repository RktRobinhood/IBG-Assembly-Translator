# IBG Live Translator

Live English ↔ Danish assembly subtitles that can sit over any visual content. The app runs as a static website in Chrome or Edge—no Rust build or local installation is required.

## What changed

- Speech is shown immediately from interim recognition results.
- Interim phrases are translated continuously instead of waiting for a completed sentence.
- A shared PowerPoint window, screen, PDF, or video becomes the full-screen presentation background.
- The area behind the captions is sampled several times per second. Captions switch between dark-on-light and light-on-dark, with an outline and adjustable translucent background.
- Controls disappear automatically during a presentation and return when the mouse moves.
- Font size, original-language visibility, colour adjustment, and the caption background are configurable.
- The bilingual transcript can be downloaded after the assembly.

## Use it

1. Open the GitHub Pages URL in **Chrome or Edge**. Microphone and screen capture require HTTPS (or localhost during development).
2. Select **Share presentation** and choose the PowerPoint *window* or another source. Do not select this browser tab, or it will create a hall-of-mirrors effect.
3. Select **Start subtitles** and allow microphone access.
4. Use **Fullscreen**. Move the mouse whenever you need the controls again.
5. Choose English or Danish under **Settings**. The translation direction updates automatically.

Speech recognition is supplied by the browser. On supported Chrome/Edge versions, translation uses the browser's on-device Translator API. If that API or its language pack is unavailable, the app falls back to the public MyMemory service, which needs internet access and may enforce usage limits. This keeps the project deployable as a static GitHub Pages site without exposing an API key.

## Run locally

```powershell
npm start
```

Then open the printed localhost URL in Chrome or Edge.

To see the caption layout without using a microphone, add `?demo=1` to the URL.

## Test

```powershell
npm test
```
