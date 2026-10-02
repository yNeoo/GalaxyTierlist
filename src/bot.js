import {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits
} from "discord.js";
import { GAMEMODES, TIERS, REGIONS } from "./config.js";
import { db, upsertPlayer, logTest, getProfile } from "./db.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // opcional: para registro rapido guild
const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID || "";
const REQUEST_CHANNEL_ID = process.env.REQUEST_CHANNEL_ID || "";

let queueOpen = true;
const activeTesters = new Set(); // discord user ids

async function mojangUUID(ign) {
  const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`);
  if (!r.ok) return null;
  return r.json(); // {id, name}
}

export function createBot() {
  if (!TOKEN) {
    console.log("[bot] DISCORD_TOKEN no configurado, bot desactivado (web sigue funcionando).");
    return null;
  }
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

  client.once("ready", () => console.log(`[bot] GalaxyTierlist online como ${client.user.tag}`));

  client.on("interactionCreate", async (it) => {
    try {
      if (it.isChatInputCommand()) await handleSlash(it);
      else if (it.isButton()) await handleButton(it);
      else if (it.isModalSubmit()) await handleModal(it);
      else if (it.isStringSelectMenu()) await handleSelect(it);
    } catch (e) {
      console.error(e);
      if (it.isRepliable() && !it.replied) await it.reply({ content: "Error interno.", ephemeral: true });
    }
  });

  client.login(TOKEN);
  registerCommands().catch(console.error);
  return client;
}

async function registerCommands() {
  if (!CLIENT_ID) return;
  const cmds = [
    new SlashCommandBuilder().setName("setup").setDescription("Publica el panel de cola (Verify + Waitlist)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("queue").setDescription("Control de cola")
      .addStringOption(o => o.setName("accion").setDescription("open/close/status").setRequired(true)
        .addChoices({name:"open",value:"open"},{name:"close",value:"close"},{name:"status",value:"status"})),
    new SlashCommandBuilder().setName("start").setDescription("Marcarte como tester activo"),
    new SlashCommandBuilder().setName("stop").setDescription("Salir de testers activos"),
    new SlashCommandBuilder().setName("next").setDescription("Sacar al siguiente de la cola y crear ticket").addStringOption(o=>o.setName("gamemode").setDescription("modo").setRequired(false)),
    new SlashCommandBuilder().setName("close").setDescription("Cerrar test y dar tier")
      .addUserOption(o=>o.setName("jugador").setDescription("testeado").setRequired(true))
      .addStringOption(o=>o.setName("gamemode").setDescription("modo").setRequired(true).addChoices(...GAMEMODES.map(g=>({name:g.name,value:g.key}))))
      .addStringOption(o=>o.setName("tier").setDescription("tier").setRequired(true).addChoices(...TIERS.map(t=>({name:t,value:t}))))
      .addStringOption(o=>o.setName("notas").setDescription("notas").setRequired(false)),
    new SlashCommandBuilder().setName("result").setDescription("Alias de /close (log rapido)").addStringOption(o=>o.setName("ign").setDescription("IGN").setRequired(true)).addStringOption(o=>o.setName("gamemode").setDescription("modo").setRequired(true).addChoices(...GAMEMODES.map(g=>({name:g.name,value:g.key})))).addStringOption(o=>o.setName("tier").setDescription("tier").setRequired(true).addChoices(...TIERS.map(t=>({name:t,value:t})))),
    new SlashCommandBuilder().setName("skip").setDescription("Sacar a alguien de la cola sin test").addUserOption(o=>o.setName("jugador").setDescription("jugador").setRequired(true)),
    new SlashCommandBuilder().setName("profile").setDescription("Ver perfil").addStringOption(o=>o.setName("ign").setDescription("IGN").setRequired(true)),
    new SlashCommandBuilder().setName("tierwipe").setDescription("Borrar tiers de un jugador").addStringOption(o=>o.setName("ign").setDescription("IGN").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("leave").setDescription("Salir de la cola"),
  ].map(c=>c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
  else await rest.put(Routes.applicationCommands(CLIENT_ID), { body: cmds });
  console.log("[bot] comandos registrados");
}

function queuePanel() {
  const embed = new EmbedBuilder()
    .setTitle("🌌 GalaxyTierlist — Tier Testing")
    .setDescription("1️⃣ Pulsa **Verify Account** e ingresa tu IGN de Minecraft.\n2️⃣ Pulsa **Enter Waitlist**, elige modo y región.\n3️⃣ Espera a que un tester te haga `/next`.\n\nCuando te den tier con `/close`, apareces al instante en la web.")
    .setColor(0x7c3aed);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("verify").setLabel("Verify Account").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("waitlist").setLabel("Enter Waitlist").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("leave").setLabel("Leave Queue").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("cooldown").setLabel("Check Cooldown").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

async function handleSlash(it) {
  const { commandName } = it;
  if (commandName === "setup") return it.reply({ ...queuePanel(), content: "Panel publicado. Fíjalo con 📌." });
  if (commandName === "queue") {
    const a = it.options.getString("accion");
    if (a === "open") { queueOpen = true; return it.reply("✅ Cola abierta."); }
    if (a === "close") { queueOpen = false; return it.reply("⛔ Cola cerrada."); }
    const n = db.prepare("SELECT COUNT(*) as c FROM queue").get().c;
    return it.reply(`Cola ${queueOpen ? "abierta" : "cerrada"} — en espera: **${n}** — testers activos: **${activeTesters.size}**`);
  }
  if (commandName === "start") { activeTesters.add(it.user.id); return it.reply(`✅ ${it.user} ahora es tester activo.`); }
  if (commandName === "stop") { activeTesters.delete(it.user.id); return it.reply("Dejaste de ser tester activo."); }
  if (commandName === "leave") {
    db.prepare("DELETE FROM queue WHERE discord_id=?").run(it.user.id);
    return it.reply({ content: "Saliste de la cola.", ephemeral: true });
  }
  if (commandName === "next") {
    const mode = it.options.getString("gamemode");
    const row = db.prepare(`SELECT * FROM queue ${mode ? "WHERE gamemode=?" : ""} ORDER BY created ASC LIMIT 1`).get(...(mode ? [mode] : []));
    if (!row) return it.reply({ content: "Cola vacía.", ephemeral: true });
    db.prepare("DELETE FROM queue WHERE id=?").run(row.id);
    const ch = await it.guild.channels.create({ name: `test-${row.ign}-${row.gamemode}`, reason: "GalaxyTierlist test" }).catch(()=>null);
    const msg = `🎫 Test: **${row.ign}** (${row.gamemode} / ${row.region}) testeado por ${it.user}. Usa \`/close jugador:@${it.user.username} gamemode:${row.gamemode} tier:HT3\``;
    if (ch) await ch.send(`${row.discord_id ? `<@${row.discord_id}>` : row.ign} ${msg}`);
    return it.reply({ content: `Siguiente: **${row.ign}** [${row.gamemode}/${row.region}] ${ch ? `-> ${ch}` : ""}`, ephemeral: false });
  }
  if (commandName === "close" || commandName === "result") {
    let ign, mode, tier, tester = it.user.id, notes = "";
    if (commandName === "close") {
      const user = it.options.getUser("jugador");
      mode = it.options.getString("gamemode"); tier = it.options.getString("tier");
      notes = it.options.getString("notas") ?? "";
      // intenta resolver IGN por discord_id en players o queue; si no, usa username
      const linked = user ? db.prepare("SELECT name FROM players WHERE discord_id=?").get(user.id) : null;
      ign = linked?.name ?? user?.username ?? "unknown";
      if (user) tester = it.user.id;
    } else {
      ign = it.options.getString("ign"); mode = it.options.getString("gamemode"); tier = it.options.getString("tier");
    }
    logTest({ tester_discord: tester, tested_name: ign, gamemode: mode, tier, notes });
    const embed = new EmbedBuilder().setTitle(`✅ ${ign} — ${tier} en ${mode}`).setDescription(`Testeado por <@${tester}>`).setColor(0x22c55e).setTimestamp();
    if (RESULTS_CHANNEL_ID) {
      const rc = await it.guild.channels.fetch(RESULTS_CHANNEL_ID).catch(()=>null);
      if (rc?.isTextBased()) await rc.send({ embeds: [embed] });
    }
    return it.reply({ embeds: [embed], content: `🌐 Ya visible en la web: /?player=${encodeURIComponent(ign)}` });
  }
  if (commandName === "skip") {
    const user = it.options.getUser("jugador");
    db.prepare("DELETE FROM queue WHERE discord_id=?").run(user.id);
    return it.reply(`⏭️ ${user} sacado de la cola.`);
  }
  if (commandName === "profile") {
    const ign = it.options.getString("ign");
    const p = getProfile(ign);
    if (!p) return it.reply({ content: `Sin datos para **${ign}**.`, ephemeral: true });
    const desc = GAMEMODES.map(g => `**${g.name}:** ${p.current[g.key] ?? "—"}`).join("\n");
    return it.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${ign} (${p.player.region})`).setDescription(desc).setColor(0x7c3aed)] });
  }
  if (commandName === "tierwipe") {
    const ign = it.options.getString("ign");
    db.prepare("DELETE FROM tests WHERE tested_name=?").run(ign);
    db.prepare("DELETE FROM players WHERE name=?").run(ign);
    return it.reply(`🧹 Tiers de **${ign}** borrados (web actualizada).`);
  }
}

async function handleButton(it) {
  if (it.customId === "verify") {
    const modal = new ModalBuilder().setCustomId("verifyModal").setTitle("Verify Account");
    const ign = new TextInputBuilder().setCustomId("ign").setLabel("Tu IGN de Minecraft").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16);
    const region = new TextInputBuilder().setCustomId("region").setLabel("Región: NA / EU / AS").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2);
    modal.addComponents(new ActionRowBuilder().addComponents(ign), new ActionRowBuilder().addComponents(region));
    return it.showModal(modal);
  }
  if (it.customId === "waitlist") {
    if (!queueOpen) return it.reply({ content: "Cola cerrada por ahora.", ephemeral: true });
    const player = db.prepare("SELECT * FROM players WHERE discord_id=?").get(it.user.id);
    if (!player) return it.reply({ content: "Primero verifica tu cuenta con **Verify Account**.", ephemeral: true });
    const selMode = new StringSelectMenuBuilder().setCustomId("selMode").setPlaceholder("Elige gamemode")
      .addOptions(GAMEMODES.map(g=>({label:g.name,value:g.key,emoji:g.icon})));
    const selRegion = new StringSelectMenuBuilder().setCustomId("selRegion").setPlaceholder("Elige región")
      .addOptions(REGIONS.map(r=>({label:r,value:r})));
    return it.reply({ content: "Elige modo y región:", components: [new ActionRowBuilder().addComponents(selMode), new ActionRowBuilder().addComponents(selRegion)], ephemeral: true });
  }
  if (it.customId === "leave") {
    db.prepare("DELETE FROM queue WHERE discord_id=?").run(it.user.id);
    return it.reply({ content: "Saliste de la cola.", ephemeral: true });
  }
  if (it.customId === "cooldown") {
    const last = db.prepare("SELECT timestamp FROM tests WHERE tested_name IN (SELECT name FROM players WHERE discord_id=?) ORDER BY timestamp DESC LIMIT 1").get(it.user.id);
    if (!last) return it.reply({ content: "Sin cooldown, puedes entrar a la cola.", ephemeral: true });
    return it.reply({ content: `Último test: <t:${Math.floor(last.timestamp/1000)}:R>`, ephemeral: true });
  }
}

async function handleModal(it) {
  if (it.customId === "verifyModal") {
    const ign = it.fields.getTextInputValue("ign").trim();
    const region = (it.fields.getTextInputValue("region") || "NA").trim().toUpperCase();
    const m = await mojangUUID(ign).catch(()=>null);
    if (!m) return it.reply({ content: `❌ IGN **${ign}** no existe en Mojang. Revisa el nombre.`, ephemeral: true });
    upsertPlayer({ uuid: m.id, name: m.name, discord_id: it.user.id, region: REGIONS.includes(region) ? region : "NA" });
    return it.reply({ content: `✅ Verificado: **${m.name}** (${region}). Ahora pulsa **Enter Waitlist**.`, ephemeral: true });
  }
}

const pendingSel = new Map(); // userId -> {mode, region}
async function handleSelect(it) {
  const uid = it.user.id;
  const cur = pendingSel.get(uid) ?? {};
  if (it.customId === "selMode") cur.mode = it.values[0];
  if (it.customId === "selRegion") cur.region = it.values[0];
  pendingSel.set(uid, cur);
  if (cur.mode && cur.region) {
    pendingSel.delete(uid);
    const player = db.prepare("SELECT * FROM players WHERE discord_id=?").get(uid);
    const exists = db.prepare("SELECT * FROM queue WHERE discord_id=? AND gamemode=?").get(uid, cur.mode);
    if (!exists) db.prepare("INSERT INTO queue (discord_id, ign, gamemode, region, created) VALUES (?,?,?,?,?)").run(uid, player.name, cur.mode, cur.region, Date.now());
    const pos = db.prepare("SELECT COUNT(*) as c FROM queue WHERE gamemode=?").get(cur.mode).c;
    return it.update({ content: `✅ En cola: **${player.name}** [${cur.mode}/${cur.region}] — posición aprox en ese modo: **#${pos}**`, components: [] });
  }
  return it.reply({ content: `Elegido: **${it.values[0]}**. Elige el otro campo.`, ephemeral: true });
}
