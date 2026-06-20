import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const devHost = process.env.DEV_HOST ?? "jinmarket.test";
const pfxPath = process.env.DEV_HTTPS_PFX_PATH
  ? resolve(repoRoot, process.env.DEV_HTTPS_PFX_PATH)
  : join(repoRoot, "certificates", "localhost-dev.pfx");
const passphrase = process.env.DEV_HTTPS_PFX_PASSPHRASE ?? "jinmarket-local";
const port = Number(process.env.API_PORT ?? 4000);

async function loadCreateApp() {
  // In local dev, import the package source so new routes are available without rebuilding dist first.
  if (process.env.NODE_ENV !== "production") {
    return import("../../../packages/server/src/index.js");
  }

  return import("@jinmarket/server");
}

if (!existsSync(pfxPath)) {
  throw new Error(`HTTPS certificate not found at ${pfxPath}. Run "npm run dev:cert" first.`);
}

const { createApp } = await loadCreateApp();
const app = createApp();
const server = createHttpsServer(
  {
    pfx: readFileSync(pfxPath),
    passphrase
  },
  app
);

server.listen(port, "0.0.0.0", () => {
  console.log(`Jinmarket API listening on https://${devHost}:${port}`);
});
