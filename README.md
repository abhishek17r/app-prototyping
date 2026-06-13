# Proto-Kit

Upload a screen recording of an existing mobile app. Describe a feature you want to test inside it. Get back a clickable HTML mockup that looks like the source app with your new feature wired in.

Powered by OpenAI (multimodal). Self-hostable. Bring your own OpenAI API key — the server only proxies; nothing is stored on disk.

## Quick start

```bash
git clone https://github.com/abhishek17r/app-prototyping.git
cd app-prototyping
./go.sh                       # installs deps + starts server on :4488
```

Open `http://localhost:4488`. Click **⚙ Settings**, paste your OpenAI API key, save. Type a feature description, hit **✨ Generate**.

Get an API key at [platform.openai.com](https://platform.openai.com/api-keys).

## What it does

1. **Upload a video** of the existing app you want to prototype inside (e.g. record your screen using Netflix, Spotify, your own app). MP4/MOV up to 120 MB.
2. **Describe the feature** in plain English — "Add a custom-lists feature to the title page", "Add a tip selector to the order detail", "Add a price alert on the product page".
3. **Generate.** The server samples ~8 frames evenly from the video and sends them to OpenAI as the visual reference. The model returns a single self-contained HTML file that **mimics the source app's look** (brand color, typography, navigation, density) and has the new feature wired in clickably.
4. **Refine.** After the first generation, follow-up prompts ("make the Continue button bigger", "add a 'Skip' link") update the prototype. The frames stay cached server-side for 1h so refines don't re-upload.
5. **Download / share.** Save the `.html` or open it in a new tab. Runs in any browser with zero dependencies.

History persists in `localStorage`. Each item is one prototype + its full prompt thread.

## Configuration

Environment variables (all optional):

| Var | Default | Notes |
|---|---|---|
| `PORT` | `4488` | HTTP port |
| `OPENAI_API_KEY` | — | If set, the server uses this and users don't have to paste their own |
| `PROTO_KIT_MODEL` | `gpt-4o` | Default model. Users can override per-request in Settings |
| `PROTO_KIT_MAX_FRAMES` | `8` | Frames sampled per video. Higher = better fidelity, more tokens |

Run with a server-side key (no per-user paste required):

```bash
OPENAI_API_KEY=sk-... ./go.sh
```

## File layout

```
app-prototyping/
├── server.js               ← Express + OpenAI proxy
├── package.json
├── go.sh                   ← installs deps and starts server
├── index.html              ← the generator UI (describe → render)
├── lib/
│   ├── system-prompt.js    ← the prompt that drives the model's output
│   └── shell.css           ← reference phone-shell CSS (not loaded by default)
└── extract-frames.py       ← helper: video → frames at 1 fps
```

To change how prototypes look or behave, edit `lib/system-prompt.js`. The whole "style" of the tool — fidelity level, dark/light default, multi-screen convention, fonts — lives there.

## Extract frames from a screen recording

When you want the model to match a real app's look, sample frames from a recording and reference them in your prompt:

```bash
pip3 install --user imageio imageio-ffmpeg pillow
python3 extract-frames.py path/to/recording.mp4 --fps 1 --out frames/
```

Outputs `t000.jpg`, `t001.jpg`, … one frame per second.

## Sharing

To let others prototype without standing up their own server:

- **Easiest:** host this repo somewhere small (Fly.io, Render, Railway) with `OPENAI_API_KEY` set, then share the URL. Anyone with the link can prototype using your key. Watch the spend.
- **Safer:** host the same way but **don't** set `OPENAI_API_KEY`. Each visitor pastes their own key — your wallet is safe, theirs isn't shared with you.
- **Hands-off:** anyone can `git clone` + `./go.sh` and run it locally on port 4488.

## License

MIT
