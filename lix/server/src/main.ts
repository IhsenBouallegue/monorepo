import express from "express";
import compression from "compression";
import { createProxyMiddleware } from "http-proxy-middleware";

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
  })
);

// ! website comes last in the routes because it uses the wildcard `*` to catch all routes

// ----------------- START SERVER -----------------

const port = 3000;
app.listen(port);
console.info(`Server running at http://localhost:${port}/`);
