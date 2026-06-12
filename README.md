# Proto-Kit

A self-contained kit for building 1:1 fidelity mobile-app feature prototypes in plain HTML — phone shell, bottom sheet, list state, all themable for any product via CSS variables and one config object.

Built around the **tap → pick from a list → confirm** pattern (Add to list, Save to collection, Pin to board, Add to cart, Save to trip, etc.).

## Quick start

```bash
git clone https://github.com/abhishek17r/proto-kit.git
cd proto-kit
./go.sh                    # serves on http://localhost:4488
```

Open `http://localhost:4488/apps/starter.html` and tap **+ Add to list**.

No npm. No build step. Just a folder of files and Python's built-in HTTP server.

## Make a new prototype

```bash
cp apps/starter.html apps/spotify.html
```

Then edit `apps/spotify.html`:

1. **Replace the title-page markup** (everything inside `.screen` *above* the action row) with your product's UI — hero image, title, metadata, content. Keep `<button id="addToListBtn">…</button>`.
2. **Update the `ProtoKit.init({...})` call** at the bottom:

```js
ProtoKit.init({
  brand:       { name: "Spotify", color: "#1DB954" },
  item:        { id: "song-bohemian-rhapsody", title: "Bohemian Rhapsody" },
  sheetTitle:  "Add to playlist",
  actionLabel: "Add to playlist",
  unit:        "songs",
  defaultList: { id: "liked",   name: "Liked Songs", color: "#1DB954" },
  customLists: [
    { id: "workout",     name: "Workout",      color: "#f59e0b" },
    { id: "chill-vibes", name: "Chill Vibes",  color: "#0ea5e9" }
  ]
});
```

The lib handles the rest: injects the bottom sheet, themes everything via `--brand`, persists per-app state to `localStorage` under `protokit:<brand>:*`, and wires `#addToListBtn` automatically.

## Extract frames from a screen recording

When you want to match a real app's fidelity, sample frames from a recording first:

```bash
pip3 install --user imageio imageio-ffmpeg pillow
python3 extract-frames.py path/to/recording.mp4 --fps 1 --out frames/
```

Outputs `t000.jpg`, `t001.jpg`, … one frame per second by default. Use `--fps 2` for denser sampling around screen transitions.

## File layout

```
proto-kit/
├── index.html            ← landing page (auto-served at /)
├── go.sh                 ← start local server on :4488
├── extract-frames.py     ← video → frames at N fps
├── lib/
│   ├── shell.css         ← phone frame, status bar, bottom nav, action row
│   ├── sheet.css         ← bottom sheet, list rows, create form, toast
│   ├── state.js          ← list state + localStorage persistence
│   └── sheet.js          ← open / render / toggle / create
└── apps/
    └── starter.html      ← blank shell — copy to start a new prototype
```

## What it's good for

Works out of the box for any feature where a user assigns an item to one or more named buckets:

- Add to list / playlist / collection / board / folder
- Save to trip / wishlist / cart
- Tag with project / label / category
- Move to / share with

For patterns that don't fit (forms, maps, chat, multi-step flows), the phone shell and theming primitives in `lib/shell.css` are still useful — write your own custom screens against them and skip `sheet.js`.

## Config reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `brand.name` | string | ✓ | Used as the localStorage namespace. |
| `brand.color` | css color | ✓ | Sets `--brand` for checks, pills, toast accent. |
| `item.id` | string | ✓ | Unique id of the thing being saved. Membership keyed by this. |
| `item.title` | string | ✓ | Shown as the sheet subtitle. |
| `defaultList` | `{id, name, color}` | ✓ | Pinned at top with a DEFAULT pill. |
| `customLists` | array | — | Seeded user lists. Color is the swatch. |
| `unit` | string | — | "items", "songs", "places"… Used in row counts. |
| `sheetTitle` | string | — | Sheet header. Defaults to "Add to list". |
| `actionLabel` | string | — | Initial label on `#addToListBtn`. |
| `swatches` | string[] | — | Colors offered in the Create-list color picker. |

## License

MIT
