// Verifica el panel de cola, el embed de resultado con skin y el de ticket.
//   node scripts/check-embeds.mjs
import { queuePayload, ticketEmbed, resultEmbed } from "../src/bot.js";
import { addToQueue, setActiveMode, setQueueOpen, clearQueue, upsertPlayer, db } from "../src/db.js";
import { skinUrl } from "../src/config.js";

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

setActiveMode("sword");
setQueueOpen("sword", true);

// ───────────────────────────── panel de cola: vacía
clearQueue("sword");
let p = ser(queuePayload(null));
console.log("\n=== PANEL DE COLA (vacia) ===");
line(`titulo : ${p.embeds[0].title}`);
line("desc   : " + p.embeds[0].description.replace(/\n/g, " | "));
line("pie    : " + p.embeds[0].footer.text);
line("botones: " + p.buttons.map((b) => `${b.label}->${b.custom_id}`).join(", "));
chk(p.embeds[0].title === "GalaxyTierlist", 'titulo "GalaxyTierlist"');
chk(p.buttons.length === 3, "3 botones: Unirse, Salir, Ticket");
chk(p.buttons.map((b) => b.label).join(",") === "Unirse,Salir,Ticket", "orden Unirse, Salir, Ticket");
chk(!p.buttons.some((b) => b.custom_id === "q:verify"), "ya NO hay boton Verify en el panel");
chk(!p.buttons.some((b) => b.custom_id === "q:open"), "ya NO hay boton Open en el panel");

// ───────────────────────────── panel con 7 en cola -> muestra 1..5
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
p = ser(queuePayload(null));
line(p.embeds[0].description);
line("pie: " + p.embeds[0].footer.text);
chk(/^\*\*1\.\*\*/.test(p.embeds[0].description.trim()), "empieza en el puesto 1");
chk(p.embeds[0].description.includes("**5.**"), "incluye el puesto 5");
chk((p.embeds[0].description.match(/\*\*\d+\.\*\*/g) ?? []).length === 5, "exactamente 5 puestos");
chk(p.embeds[0].description.includes("<@d0>"), "el #1 muestra su tag (mencion)");
chk(!p.embeds[0].description.includes("Cobblemon"), "el #6 NO aparece");
chk(!p.embeds[0].description.includes("gays"), "el #7 NO aparece");
chk(
  p.embeds[0].description.indexOf("Distraccion") < p.embeds[0].description.indexOf("Notch"),
  "#1 va antes que #2"
);
chk(p.embeds[0].footer.text.includes("+2 mas"), "pie avisa de los 2 restantes");
chk(p.embeds[0].footer.text.includes("7 en cola"), "pie con el total");

console.log("\n=== vista de jugador (sin Ticket) ===");
const u = ser(queuePayload("d0"));
line("botones: " + u.buttons.map((b) => b.label).join(", "));
chk(u.buttons.length === 2, "jugador ve solo Unirse y Salir");
chk(!u.buttons.some((b) => b.custom_id === "q:ticket"), "Ticket reservado a testers");

// ───────────────────────────── embed de resultado
console.log("\n=== EMBED DE RESULTADO ===");
const r = resultEmbed({
  name: "Distraccion",
  tier: "HT1",
  mode: "sword",
  tester: "123",
  notes: "gano 3-0",
  uuid: "069a79f444e94726a5befca90e38aaf5",
});
const rj = r.map((e) => e.toJSON());
line("embed 1 titulo : " + rj[0].title);
line("embed 1 desc   : " + rj[0].description);
line("embed 1 campos : " + rj[0].fields.map((x) => `${x.name}=${x.value}`).join("  "));
line("embed 1 color  : #" + rj[0].color.toString(16).padStart(6, "0"));
line("embed 2 imagen : " + (rj[1]?.image?.url ?? "(ninguna)"));
chk(rj.length === 2, "2 embeds (texto + skin)");
chk(rj[0].description.includes("Distraccion"), "muestra el nick verificado");
chk(rj[0].fields.some((x) => x.name === "Tier" && x.value.includes("HT1")), "campo Tier");
chk(rj[0].fields.some((x) => x.name === "Modalidad" && x.value.includes("Sword")), "campo Modalidad");
chk(rj[1].image.url.startsWith("https://mc-heads.net/body/"), "skin desde mc-heads");
chk(rj[1].image.url.includes("300.png"), "skin en 300px (grande)");
chk(!rj[0].description.includes("<"), "el nick va en texto de embed, no en contenido");

// el embed de imagen solo lleva imagen
chk(Object.keys(rj[1]).every((k) => ["type", "image"].includes(k)), "embed 2 solo tiene la imagen");

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

clearQueue("sword");
db.exec("DELETE FROM meta WHERE key='active_mode'");
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);