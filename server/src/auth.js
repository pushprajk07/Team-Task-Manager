import crypto from "node:crypto";

import { config } from "./env.js";
import { createId, getStore, nowIso, updateStore } from "./db.js";

const SESSION_COOKIE = "ttm_session";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedValue) {
  const [salt, originalHash] = storedValue.split(":");

  if (!salt || !originalHash) {
    return false;
  }

  const comparisonHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const originalBuffer = Buffer.from(originalHash, "hex");
  const comparisonBuffer = Buffer.from(comparisonHash, "hex");

  return (
    originalBuffer.length === comparisonBuffer.length &&
    crypto.timingSafeEqual(originalBuffer, comparisonBuffer)
  );
}

export function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseCookies(cookieHeader = "") {
  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (!name) {
      continue;
    }

    cookies[name] = decodeURIComponent(rest.join("=") || "");
  }

  return cookies;
}

export function setSessionCookie(res, token) {
  const maxAge = config.sessionTtlDays * 24 * 60 * 60;
  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (config.isProduction) {
    cookieParts.push("Secure");
  }

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  updateStore((store) => {
    store.sessions.push({
      id: createId("ses"),
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      createdAt: nowIso(),
    });
  });

  return token;
}

export function destroySessionByToken(token) {
  if (!token) {
    return;
  }

  updateStore((store) => {
    store.sessions = store.sessions.filter(
      (session) => session.tokenHash !== hashToken(token),
    );
  });
}

export function cleanupExpiredSessions() {
  const currentTime = nowIso();
  updateStore((store) => {
    store.sessions = store.sessions.filter(
      (session) => session.expiresAt > currentTime,
    );
  });
}

export function resolveSessionUser(req) {
  cleanupExpiredSessions();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  const store = getStore();
  const session = store.sessions.find(
    (entry) => entry.tokenHash === hashToken(token),
  );

  if (!session) {
    return null;
  }

  if (session.expiresAt <= nowIso()) {
    destroySessionByToken(token);
    return null;
  }

  const user = store.users.find((entry) => entry.id === session.userId);

  if (!user) {
    destroySessionByToken(token);
    return null;
  }

  return {
    token,
    sessionId: session.id,
    user: sanitizeUser(user),
  };
}

export function activeSessionsForUser(userId) {
  return getStore()
    .sessions.filter((session) => session.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
