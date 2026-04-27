import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolvePath(targetPath) {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.join(rootDir, targetPath);
}

loadEnvFile(envPath);

const dataPath = process.env.DATABASE_PATH || "./data/team-task-manager.json";

export const config = {
  rootDir,
  publicDir: path.join(rootDir, "public"),
  dataDir: path.join(rootDir, "data"),
  databasePath: resolvePath(dataPath),
  env: process.env.NODE_ENV || "development",
  isProduction: (process.env.NODE_ENV || "development") === "production",
  port: Number(process.env.PORT || 3000),
  sessionTtlDays: Math.max(1, Number(process.env.SESSION_TTL_DAYS || 14)),
  adminEmail: process.env.ADMIN_EMAIL || null,
};
