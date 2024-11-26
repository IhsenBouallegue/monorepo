import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const node_modules = join(  __dirname,  "../node_modules");

const app = express();

// forward browser fetch requests to correct subpath
// user is on site /app/fm -> app requests /asset/xyz.js -> /app/fm/asset/xyz.js
// user is on site /app/csv -> app requests /asset/xyz.js -> /app/csv/asset/xyz.js
app.use((req, res, next) => {
  if (req.headers.referer === undefined) {
    return next();
  }
  
  const refererPath = new URL(req.headers.referer).pathname;
  const isAppRoute = refererPath?.startsWith("/app");

  if (!isAppRoute){
    return next()
  }

  const appName = isAppRoute ? refererPath.split("/")[2] : null;

  if (refererPath?.startsWith(`/app/${appName}`) && !req.url.startsWith(`/app/${appName}`)) {
    req.url = `/app/${appName}` + req.url;
  } 
  
  return next();
});

app.use("/app/fm", express.static(`${node_modules}/lix-file-manager/dist`));
app.use("/app/csv", express.static(`${node_modules}/csv-app/dist`));

// Fallback route for undefined routes
app.get("*", (req, res) => {
  res.status(404).send("File not found");
});

const port = 3000;

app.listen(port, () => {
  console.info(`Server running at http://localhost:${port}/`);
});
