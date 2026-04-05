import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import next from "next";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..");

config({
  path: join(repoRoot, ".env")
});

function getArg(flagName, fallback) {
  const index = process.argv.indexOf(flagName);

  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return fallback;
}

const appDir = resolve(process.cwd(), getArg("--dir", "."));
const port = Number(getArg("--port", process.env.PORT ?? "3000"));
const devHost = process.env.DEV_HOST ?? "jinmarket.test";
const hostname = "0.0.0.0";
const pfxPath = process.env.DEV_HTTPS_PFX_PATH
  ? resolve(repoRoot, process.env.DEV_HTTPS_PFX_PATH)
  : join(repoRoot, "certificates", "localhost-dev.pfx");
const passphrase = process.env.DEV_HTTPS_PFX_PASSPHRASE ?? "jinmarket-local";

function ensureHealthyNextCache() {
  const nextDir = join(appDir, ".next");
  const staticChunksDir = join(nextDir, "static", "chunks");
  const buildManifestPath = join(nextDir, "build-manifest.json");
  const requiredChunks = [
    join(staticChunksDir, "main-app.js"),
    join(staticChunksDir, "app-pages-internals.js")
  ];

  if (!existsSync(nextDir) || !existsSync(buildManifestPath)) {
    return;
  }

  const hasMissingRuntimeChunk = requiredChunks.some((chunkPath) => !existsSync(chunkPath));
  if (!hasMissingRuntimeChunk) {
    return;
  }

  const resolvedNextDir = resolve(nextDir);
  const resolvedAppDir = resolve(appDir);
  if (!resolvedNextDir.startsWith(resolvedAppDir)) {
    throw new Error(`Refusing to remove unexpected Next cache directory: ${resolvedNextDir}`);
  }

  console.warn(`[next-dev-https] Detected stale Next cache at ${resolvedNextDir}. Rebuilding .next from scratch.`);
  rmSync(resolvedNextDir, { recursive: true, force: true });
}

if (!existsSync(pfxPath)) {
  console.error(`HTTPS certificate not found at ${pfxPath}`);
  console.error('Run "npm run dev:cert" once before starting the Next.js dev servers.');
  process.exit(1);
}

ensureHealthyNextCache();

const app = next({
  dev: true,
  dir: appDir,
  hostname: devHost,
  port
});

const requestHandler = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createHttpsServer(
      {
        pfx: readFileSync(pfxPath),
        passphrase
      },
      (request, response) => {
        void requestHandler(request, response);
      }
    );

    server.listen(port, hostname, () => {
      console.log(`Next dev server listening on https://${devHost}:${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
