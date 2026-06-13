// Proto-kit server: static files + Anthropic proxy + video → frame extraction.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const express = require("express");
const multer = require("multer");
const ffmpegPath = require("ffmpeg-static");
const Anthropic = require("@anthropic-ai/sdk");
const SYSTEM_PROMPT = require("./lib/system-prompt");

const app = express();
const PORT = process.env.PORT || 4488;
const SERVER_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEFAULT_MODEL = process.env.PROTO_KIT_MODEL || "claude-sonnet-4-6";
const MAX_FRAMES = parseInt(process.env.PROTO_KIT_MAX_FRAMES || "8", 10);

// In-memory cache of extracted frames per session so refines can re-use them.
const SESSIONS = new Map(); // id -> { frames: [base64...], createdAt }
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of SESSIONS) if (s.createdAt < cutoff) SESSIONS.delete(id);
}, 5 * 60 * 1000).unref();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024 } // 120 MB
});

app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname), { extensions: ["html"] }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: DEFAULT_MODEL, serverKey: !!SERVER_KEY });
});

app.post("/api/generate", upload.single("video"), async (req, res) => {
  const prompt = (req.body.prompt || "").trim();
  const previousHtml = req.body.previousHtml || "";
  const apiKey = req.body.apiKey || "";
  const model = req.body.model || DEFAULT_MODEL;
  const sessionId = req.body.sessionId || "";

  if (!prompt) return res.status(400).json({ error: "Missing 'prompt' string." });

  const key = (apiKey && apiKey.trim()) || SERVER_KEY;
  if (!key) {
    return res.status(401).json({
      error:
        "No API key. Paste your Anthropic key in Settings, or run the server with ANTHROPIC_API_KEY."
    });
  }

  // Resolve frames: either uploaded video (new session) or cached (refinement).
  let frames = [];
  let newSessionId = sessionId;
  try {
    if (req.file) {
      frames = await extractFrames(req.file.buffer, MAX_FRAMES);
      newSessionId = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      SESSIONS.set(newSessionId, { frames, createdAt: Date.now() });
    } else if (sessionId && SESSIONS.has(sessionId)) {
      frames = SESSIONS.get(sessionId).frames;
    }
  } catch (err) {
    return res.status(400).json({ error: "Frame extraction failed: " + err.message });
  }

  try {
    const client = new Anthropic({ apiKey: key });

    const userContent = [];
    for (const b64 of frames) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: b64 }
      });
    }

    let textPart = "";
    if (frames.length) {
      textPart += `Above are ${frames.length} screenshots sampled from a screen recording of the source app. They define the visual language (colors, fonts, spacing, iconography, navigation) of the prototype you will produce. Match this look as closely as possible.\n\n`;
    }
    if (previousHtml) {
      textPart += `Previous prototype (refine this — keep what works, change only what's asked):\n\n${previousHtml}\n\nUser refinement:\n${prompt}`;
    } else {
      textPart += `Feature to prototype:\n${prompt}\n\nProduce a single self-contained HTML file that visually mimics the source app and has this new feature wired in (clickable, with realistic state transitions).`;
    }
    userContent.push({ type: "text", text: textPart });

    const msg = await client.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }]
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const html = extractHtml(text);
    if (!html) {
      return res.status(502).json({
        error: "Model didn't return HTML. Try a more specific prompt.",
        raw: text.slice(0, 1200)
      });
    }
    res.json({
      html,
      usage: msg.usage,
      model: msg.model,
      sessionId: newSessionId || null,
      frameCount: frames.length
    });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ error: err?.message || String(err) });
  }
});

// ---------- Helpers ----------

async function extractFrames(videoBuffer, maxFrames) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pk-"));
  const inputPath = path.join(tmpDir, "in.mp4");
  await fs.promises.writeFile(inputPath, videoBuffer);

  try {
    // Probe duration with ffmpeg itself (no ffprobe).
    const duration = await probeDuration(inputPath);
    // Sample interval to land near maxFrames evenly spaced.
    const fps = duration > 0 ? Math.max(0.2, Math.min(2, maxFrames / duration)) : 1;

    const outPattern = path.join(tmpDir, "t%03d.jpg");
    await runFFmpeg([
      "-i", inputPath,
      "-vf", `fps=${fps.toFixed(3)},scale=384:-1`,
      "-q:v", "5",
      "-y", outPattern
    ]);

    const files = (await fs.promises.readdir(tmpDir))
      .filter((f) => f.startsWith("t") && f.endsWith(".jpg"))
      .sort();
    if (files.length === 0) throw new Error("no frames produced");

    // Even sampling if we got more than maxFrames.
    const picked = [];
    const N = Math.min(maxFrames, files.length);
    for (let i = 0; i < N; i++) {
      picked.push(files[Math.floor((i + 0.5) * files.length / N)]);
    }
    const seen = new Set();
    const unique = picked.filter((f) => (seen.has(f) ? false : seen.add(f)));

    const b64s = [];
    for (const f of unique) {
      const buf = await fs.promises.readFile(path.join(tmpDir, f));
      b64s.push(buf.toString("base64"));
    }
    return b64s;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function probeDuration(inputPath) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ["-i", inputPath]);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (!m) return resolve(0);
      resolve(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
    });
    p.on("error", () => resolve(0));
  });
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("ffmpeg: " + stderr.slice(-300)))
    );
    p.on("error", reject);
  });
}

function extractHtml(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const m = body.match(/<!doctype[\s\S]*<\/html>/i);
  if (m) return m[0];
  if (/<html[\s\S]*<\/html>/i.test(body)) {
    return "<!doctype html>\n" + body.match(/<html[\s\S]*<\/html>/i)[0];
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`proto-kit on http://localhost:${PORT}`);
  console.log(
    SERVER_KEY ? "  api key: server-side (env)" : "  api key: client-side (paste in Settings)"
  );
  console.log(`  model:   ${DEFAULT_MODEL}`);
  console.log(`  frames:  up to ${MAX_FRAMES} per video`);
});
