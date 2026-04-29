import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { config } from "./env.js";
import { handleApiRequest } from "./routes.js";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function serveStaticFile(req, res, pathname) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const targetPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path
    .normalize(targetPath)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");
  let filePath = path.join(config.publicDir, normalizedPath);

  if (!filePath.startsWith(config.publicDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(config.publicDir, "index.html");
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const content = fs.readFileSync(filePath);

  res.writeHead(200, { "Content-Type": contentType });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApiRequest(req, res, url);
    return;
  }

  serveStaticFile(req, res, url.pathname);
});

server.listen(config.port, () => {
  console.log(`Team Task Manager running at http://localhost:${config.port}`);
});
