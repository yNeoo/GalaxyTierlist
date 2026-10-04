import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { GAMEMODES, TIER_POINTS } from "./config.js";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "database.sqlite"));

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT,
  name TEXT UNIQUE,
  discord_id TEXT,
  region TEXT DEFAULT 'NA'
);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tester_discord TEXT,
  tested_name TEXT,
  gamemode TEXT,
  tier TEXT,
  timestamp INTEGER,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT,
  ign TEXT,
  gamemode TEXT,
  region TEXT,
  created INTEGER
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// --- migraciones ligeras (columnas anadidas despues del primer deploy) ---
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("queue", "tag", "tag TEXT");
ensureColumn("queue", "ticket", "ticket TEXT");

db.exec(`CREATE INDEX IF NOT EXISTS idx_queue_mode ON queue(gamemode, created);
CREATE INDEX IF NOT EXISTS idx_tests_name ON tests(tested_name, gamemode, timestamp);`);

// ------------------------------------------------------------------ players
export function upsertPlayer({ uuid, name, discord_id, region }) {
  const row = db.prepare("SELECT * FROM players WHERE name = ?").get(name);
  if (row) {
    db.prepare(
      "UPDATE players SET uuid=?, discord_id=COALESCE(?,discord_id), region=COALESCE(?,region) WHERE name=?"
    ).run(uuid ?? row.uuid, discord_id ?? null, region ?? null, name);
    return db.prepare("SELECT * FROM players WHERE name = ?").get(name);
  }
  db.prepare("INSERT INTO players (uuid, name, discord_id, region) VALUES (?,?,?,?)")
    .run(uuid ?? null, name, discord_id ?? null, region ?? "NA");
  return db.prepare("SELECT * FROM players WHERE name = ?").get(name);
}

export function getPlayerByDiscord(discordId) {
  return db.prepare("SELECT * FROM players WHERE discord_id = ?").get(discordId) ?? null;
}

export function isVerified(discordId) {
  return getPlayerByDiscord(discordId) !== null;
}

// -------------------------------------------------------------------- tests
export function logTest({ tester_discord, tested_name, gamemode, tier, notes = "" }) {
  upsertPlayer({ name: tested_name });
  db.prepare(
    "INSERT INTO tests (tester_discord, tested_name, gamemode, tier, timestamp, notes) VALUES (?,?,?,?,?,?)"
  ).run(tester_discord, tested_name, gamemode, tier, Date.now(), notes);
}

export function getCurrentTier(name, gamemode) {
  return db.prepare(
    "SELECT tier FROM tests WHERE tested_name=? AND gamemode=? ORDER BY timestamp DESC LIMIT 1"
  ).get(name, gamemode)?.tier ?? null;
}

export function getRankings(gamemode) {
  // Ultimo tier por jugador en ese modo (como MCTiers)
  const rows = db.prepare(`
    SELECT tested_name as name, tier, MAX(timestamp) as ts FROM tests
    WHERE gamemode = ? GROUP BY tested_name
  `).all(gamemode);
  const byTier = {};
  for (const r of rows) {
    const p = db.prepare("SELECT region FROM players WHERE name = ?").get(r.name);
    if (!byTier[r.tier]) byTier[r.tier] = [];
    byTier[r.tier].push({ name: r.name, region: p?.region ?? "NA", tier: r.tier });
  }
  for (const k of Object.keys(byTier)) byTier[k].sort((a, b) => a.name.localeCompare(b.name));
  return byTier;
}

export function getOverall() {
  const rows = db.prepare("SELECT tested_name, gamemode, tier, timestamp FROM tests").all();
  const latest = new Map(); // name|mode -> row
  for (const r of rows) {
    const k = r.tested_name + "|" + r.gamemode;
    if (!latest.has(k) || latest.get(k).timestamp < r.timestamp) latest.set(k, r);
  }
  const pts = new Map();
  for (const r of latest.values()) {
    pts.set(r.tested_name, (pts.get(r.tested_name) ?? 0) + (TIER_POINTS[r.tier] ?? 0));
  }
  return [...pts.entries()]
    .map(([name, points]) => {
      const p = db.prepare("SELECT region FROM players WHERE name = ?").get(name);
      return { name, points, region: p?.region ?? "NA" };
    })
    .sort((a, b) => b.points - a.points);
}

export function getProfile(name) {
  const player = db.prepare("SELECT * FROM players WHERE name = ?").get(name);
  if (!player) return null;
  const tests = db.prepare(
    "SELECT * FROM tests WHERE tested_name = ? ORDER BY timestamp DESC LIMIT 50"
  ).all(name);
  const current = {};
  for (const g of GAMEMODES) {
    const t = getCurrentTier(name, g.key);
    if (t) current[g.key] = t;
  }
  return { player, current, history: tests };
}

// -------------------------------------------------------------------- queue
export function getQueue(gamemode, limit = Infinity) {
  const sql = `SELECT * FROM queue WHERE gamemode = ? ORDER BY created ASC, id ASC
               ${Number.isFinite(limit) ? "LIMIT ?" : ""}`;
  return db.prepare(sql).all(...(Number.isFinite(limit) ? [gamemode, limit] : [gamemode]));
}

export function queueCount(gamemode) {
  return db.prepare("SELECT COUNT(*) as c FROM queue WHERE gamemode = ?").get(gamemode).c;
}

export function inQueue(discordId, gamemode) {
  return db.prepare("SELECT * FROM queue WHERE discord_id=? AND gamemode=?").get(discordId, gamemode) ?? null;
}

/** Inserta en la whitelist. Devuelve { ok, position, already } */
export function addToQueue({ discord_id, ign, tag, gamemode, region }) {
  const existing = inQueue(discord_id, gamemode);
  if (existing) return { ok: false, already: true, position: queuePosition(existing.id) };
  db.prepare(
    "INSERT INTO queue (discord_id, ign, tag, gamemode, region, created) VALUES (?,?,?,?,?,?)"
  ).run(discord_id, ign, tag ?? null, gamemode, region ?? "NA", Date.now());
  return { ok: true, already: false, position: queueCount(gamemode) };
}

export function removeFromQueue(discordId, gamemode) {
  const r = db.prepare(
    gamemode ? "DELETE FROM queue WHERE discord_id=? AND gamemode=?" : "DELETE FROM queue WHERE discord_id=?"
  ).run(...(gamemode ? [discordId, gamemode] : [discordId]));
  return r.changes;
}

/** Posicion 1-based de una fila dentro de su propia cola. */
export function queuePosition(rowId) {
  const row = db.prepare("SELECT created FROM queue WHERE id = ?").get(rowId);
  if (!row) return null;
  const ahead = db.prepare(`
    SELECT COUNT(*) as c FROM queue q
    WHERE q.gamemode = (SELECT gamemode FROM queue WHERE id = ?)
      AND ( q.created < (SELECT created FROM queue WHERE id = ?)
            OR (q.created = (SELECT created FROM queue WHERE id = ?) AND q.id <= ?) )
  `).get(rowId, rowId, rowId, rowId).c;
  return ahead;
}

/** Saca al primero de la cola y lo elimina. Devuelve la fila o null. */
export function popQueue(gamemode) {
  const row = db.prepare(
    "SELECT * FROM queue WHERE gamemode = ? ORDER BY created ASC, id ASC LIMIT 1"
  ).get(gamemode);
  if (!row) return null;
  db.prepare("DELETE FROM queue WHERE id = ?").run(row.id);
  return row;
}

export function clearQueue(gamemode) {
  return db.prepare("DELETE FROM queue WHERE gamemode = ?").run(gamemode).changes;
}

// --------------------------------------------------------------------- meta
export function getMeta(key, fallback = null) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setMeta(key, value) {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, JSON.stringify(value));
}

/** { sword: true, nethop: false, ... } - por defecto todas abiertas. */
export function getOpenStates() {
  const stored = getMeta("queue_open", {}) ?? {};
  const out = {};
  for (const g of GAMEMODES) out[g.key] = stored[g.key] !== false;
  return out;
}

export function setQueueOpen(gamemode, open) {
  const states = getOpenStates();
  states[gamemode] = !!open;
  setMeta("queue_open", states);
  return states[gamemode];
}

export function isQueueOpen(gamemode) {
  return getOpenStates()[gamemode] !== false;
}

export function getActiveMode() {
  const stored = getMeta("active_mode", null);
  return GAMEMODES.some((g) => g.key === stored) ? stored : GAMEMODES[0].key;
}

export function setActiveMode(key) {
  if (!GAMEMODES.some((g) => g.key === key)) return getActiveMode();
  setMeta("active_mode", key);
  return key;
}

/** { channelId, messageId } del panel publicado. */
export function getPanel() {
  return getMeta("panel", null);
}

export function setPanel(channelId, messageId) {
  setMeta("panel", { channelId, messageId });
}

export function clearPanel() {
  setMeta("panel", null);
}