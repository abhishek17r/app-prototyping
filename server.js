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
const ANALYSE_PROMPT = require("./lib/analyse-prompt");

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

// Step 1: extract frames, identify app + features + journeys.
app.post("/api/analyse", upload.single("video"), async (req, res) => {
  const apiKey = req.body.apiKey || "";
  const model = req.body.model || DEFAULT_MODEL;

  if (!req.file) return res.status(400).json({ error: "Missing 'video' file." });
  const key = (apiKey && apiKey.trim()) || SERVER_KEY;
  if (!key) {
    return res.status(401).json({
      error:
        "No API key. Paste your Anthropic key in Settings, or run the server with ANTHROPIC_API_KEY."
    });
  }

  let frames;
  try {
    frames = await extractFrames(req.file.buffer, MAX_FRAMES);
  } catch (err) {
    return res.status(400).json({ error: "Frame extraction failed: " + err.message });
  }

  const sessionId = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  SESSIONS.set(sessionId, { frames, createdAt: Date.now() });

  try {
    const client = new Anthropic({ apiKey: key });
    const content = [
      ...frames.map((b64) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: b64 }
      })),
      { type: "text", text: `Above are ${frames.length} screenshots from a screen recording. Analyse the source app and return the JSON described in the system prompt.` }
    ];

    const msg = await client.messages.create({
      model,
      max_tokens: 2000,
      system: ANALYSE_PROMPT,
      messages: [{ role: "user", content }]
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const analysis = extractJSON(text);
    if (!analysis) {
      return res.status(502).json({
        error: "Couldn't parse analysis JSON from model.",
        raw: text.slice(0, 1200)
      });
    }
    res.json({
      sessionId,
      frameCount: frames.length,
      analysis,
      usage: msg.usage,
      model: msg.model
    });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ error: err?.message || String(err) });
  }
});

// Step 2: generate the prototype HTML from the analysed session + a feature prompt.
app.post("/api/generate", async (req, res) => {
  const prompt = (req.body.prompt || "").trim();
  const previousHtml = req.body.previousHtml || "";
  const apiKey = req.body.apiKey || "";
  const model = req.body.model || DEFAULT_MODEL;
  const sessionId = req.body.sessionId || "";
  const analysis = req.body.analysis || null;

  if (!prompt) return res.status(400).json({ error: "Missing 'prompt' string." });
  if (!sessionId || !SESSIONS.has(sessionId)) {
    return res.status(400).json({
      error: "No active session. Upload a video and run Analyse first."
    });
  }

  const key = (apiKey && apiKey.trim()) || SERVER_KEY;
  if (!key) {
    return res.status(401).json({
      error:
        "No API key. Paste your Anthropic key in Settings, or run the server with ANTHROPIC_API_KEY."
    });
  }

  const frames = SESSIONS.get(sessionId).frames;

  try {
    const client = new Anthropic({ apiKey: key });

    const userContent = frames.map((b64) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 }
    }));

    let textPart = `Above are ${frames.length} screenshots from the source app. They define the visual language (brand color, typography, layout, iconography, navigation) of the prototype you will produce. Match this look as closely as possible.\n\n`;
    if (analysis) {
      textPart += "Context (user-confirmed analysis of the source app):\n";
      textPart += `- App: ${analysis.appName || "(unknown)"}\n`;
      if (analysis.summary) textPart += `- What it does: ${analysis.summary}\n`;
      if (Array.isArray(analysis.features) && analysis.features.length) {
        textPart += `- Existing features: ${analysis.features.join(", ")}\n`;
      }
      if (Array.isArray(analysis.journeys) && analysis.journeys.length) {
        textPart += "- User journeys shown:\n";
        for (const j of analysis.journeys) {
          textPart += `  • ${j.title}: ${(j.steps || []).join(" → ")}\n`;
        }
      }
      textPart += "\n";
    }
    if (previousHtml) {
      textPart += `Previous prototype (refine this — keep what works, change only what's asked):\n\n${previousHtml}\n\nUser refinement:\n${prompt}`;
    } else {
      textPart += `Feature to prototype (wire it into the existing app, don't build a standalone screen):\n${prompt}\n\nProduce a single self-contained HTML file that visually mimics the source app and has this new feature wired in (clickable, with realistic state transitions).`;
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
      sessionId,
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

function extractJSON(text) {
  if (!text) return null;
  // Strip markdown fences if any.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  // Find first { ... } block at top level.
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(body.slice(first, last + 1));
  } catch (_) {
    return null;
  }
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
