import express from "express";
import cors from "cors";
import path from "node:path";
import { GAMEMODES, TIERS } from "./config.js";
import { getRankings, getOverall, getProfile, db } from "./db.js";

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), "public")));

  // API estilo MCTiers /api/v2/mode/...
  app.get("/api/mode/list", (req, res) => res.json(GAMEMODES));

  app.get("/api/mode/overall", (req, res) => {
    const count = parseInt(req.query.count ?? "0");
    let overall = getOverall();
    if (count > 0) overall = overall.slice(0, count);
    res.json(overall);
  });

  app.get("/api/mode/:gamemode", (req, res) => {
    const { gamemode } = req.params;
    if (!GAMEMODES.find(g => g.key === gamemode)) return res.status(404).json({ error: "unknown gamemode" });
    res.json(getRankings(gamemode));
  });

  app.get("/api/profile/:name", (req, res) => {
    const p = getProfile(req.params.name);
    if (!p) return res.status(404).json({ error: "not found" });
    res.json(p);
  });

  app.get("/api/tests", (req, res) => {
    const rows = db.prepare("SELECT * FROM tests ORDER BY timestamp DESC LIMIT 50").all();
    res.json(rows);
  });

  app.get("/api/tiers", (req, res) => res.json(TIERS));

  return app;
}
