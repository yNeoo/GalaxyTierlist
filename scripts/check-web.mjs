// Verifica que el frontend nuevo cuadra con la API: tabs, secciones y /api/tiers.
import { readFile } from "node:fs/promises";
import { createServer } from "../src/server.js";
import { db, upsertPlayer, logTest } from "../src/db.js";

let fails = 0;
const chk = (ok, msg) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`);
  if (!ok) fails++;
};

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

// --- marca
chk(html.includes("<title>GalaxyTierlist</title>"), "titulo GalaxyTierlist");
const visible = html.replace(/<!--[\s\S]*?-->/g, "");
chk(!/kayjs/i.test(visible), "sin marca visible de KayJs (el credito va en comentario)");
chk(/kayjss/i.test(html), "credito al diseno original conservado en comentario");
chk(!html.includes("localhost:3000"), "sin fetch a localhost (URL relativa)");
chk(html.includes("fetch('/api/tiers')"), "fetch a /api/tiers relativo");

// --- tabs del HTML vs secciones vs JS
const botones = [...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
const secciones = [...html.matchAll(/id="tab-(\w+)"/g)].map((m) => m[1]);
const jsTabs = html.match(/for \(const tab of (\[.*?\])/)?.[1] ?? "[]";
console.log("  botones :", botones.join(", "));
console.log("  secciones:", secciones.join(", "));
console.log("  js      :", jsTabs);
chk(botones.length === secciones.length && botones.every((t) => secciones.includes(t)), "cada boton tiene su seccion");
for (const t of JSON.parse(jsTabs.replace(/'/g, '"'))) {
  chk(secciones.includes(t), `el JS cubre la seccion tab-${t}`);
}

// --- API con datos reales
db.exec("DELETE FROM tests; DELETE FROM players; DELETE FROM queue; DELETE FROM meta;");
upsertPlayer({ name: "Distraccion", discord_id: "d0", region: "NA" });
upsertPlayer({ name: "Selkie", discord_id: "d1", region: "EU" });
logTest({ tester_discord: "d0", tested_name: "Distraccion", gamemode: "sword", tier: "HT1" });
logTest({ tester_discord: "d0", tested_name: "Selkie", gamemode: "sword", tier: "LT3" });
logTest({ tester_discord: "d0", tested_name: "Selkie", gamemode: "nethop", tier: "HT2" });

const app = createServer();
const srv = app.listen(0);
await new Promise((r) => srv.once("listening", r));
const base = `http://127.0.0.1:${srv.address().port}`;

const tiers = await (await fetch(`${base}/api/tiers`)).json();
console.log("  tabs API:", Object.keys(tiers).join(", "));
for (const t of botones.filter((b) => b !== "overall")) {
  chk(Array.isArray(tiers[t]?.tier1), `API trae ${t} con tier1..tier5`);
  chk(Object.keys(tiers[t] ?? {}).join(",") === "tier1,tier2,tier3,tier4,tier5", `${t} tiene tier1-5`);
}
const s1 = tiers.sword.tier1.map((p) => `${p.name}:${p.badges[0]}:${p.points}`).join(", ");
console.log("  sword.tier1:", s1);
chk(s1.includes("Distraccion:ht1:100"), "HT1 con badge ht1 y 100 pts");
const s3 = tiers.sword.tier3.map((p) => `${p.name}:${p.badges[0]}`).join(", ");
chk(s3.includes("Selkie:lt3"), "LT3 cae en tier3 con badge lt3");
chk(tiers.nethop.tier2.some((p) => p.name === "Selkie"), "nethop.tier2 trae a Selkie (HT2)");

// --- pagina y estaticos sirven
for (const p of ["/", "/style.css", "/output.css"]) {
  const r = await fetch(base + p);
  console.log(`  ${r.status}  ${p}  ${(await r.text()).length}b`);
  chk(r.status === 200, `${p} responde 200`);
}
const home = await (await fetch(base + "/")).text();
chk(home.includes("GALAXYTIERLIST"), "la home trae la marca");

srv.close();
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);