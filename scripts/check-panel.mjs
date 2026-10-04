// Valida que el panel y el embed de ticket generen payloads que Discord acepta.
import { panelPayload, ticketEmbed } from "../src/bot.js";
import { addToQueue, setActiveMode, setQueueOpen, clearQueue, upsertPlayer } from "../src/db.js";

let fails = 0;
const chk = (ok, msg) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`);
  if (!ok) fails++;
};
const ser = (p) => ({
  embeds: p.embeds.map((e) => e.toJSON()),
  buttons: p.components.flatMap((r) => r.toJSON().components),
});

setActiveMode("sword");
setQueueOpen("sword", true);

// ---------------------------------------------------------- panel vacio
clearQueue("sword");
let p = ser(panelPayload(null));
console.log("== panel publicado (/setup) - whitelist vacia ==");
console.log("  botones:", p.buttons.map((b) => `${b.label} -> ${b.custom_id}`).join(", "));
chk(p.buttons.length === 5, "5 botones: Unirse, Salir, Open, Ticket, Verify");
chk(p.embeds[0].description.includes("No hay nadie"), "avisa que la whitelist esta vacia");
chk(p.buttons.every((b) => b.label.length <= 80), "labels <= 80");
chk(p.buttons.every((b) => b.custom_id.length <= 100), "custom_id <= 100");

// ------------------------------------------------------ panel con 7 en cola
clearQueue("sword");
const gente = ["Distraccion", "Selkie", "Zenith", "Squids", "Betatest", "Cobblemon", "gays"];
gente.forEach((n, i) => {
  upsertPlayer({ name: n, discord_id: `d${i}`, region: ["NA", "EU", "AS"][i % 3] });
  addToQueue({ discord_id: `d${i}`, ign: n, tag: `tag${i}`, gamemode: "sword", region: ["NA", "EU", "AS"][i % 3] });
});

console.log("\n== panel con 7 en cola - se muestran los 5 primeros ==");
p = ser(panelPayload(null));
console.log("  ---");
console.log("  " + p.embeds[0].description.split("\n").join("\n  "));
console.log("  ---");
chk(!p.embeds[0].description.includes("Cobblemon"), "el #6 NO aparece en el panel");
chk(!p.embeds[0].description.includes("gays"), "el #7 NO aparece en el panel");
for (let i = 0; i < 5; i++) {
  chk(p.embeds[0].description.includes(`**${i + 1}.**`), `puesto ${i + 1} visible`);
}
chk(p.embeds[0].description.indexOf("Distraccion") < p.embeds[0].description.indexOf("Selkie"),
  "orden correcto: #1 antes que #2");
chk(p.embeds[0].footer.text.includes("+2 mas"), "footer avisa de los 2 restantes");
chk(p.embeds[0].fields.some((f) => f.name === "En cola" && f.value.includes("7")), "campo En cola = 7");

console.log("\n== vista de un jugador normal (no tester) ==");
const u = ser(panelPayload("d0"));
console.log("  botones:", u.buttons.map((b) => b.label).join(", "));
chk(u.buttons.length === 2, "solo 2 botones");
chk(!u.buttons.some((b) => ["q:ticket", "q:open"].includes(b.custom_id)), "NO ve Ticket ni Open");

console.log("\n== embed de ticket ==");
const te = ticketEmbed({ testerId: "123", mode: "nethop" }).toJSON();
console.log("  titulo:", te.title);
console.log("  ---");
console.log("  " + te.description.split("\n").join("\n  "));
console.log("  ---");
chk(te.title === "GalaxyTiers", "titulo GalaxyTiers");
chk(te.description.includes("<@123>"), "menciona al tester asignado");
chk(te.description.includes("NethOP"), "menciona la modalidad de la queue");
chk(/no seas toxico/i.test(te.description), "aviso: no ser toxico");
chk(/paciencia/i.test(te.description), "aviso: paciencia");
chk(/1m-2m/.test(te.description), "aviso: 1m-2m");

clearQueue("sword");
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);