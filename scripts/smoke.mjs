// Smoke test: levanta el server, siembra datos y pega a la API.
import { createServer } from "../src/server.js";
import {
  db, upsertPlayer, logTest, addToQueue, getQueue, queueCount,
  setActiveMode, setQueueOpen, popQueue, getOpenStates, getMeta, setMeta
} from "../src/db.js";

// --- reset determinista ---
db.exec(`DELETE FROM tests; DELETE FROM players; DELETE FROM queue; DELETE FROM meta;`);

const app = createServer();
const srv = app.listen(0);
await new Promise((r) => srv.once("listening", r));
const base = `http://127.0.0.1:${srv.address().port}`;

const get = async (p) => {
  const r = await fetch(base + p);
  return { status: r.status, body: await r.json() };
};

// --- semilla ---
const people = [
  ["Distraccion", "NA"], ["xX_Selkie", "EU"], ["Zenith", "AS"],
  ["gays", "NA"], ["Squids", "EU"], ["Betatest", "NA"], ["Cobblemon", "AS"],
];
people.forEach(([n, reg], i) => upsertPlayer({ name: n, discord_id: `d${i}`, region: reg }));

logTest({ tester_discord: "d0", tested_name: "Distraccion", gamemode: "sword", tier: "HT1" });
logTest({ tester_discord: "d0", tested_name: "Selkie", gamemode: "sword", tier: "LT2" });
logTest({ tester_discord: "d0", tested_name: "Zenith", gamemode: "sword", tier: "HT3" });
logTest({ tester_discord: "d0", tested_name: "Zenith", gamemode: "nethop", tier: "HT2" });
logTest({ tester_discord: "d0", tested_name: "Squids", gamemode: "axe", tier: "LT5" });

setActiveMode("sword");
setQueueOpen("sword", true);

// 7 entran -> solo deben verse 5
people.forEach(([n, reg], i) => {
  const p = db.prepare("SELECT * FROM players WHERE name=?").get(n);
  addToQueue({ discord_id: p.discord_id, ign: n, tag: `user${i}`, gamemode: "sword", region: reg });
});

console.log("== EN COLA (sword) ==");
console.log(queueCount("sword"), "en cola; primeros 5:");
getQueue("sword", 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.ign} (${r.region}) tag=${r.tag}`));

console.log("\n== API ==");
console.log("mode/list  ->", (await get("/api/mode/list")).body.map((m) => m.key).join(", "));
console.log("tiers      ->", (await get("/api/tiers")).body.join(" "));
const sword = await get("/api/mode/sword");
console.log("mode/sword ->", Object.entries(sword.body).map(([t, a]) => `${t}:${a.length}`).join(" "));
console.log("overall    ->", (await get("/api/mode/overall")).body.map((p) => `${p.name}(${p.points})`).join(", "));
console.log("bad mode   ->", (await get("/api/mode/nope")).status);
const q = await get("/api/queue?mode=sword");
console.log("queue      ->", `open=${q.body.open} count=${q.body.count} shown=${q.body.players.length}`);
console.log("queue(nope)->", (await get("/api/queue?mode=nope")).status);
const prof = await get("/api/profile/Zenith");
console.log("profile    ->", JSON.stringify(prof.body.current));

console.log("\n== pop (simula boton Ticket) ==");
console.log("pop #1 ->", popQueue("sword").ign, "| ahora en cola:", queueCount("sword"));
console.log("posicion de Squids ->", (() => {
  const r = db.prepare("SELECT id FROM queue WHERE ign='Squids'").get();
  return r ? db.prepare(`SELECT COUNT(*) c FROM queue q WHERE q.gamemode='sword' AND (q.created < (SELECT created FROM queue WHERE id=?) OR (q.created=(SELECT created FROM queue WHERE id=?) AND q.id<=?))`).get(r.id, r.id, r.id).c : null;
})());

console.log("\n== open/close por modalidad ==");
setQueueOpen("axe", false);
const st = getOpenStates();
console.log("sword open?", st.sword, "| axe open?", st.axe);

console.log("\n== meta persistido ==");
setMeta("prueba", { hola: "mundo" });
console.log("meta prueba ->", JSON.stringify(getMeta("prueba")));

srv.close();
console.log("\nOK - smoke test completo.");