import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const buildPlans = {
  all: [
    "@jinmarket/shared",
    "@jinmarket/db",
    "@jinmarket/server",
    "@jinmarket/api",
    "@jinmarket/shop-web",
    "@jinmarket/admin-web",
  ],
  shared: ["@jinmarket/shared"],
  db: ["@jinmarket/db"],
  server: ["@jinmarket/shared", "@jinmarket/db", "@jinmarket/server"],
  api: ["@jinmarket/shared", "@jinmarket/db", "@jinmarket/server", "@jinmarket/api"],
  shop: ["@jinmarket/shared", "@jinmarket/shop-web"],
  "shop-web": ["@jinmarket/shared", "@jinmarket/shop-web"],
  admin: ["@jinmarket/shared", "@jinmarket/admin-web"],
  "admin-web": ["@jinmarket/shared", "@jinmarket/admin-web"],
};

const aliases = {
  "@jinmarket/shared": "shared",
  "@jinmarket/db": "db",
  "@jinmarket/server": "server",
  "@jinmarket/api": "api",
  "@jinmarket/shop-web": "shop-web",
  "@jinmarket/admin-web": "admin-web",
};

function normalizeTarget(rawTarget) {
  if (!rawTarget) {
    return "all";
  }

  return aliases[rawTarget] ?? rawTarget.trim().toLowerCase();
}

function runBuild(workspace) {
  return new Promise((resolveBuild, rejectBuild) => {
    const command = `npm run build --workspace ${workspace}`;
    const child = spawn(command, {
      cwd: repoRoot,
      env: process.env,
      shell: true,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolveBuild();
        return;
      }

      rejectBuild(new Error(`Build failed for ${workspace} with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", rejectBuild);
  });
}

const rawTarget = process.argv[2] ?? process.env.JINMARKET_BUILD_TARGET ?? "all";
const target = normalizeTarget(rawTarget);
const plan = buildPlans[target];

if (!plan) {
  const supportedTargets = Object.keys(buildPlans).sort().join(", ");
  console.error(
    `[build] Unknown target "${rawTarget}". Supported targets: ${supportedTargets}`,
  );
  process.exit(1);
}

console.log(`[build] target=${target}`);

for (const workspace of plan) {
  console.log(`[build] workspace=${workspace}`);
  await runBuild(workspace);
}
