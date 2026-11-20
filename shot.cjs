// Build tooling: serve the repo and capture meme.html as a 1080x1080 PNG.
// Uses only Node built-ins plus the headless Chromium CDP endpoint.

const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { extname, join, resolve, sep } = require("node:path");

const ROOT = __dirname;
const HOST = "127.0.0.1";
const PORT = 8081;
const DEBUG_PORT = 9222;
const PAGE_URL = `http://${HOST}:${PORT}/meme.html`;
const CHROME = "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell";
const OUTPUT = join(ROOT, "meme.png");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new globalThis.URL(req.url, PAGE_URL).pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  const relative = pathname === "/" ? "meme.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
});

let chrome;
let profileDir;
let ws;

function connect(url) {
  return new Promise((resolveSocket, rejectSocket) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolveSocket(socket), { once: true });
    socket.addEventListener("error", () => rejectSocket(new Error(`could not connect to ${url}`)), { once: true });
  });
}

function makeCdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`));
      else request.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params);
  });

  return {
    send(method, params = {}) {
      return new Promise((resolveCommand, rejectCommand) => {
        const id = ++nextId;
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method) {
      return new Promise((resolveEvent) => {
        const listener = (params) => {
          listeners.set(method, (listeners.get(method) || []).filter((item) => item !== listener));
          resolveEvent(params);
        };
        listeners.set(method, [...(listeners.get(method) || []), listener]);
      });
    },
  };
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Chromium headless shell not found at ${CHROME}`);

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(PORT, HOST, resolveListen);
  });

  profileDir = mkdtempSync(join(tmpdir(), "gta6-meme-shot-"));
  chrome = spawn(CHROME, [
    "--headless",
    "--disable-gpu",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1080,1080",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let chromeError = "";
  chrome.stderr.on("data", (chunk) => { chromeError += chunk.toString(); });

  let targets;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (chrome.exitCode !== null) throw new Error(`Chromium exited early: ${chromeError.trim()}`);
    try {
      const response = await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`);
      targets = await response.json();
      if (targets.some((target) => target.type === "page")) break;
    } catch {
      // DevTools endpoint is still starting.
    }
    await sleep(100);
  }
  const target = targets && targets.find((item) => item.type === "page");
  if (!target) throw new Error("Chromium did not expose a page target");

  ws = await connect(target.webSocketDebuggerUrl);
  const cdp = makeCdpClient(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1080,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: PAGE_URL });
  await loaded;
  await cdp.send("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))",
    awaitPromise: true,
  });

  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(OUTPUT, Buffer.from(shot.data, "base64"));
}

main()
  .catch((error) => {
    process.stderr.write(`shot.cjs: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ws) ws.close();
    if (chrome && chrome.exitCode === null) chrome.kill("SIGTERM");
    await new Promise((resolveClose) => server.close(resolveClose));
    if (profileDir) {
      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });
