import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { GAMEMODES } from "./config.js";

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

export function upsertPlayer({ uuid, name, discord_id, region }) {
  const row = db.prepare("SELECT * FROM players WHERE name = ?").get(name);
  if (row) {
    db.prepare("UPDATE players SET uuid=?, discord_id=COALESCE(?,discord_id), region=COALESCE(?,region) WHERE name=?")
      .run(uuid ?? row.uuid, discord_id ?? null, region ?? null, name);
    return db.prepare("SELECT * FROM players WHERE name = ?").get(name);
  }
  db.prepare("INSERT INTO players (uuid, name, discord_id, region) VALUES (?,?,?,?)")
    .run(uuid ?? null, name, discord_id ?? null, region ?? "NA");
  return db.prepare("SELECT * FROM players WHERE name = ?").get(name);
}

export function logTest({ tester_discord, tested_name, gamemode, tier, notes = "" }) {
  upsertPlayer({ name: tested_name });
  db.prepare("INSERT INTO tests (tester_discord, tested_name, gamemode, tier, timestamp, notes) VALUES (?,?,?,?,?,?)")
    .run(tester_discord, tested_name, gamemode, tier, Date.now(), notes);
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
  for (const k of Object.keys(byTier)) byTier[k].sort((a,b)=>a.name.localeCompare(b.name));
  return byTier;
}

export function getOverall() {
  const { TIER_POINTS } = { TIER_POINTS: { HT1:100,LT1:80,HT2:60,LT2:50,HT3:40,LT3:30,HT4:20,LT4:15,HT5:10,LT5:5 } };
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
    .sort((a,b)=>b.points-a.points);
}

export function getProfile(name) {
  const player = db.prepare("SELECT * FROM players WHERE name = ?").get(name);
  if (!player) return null;
  const tests = db.prepare("SELECT * FROM tests WHERE tested_name = ? ORDER BY timestamp DESC LIMIT 50").all(name);
  // tier actual por modo = ultimo test
  const current = {};
  for (const g of GAMEMODES) {
    const t = db.prepare("SELECT tier FROM tests WHERE tested_name=? AND gamemode=? ORDER BY timestamp DESC LIMIT 1").get(name, g.key);
    if (t) current[g.key] = t.tier;
  }
  return { player, current, history: tests };
}
