// Verifica el panel de cola (diseno propio GalaxyTierlist), el embed de
// resultado con skin y el de ticket.
//   node scripts/check-embeds.mjs
import { readFile } from "node:fs/promises";
import { queuePayload, ticketEmbed, resultEmbed } from "../src/bot.js";
import { addToQueue, setActiveMode, setQueueOpen, clearQueue, upsertPlayer, db } from "../src/db.js";
import { skinUrl, avatarUrl } from "../src/config.js";

let fails = 0;
const chk = (ok, msg) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`);
  if (!ok) fails++;
};
const ser = (p) => ({
  embeds: p.embeds.map((e) => e.toJSON()),
  buttons: p.components.flatMap((r) => r.toJSON().components),
});
const line = (t = "") => console.log("  │ " + t);

// Estado limpio: la DB local arrastra metas de corridas anteriores.
db.exec("DELETE FROM meta WHERE key IN ('active_mode','queue_open','queue_opened_at','panels')");
setActiveMode("sword");
setQueueOpen("sword", true);

// ───────────────────────────── panel de cola: vacía
clearQueue("sword");
let p = ser(queuePayload(null, "sword"));
console.log("\n=== PANEL DE COLA (vacia) ===");
line(`titulo : ${p.embeds[0].title}`);
line("desc   : " + JSON.stringify(p.embeds[0].description));
line("pie    : " + p.embeds[0].footer.text);
line("botones: " + p.buttons.map((b) => `${b.label}->${b.custom_id}`).join(", "));
chk(p.embeds[0].title === "GalaxyTierlist", 'titulo "GalaxyTierlist"');
chk(p.buttons.length === 3, "3 botones");
chk(p.buttons.map((b) => b.label).join(",") === "Unirse,Salir,Ticket", "botones Unirse / Salir / Ticket");
chk(p.buttons.every((b) => b.custom_id.endsWith(":sword")), "botones llevan la modalidad");
chk((p.embeds[0].fields ?? []).length === 0, "sin campos (diseno propio, no el de referencia)");
chk(p.embeds[0].description.trim() === "1\n2\n3\n4\n5", "vacia = solo los numeros 1-5");
chk(!JSON.stringify(p.embeds[0]).includes("```"), 'sin bloque de codigo (el "cuadrado")');
chk(p.embeds[0].footer.text.includes("Sword"), "pie con la modalidad");
chk(p.embeds[0].footer.text.includes("Abierta"), "pie con el estado");

// cerrada por defecto en otra modalidad (nunca abierta)
let pc = ser(queuePayload(null, "nethop"));
chk(pc.embeds[0].footer.text.includes("Cerrada"), "modalidad sin abrir sale cerrada");

// ───────────────────────────── panel con 7 en cola
clearQueue("sword");
const gente = [
  ["Distraccion", "NA", "069a79f444e94726a5befca90e38aaf5"],
  ["Notch", "EU", null],
  ["Zenith", "AS", null],
  ["Squids", "NA", null],
  ["Betatest", "EU", null],
  ["Cobblemon", "AS", null],
  ["gays", "NA", null],
];
gente.forEach(([n, reg], i) => {
  upsertPlayer({ name: n, discord_id: `d${i}`, region: reg });
  addToQueue({ discord_id: `d${i}`, ign: n, tag: `t${i}`, gamemode: "sword", region: reg });
});

console.log("\n=== PANEL DE COLA (7 en cola) ===");
p = ser(queuePayload(null, "sword"));
line(p.embeds[0].description);
line("pie: " + p.embeds[0].footer.text);
chk(/^\*\*1\.\*\*/.test(p.embeds[0].description.trim()), "empieza en el puesto 1");
chk(p.embeds[0].description.includes("**7.**"), "incluye el puesto 7");
chk((p.embeds[0].description.match(/\*\*\d+\.\*\*/g) ?? []).length === 7, "los 7 puestos visibles");
chk(p.embeds[0].description.includes("<@d0>"), "el #1 muestra su tag (mencion)");
chk(
  p.embeds[0].description.indexOf("Distraccion") < p.embeds[0].description.indexOf("Notch"),
  "#1 va antes que #2"
);
chk(p.embeds[0].footer.text.includes("7/15 en cola"), "pie con el total 7/15");

// tope de capacidad: 15 adentro, el 16 no entra
for (let i = 7; i < 15; i++) {
  upsertPlayer({ name: `Extra${i}`, discord_id: `x${i}`, region: "NA" });
  addToQueue({ discord_id: `x${i}`, ign: `Extra${i}`, tag: `ex${i}`, gamemode: "sword", region: "NA" });
}
upsertPlayer({ name: "Lleno", discord_id: "xfull", region: "NA" });
const lleno = addToQueue({ discord_id: "xfull", ign: "Lleno", tag: "lf", gamemode: "sword", region: "NA" });
chk(lleno.full === true, "la cola llena (15/15) rechaza al 16");
const pfull = ser(queuePayload(null, "sword"));
chk(pfull.embeds[0].footer.text.includes("15/15 en cola"), "pie con 15/15");
clearQueue("sword");

// paneles independientes por modalidad
setQueueOpen("nethop", true);
addToQueue({ discord_id: "dx", ign: "NetPlayer", tag: "nx", gamemode: "nethop", region: "NA" });
const pn = ser(queuePayload(null, "nethop"));
chk(pn.embeds[0].footer.text.includes("NethOP"), "panel de nethop independiente");
chk(pn.embeds[0].footer.text.includes("1/15 en cola"), "nethop con 1 en cola");
chk(p.embeds[0].footer.text.includes("7/15 en cola"), "sword intacta con 7");
clearQueue("nethop");
setQueueOpen("nethop", false);

console.log("\n=== vista de jugador (sin Ticket) ===");
const u = ser(queuePayload("d0", "sword"));
line("botones: " + u.buttons.map((b) => b.label).join(", "));
chk(u.buttons.length === 2, "jugador ve solo Unirse y Salir");
chk(!u.buttons.some((b) => b.custom_id.startsWith("q:ticket")), "Ticket reservado a testers");

// ───────────────────────────── embed de resultado (formato de los videos)
console.log("\n=== EMBED DE RESULTADO ===");
const r = resultEmbed({
  name: "Distraccion",
  tier: "HT1",
  mode: "sword",
  tester: "123",
  notes: "gano 3-0",
  uuid: "069a79f444e94726a5befca90e38aaf5",
  region: "NA",
  before: "LT2",
});
const rj = r.map((e) => e.toJSON());
line("titulo : " + rj[0].title);
line("thumb  : " + (rj[0].thumbnail?.url ?? "(ninguno)"));
line("campos : " + rj[0].fields.map((x) => `${x.name}=${x.value}`).join("  "));
line("imagen : " + (rj[0].image?.url ?? "(ninguna)"));
line("color  : #" + rj[0].color.toString(16).padStart(6, "0"));
chk(rj.length === 1, "un solo embed (skin adentro, no aparte)");
chk(rj[0].title === "Tier Test Results 🏆", "titulo Tier Test Results");
chk((rj[0].thumbnail?.url ?? "").startsWith("https://mc-heads.net/avatar/"), "thumbnail con avatar");
chk(rj[0].fields.some((x) => x.name === "IGN" && x.value.includes("Distraccion")), "campo IGN");
chk(rj[0].fields.some((x) => x.name === "Region" && x.value.includes("NA")), "campo Region");
chk(rj[0].fields.some((x) => x.name === "Gamemode" && x.value.includes("Sword")), "campo Gamemode");
chk(rj[0].fields.some((x) => x.name === "Tier Before" && x.value.includes("LT2")), "campo Tier Before");
chk(rj[0].fields.some((x) => x.name === "Tier Earned" && x.value.includes("HT1")), "campo Tier Earned");
chk(rj[0].fields.some((x) => x.name === "Tester" && x.value.includes("<@123>")), "campo Tester");
chk((rj[0].image?.url ?? "").startsWith("https://mc-heads.net/body/"), "skin grande en el mismo embed");
chk((rj[0].image?.url ?? "").includes("300.png"), "skin en 300px (grande)");

// sin tier anterior muestra N/A como en el video
const r2 = resultEmbed({ name: "Nuevo", tier: "HT5", mode: "axe", tester: "123", uuid: null })[0].toJSON();
chk(r2.fields.some((x) => x.name === "Tier Before" && x.value.includes("N/A")), "sin anterior = N/A");

// el avatar realmente carga
try {
  const res = await fetch(avatarUrl({ uuid: "069a79f444e94726a5befca90e38aaf5" }));
  const buf = Buffer.from(await res.arrayBuffer());
  chk(res.status === 200 && buf.subarray(1, 4).toString() === "PNG", "el avatar carga y es PNG valido");
} catch (e) {
  chk(false, "el avatar no cargo: " + e.message);
}



// ───────────────────────────── la skin realmente carga
console.log("\n=== la skin responde? ===");
const url = skinUrl({ uuid: "069a79f444e94726a5befca90e38aaf5", name: "Notch" });
try {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const png = buf.length > 8 && buf.subarray(1, 4).toString() === "PNG";
  line(`${res.status}  ${buf.length}b  png=${png}  ${url}`);
  chk(res.status === 200 && png, "la imagen de skin carga y es PNG valido");
} catch (e) {
  chk(false, "la skin no cargo: " + e.message);
}
// sin uuid debe usar el nombre
chk(skinUrl({ name: "Notch" }) === "https://mc-heads.net/body/Notch/300.png", "sin uuid usa el nombre");
chk(skinUrl({}) === null, "sin datos no genera url");

// ───────────────────────────── embed de ticket
console.log("\n=== EMBED DE TICKET ===");
const t = ticketEmbed({ testerId: "123", mode: "nethop" }).toJSON();
line("titulo: " + t.title);
t.description.split("\n").forEach((l) => line(l));
chk(t.title === "GalaxyTiers", "titulo GalaxyTiers");
chk(t.description.includes("<@123>"), "tester asignado");
chk(t.description.includes("NethOP"), "modalidad de la cola");
chk(/no seas toxico/i.test(t.description), "aviso toxico");
chk(/paciencia/i.test(t.description) && /1m-2m/.test(t.description), "aviso paciencia 1m-2m");

// ───────────────────────────── el panel nunca se substituye
// (bug: al pulsar Unirse se hacia interaction.update() y el panel se
//  substituia por el embed de confirmacion)
console.log("\n=== el panel no se substituye al unirse ===");
const src = await readFile(new URL("../src/bot.js", import.meta.url), "utf8");
const cuerpoEnqueue = src.slice(
  src.indexOf("async function enqueue"),
  src.indexOf("async function handleLeave")
);
chk(!cuerpoEnqueue.includes("interaction.update("), "enqueue no llama interaction.update");
chk(!cuerpoEnqueue.includes("it.update("), "enqueue no llama it.update");
chk(!cuerpoEnqueue.includes("respondAs"), "enqueue ya no usa respondAs");
chk(cuerpoEnqueue.includes("ephemeral: true"), "enqueue responde efimero");
chk(cuerpoEnqueue.includes("refreshPanel"), "enqueue refresca el panel por separado");

const cuerpoTicket = src.slice(
  src.indexOf("async function handleTicket("),
  src.indexOf("// ------------------------------------------------------------------ select")
);
chk(!cuerpoTicket.includes("it.update("), "handleTicket no llama it.update");

// it.update solo en respuestas efimeras propias: el selector y el cancelar cierre
const updates = src.match(/\bit\.update\(/g) ?? [];
chk(updates.length === 2, `it.update 2 veces (selector + cancelar), hay ${updates.length}`);
chk(!src.includes("respondAs"), "respondAs ya no existe en el codigo");

console.log("\n=== categoria de los tickets ===");
chk(
  /TICKET_CATEGORY_ID = process\.env\.TICKET_CATEGORY_ID \|\| "1555453253984981103"/.test(src),
  "TICKET_CATEGORY_ID por defecto = 1555453253984981103"
);
const cuerpoPop = src.slice(
  src.indexOf("async function popAndOpenTicket"),
  src.indexOf("async function handleTicket(")
);
chk(cuerpoPop.includes("parent: TICKET_CATEGORY_ID"), "el ticket cuelga de TICKET_CATEGORY_ID");
chk(!cuerpoPop.includes("parent: RESULTS_CHANNEL_ID"), "ya NO cuelga del canal de resultados");

// ───────────────────────────── /closequeue cierra y el panel lo refleja
console.log("\n=== /closequeue ===");
chk(src.includes('setName("closequeue")'), "comando /closequeue registrado");
chk(src.includes('setName("queueinfo")'), "comando /queueinfo registrado");
setQueueOpen("sword", false);
const closed = ser(queuePayload(null, "sword"));
chk(closed.embeds[0].footer.text.includes("Cerrada"), "tras cerrar, el pie dice cerrada");

// ───────────────────────────── cierre de tickets
console.log("\n=== cierre de tickets ===");
chk(src.includes('setCustomId("t:close")'), "boton Cerrar ticket en el ticket");
chk(src.includes("Cerrar ticket"), 'etiqueta "Cerrar ticket"');
chk(src.includes("t:close:yes"), "confirmacion en 2 pasos (t:close:yes)");
chk(src.includes("t:close:no"), "boton Cancelar el cierre");
chk(src.includes("Solo los testers pueden cerrar el ticket"), "cerrar reservado a testers");
chk(src.includes('startsWith("test-")'), "/result detecta si esta dentro de un ticket");
chk(src.includes("Cerrando ticket en 10 segundos"), "autocierre tras /result con aviso");

// el /result ya no manda texto con el link de la web
chk(!src.includes("galaxytierlist.onrender.com/?player="), "sin mensaje Web: en el resultado");

clearQueue("sword");
db.exec("DELETE FROM meta WHERE key IN ('active_mode','queue_open','queue_opened_at','panels')");
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
