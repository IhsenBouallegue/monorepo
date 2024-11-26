import express from "express";
import compression from "compression";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --------------- SETUP -----------------

const app = express();
// compress responses with gzip
app.use(compression());

// ----------------- ROUTES ----------------------

app.use(
  "/fm",
  createProxyMiddleware({
    target: "http://localhost:3007", // lix-file-manager
    changeOrigin: true,
    headers: {
      Connection: "keep-alive",
    },
    onError(err, req, res) {
      console.error("WebSocket error:", err);
      res.writeHead(500, {
        "Content-Type": "text/plain",
      });
      res.end(
        "Something went wrong. And we are reporting a custom error message."
      );
    },
  })
);

app.use(
  "/app/csv",
  createProxyMiddleware({
    target: "http://localhost:3008", // csv-app
    changeOrigin: true,
    headers: {
      Connection: "keep-alive",
    },
    ws: true,
  })
);

app.use(
  "*",
  createProxyMiddleware({
    target: "http://localhost:3006", // lix-website
    changeOrigin: true,
    headers: {
      Connection: "keep-alive",
    },
    ws: true,
  })
);

// ! website comes last in the routes because it uses the wildcard `*` to catch all routes

// ----------------- START SERVER -----------------

const port = 3000;
app.listen(port);
console.info(`Server running at http://localhost:${port}/`);
