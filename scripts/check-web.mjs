// Verifica la pagina de rankings estilo MCTiers: marca, pestanas,
// buscador, tabla overall, vista por modo, perfil y /api/tiers.
import { readFile } from "node:fs/promises";
import { createServer } from "../src/server.js";
import { db, upsertPlayer, logTest } from "../src/db.js";

let fails = 0;
const chk = (ok, msg) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`);
  if (!ok) fails++;
};

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/style.css", import.meta.url), "utf8");

// --- marca propia + credito como la vez pasada (en comentario) ---
chk(html.includes("<title>GalaxyTierlist - Rankings</title>"), "titulo GalaxyTierlist - Rankings");
chk(html.includes("fonts.cdnfonts.com/css/geist"), "fuente Geist cargada");
chk(html.includes("https://mctiers.com/tier_icons/sword.svg"), "iconos de mctiers enlazados");
chk(html.includes('key: "cpvp", name: "CPVP", icon: "https://mctiers.com/tier_icons/vanilla.svg"'), "cpvp usa el icono vanilla de mctiers");
chk(html.includes('key: "diapot", name: "DiaPot", icon: "https://mctiers.com/tier_icons/pot.svg"'), "diapot usa el icono pot de mctiers");
chk(html.includes("Press+Start+2P"), "fuente pixel para la marca");
chk(html.includes("<kbd>/</kbd>"), "atajo / en el buscador");
chk(css.includes("font-family: Geist"), "Geist como fuente principal");
chk(css.includes("linear-gradient(180deg, #f3e8ff"), "marca con degradado galaxia");
chk(css.includes(".tabs a.active::after"), "indicador en la pestana activa");
chk(/\(async function init\(\) \{[\s\S]*\}\)\(\);/.test(html), "init() se invoca (no vuelve a pasar lo de las pestanas)");
const visible = html.replace(/<!--[\s\S]*?-->/g, "");
const sinUrls = visible.replace(/https:\/\/mctiers\.com\/tier_icons\/\w+\.svg/g, "");
chk(!/mctiers/i.test(sinUrls), "sin marca MCTiers visible (las URLs de iconos no cuentan)");
chk(/mctiers/i.test(html), "credito a la referencia en comentario");
chk(!/kayjs/i.test(visible), "sin restos del frontend anterior");

// --- estructura funcional igual: tabs, buscador, tabla, perfil ---
for (const t of ["overall", "sword", "nethop", "cpvp", "diapot", "mace", "axe"]) {
  chk(html.includes(`data-mode="${t}"`) || html.includes(`key: "${t}"`), `pestana ${t}`);
}
chk(html.includes('id="search"'), "buscador de jugador");
chk(html.includes("Information"), "boton Information");
chk(html.includes("Server IP"), "caja de Server IP");
chk(html.includes("?player="), "links a perfil ?player=");
chk(html.includes("/api/profile/"), "perfil consume /api/profile/:name");
chk(html.includes("?mode="), "pestanas con ?mode=");
chk(html.includes("setInterval"), "auto-refresh de datos");
chk(css.includes(".tabs") && css.includes(".row") && css.includes(".tierblock"), "CSS con tabs, tabla y bloques");

// --- API con datos reales ---
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
chk(Object.keys(tiers).join(",") === "sword,nethop,cpvp,diapot,mace,axe", "API trae las 6 modalidades");
chk(tiers.sword.tier1[0]?.region === "NA", "/api/tiers incluye region");
chk(tiers.sword.tier1.some((p) => p.name === "Distraccion" && p.badges[0] === "ht1" && p.points === 100), "HT1 = 100 pts");

// overall calculable como lo hace el front
const pts = {};
for (const mode of Object.keys(tiers)) {
  for (const t of Object.values(tiers[mode])) {
    for (const p of t) pts[p.name] = (pts[p.name] ?? 0) + p.points;
  }
}
chk(pts.Distract === undefined && pts.Distraccion === 100 && pts.Selkie === 90, "overall: Distraccion 100, Selkie 90");

// --- estaticos sirven ---
for (const p of ["/", "/style.css", "/tier_icons/overall.svg", "/tier_icons/sword.svg"]) {
  const r = await fetch(base + p);
  chk(r.status === 200, `${p} responde 200`);
}
const home = await (await fetch(base + "/")).text();
chk(home.includes("GALAXY"), "la home trae la marca");
chk((await (await fetch(`${base}/api/profile/Selkie`)).json()).current.sword === "LT3", "perfil de Selkie OK");

srv.close();
db.exec("DELETE FROM meta WHERE key IN ('active_mode','queue_open','queue_opened_at','panels')");
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
