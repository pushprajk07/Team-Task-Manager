import fs from "node:fs";
import { randomUUID } from "node:crypto";

import { config } from "./env.js";

function createEmptyStore() {
  return {
    users: [],
    projects: [],
    projectMembers: [],
    tasks: [],
    sessions: [],
  };
}

function normalizeStore(rawStore) {
  const baseStore = createEmptyStore();
  return {
    ...baseStore,
    ...(rawStore && typeof rawStore === "object" ? rawStore : {}),
    users: Array.isArray(rawStore?.users) ? rawStore.users : [],
    projects: Array.isArray(rawStore?.projects) ? rawStore.projects : [],
    projectMembers: Array.isArray(rawStore?.projectMembers)
      ? rawStore.projectMembers
      : [],
    tasks: Array.isArray(rawStore?.tasks) ? rawStore.tasks : [],
    sessions: Array.isArray(rawStore?.sessions) ? rawStore.sessions : [],
  };
}

function readStoreFile() {
  try {
    if (!fs.existsSync(config.databasePath)) {
      return createEmptyStore();
    }

    const rawText = fs.readFileSync(config.databasePath, "utf8").trim();
    return normalizeStore(rawText ? JSON.parse(rawText) : createEmptyStore());
  } catch (error) {
    return createEmptyStore();
  }
}

let store = readStoreFile();
let persistenceEnabled = fs.existsSync(config.databasePath);

function persistStore() {
  try {
    fs.writeFileSync(config.databasePath, JSON.stringify(store, null, 2), "utf8");
    persistenceEnabled = true;
    return true;
  } catch (error) {
    persistenceEnabled = false;
    return false;
  }
}

export function getStore() {
  return store;
}

export function updateStore(mutator) {
  const result = mutator(store);
  persistStore();
  return result;
}

export function replaceStore(nextStore) {
  store = normalizeStore(nextStore);
  persistStore();
}

export function createId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function closeDatabase() {
  return undefined;
}

export function isPersistenceEnabled() {
  return persistenceEnabled;
}
