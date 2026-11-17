import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const out = "D:/station/repos/gyungchung-mcp/public/mcp-guide";
const scenes = JSON.parse(fs.readFileSync("scenes.json", "utf8"));
const LEAD = 0.5, TAIL = 0.9;
let t = 0;
const timeline = scenes.map((scene, index) => {
  const wav = `audio/${String(index).padStart(2, "0")}.wav`;
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString().trim());
  const start = t, speechStart = t + LEAD, end = t + LEAD + duration + TAIL;
  const parts = scene.caption.match(/[^.?!]+[.?!]?/g).map((part) => part.trim()).filter(Boolean);
  const chars = parts.reduce((sum, part) => sum + part.length, 0);
  let cursor = speechStart;
  const cues = parts.map((text, i) => {
    const length = duration * text.length / chars;
    const cue = { start: i === 0 ? start + 0.2 : cursor, end: i === parts.length - 1 ? end - 0.2 : cursor + length, text };
    cursor += length;
    return cue;
  });
  t = end;
  return { id: scene.id, start, speechStart, end, wav, cues };
});
const total = t;
const html = fs.readFileSync("video.html", "utf8")
  .replace("TIMELINE", JSON.stringify(timeline))
  .replace("LOGO", pathToFileURL(path.join(out, "logo-dark.svg")).href)
  .replace("SHOT", pathToFileURL(path.join(out, "login-screen.png")).href);
fs.writeFileSync("video.built.html", html);

fs.rmSync("rec", { recursive: true, force: true });
const browser = await chromium.launch({ executablePath: "C:/Users/jaywa/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: "rec", size: { width: 1280, height: 720 } } });
const created = Date.now();
const page = await context.newPage();
await page.goto(pathToFileURL(path.resolve("video.built.html")).href);
await page.waitForFunction(() => window.__done === true, null, { timeout: (total + 60) * 1000 });
const startEpoch = await page.evaluate(() => window.__startEpoch);
await page.screenshot({ path: "last.png" });
await context.close();
await browser.close();
const offset = (startEpoch - created) / 1000;
const webm = path.join("rec", fs.readdirSync("rec").find((name) => name.endsWith(".webm")));
console.log({ total, offset, webm });

const inputs = [], filters = [];
timeline.forEach((scene, index) => {
  inputs.push("-i", scene.wav);
  filters.push(`[${index + 1}:a]adelay=${Math.round(scene.speechStart * 1000)}:all=1[a${index}]`);
});
const mix = timeline.map((_, index) => `[a${index}]`).join("") + `amix=inputs=${timeline.length}:normalize=0,apad[aout]`;
execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", offset.toFixed(3), "-i", webm, ...inputs,
  "-filter_complex", [...filters, mix].join(";"), "-map", "0:v", "-map", "[aout]", "-t", total.toFixed(3),
  "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "96k", "-ar", "44100", path.join(out, "guide.mp4")], { stdio: "inherit" });
execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "3", "-i", path.join(out, "guide.mp4"), "-frames:v", "1", "-q:v", "3", path.join(out, "poster.jpg")]);
fs.writeFileSync("timeline.json", JSON.stringify(timeline, null, 1));
console.log(fs.statSync(path.join(out, "guide.mp4")).size);
