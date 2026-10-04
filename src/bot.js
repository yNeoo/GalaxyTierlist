import {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";
import { GAMEMODES, TIERS, REGIONS, MAX_QUEUE_SHOWN, modeByKey, modeName } from "./config.js";
import {
  db, upsertPlayer, logTest, getProfile, getCurrentTier,
  getQueue, queueCount, addToQueue, removeFromQueue, popQueue,
  getPlayerByDiscord, getOpenStates, setQueueOpen, isQueueOpen,
  getActiveMode, setActiveMode, getPanel, setPanel
} from "./db.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID || "";

const activeTesters = new Set(); // /start  -> tester activo en esta sesion
const testerIds = new Set();      // vista con botones Open/Ticket

// --------------------------------------------------------------- utilidades
function hasAdmin(it) {
  return it.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function isTester(member, userId) {
  if (!member) return false;
  const id = userId ?? member.user?.id;
  return activeTesters.has(id) || testerIds.has(id) || hasAdmin({ member });
}

/** remember quien puede ver los botones de tester, para re-renderizar el panel */
function markTester(it) {
  if (isTester(it.member, it.user?.id)) testerIds.add(it.user.id);
}

async function mojangUUID(ign) {
  const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`);
  if (!r.ok) return null;
  return r.json();
}

function queueLine(row, i) {
  const who = row.discord_id ? `<@${row.discord_id}>` : `\`${row.ign}\``;
  return `**${i + 1}.** ${who}\n\`${row.ign}\`  ·  ${row.region}`;
}

// ------------------------------------------------------- panel / whitelist
export function panelPayload(userId = null) {
  const mode = getActiveMode();
  const g = modeByKey(mode);
  const open = isQueueOpen(mode);
  const rows = getQueue(mode);
  const total = rows.length;
  const shown = rows.slice(0, MAX_QUEUE_SHOWN);

  const desc = shown.length
    ? shown.map(queueLine).join("\n")
    : `\`\`\`No hay nadie en la whitelist de ${g.name}.\n\`\`\``;

  const embed = new EmbedBuilder()
    .setTitle("GalaxyTiers — Whitelist")
    .setDescription(desc)
    .addFields(
      { name: "Modalidad", value: `${g.icon} **${g.name}**`, inline: true },
      { name: "Estado", value: open ? "🟢 Abierta" : "🔴 Cerrada", inline: true },
      { name: "En cola", value: `**${total}**`, inline: true }
    )
    .setFooter({
      text:
        (total > MAX_QUEUE_SHOWN ? `+${total - MAX_QUEUE_SHOWN} mas en cola · ` : "") +
        "Unirse requiere verificar la cuenta primero."
    })
    .setColor(g.key === "axe" ? 0xb7410e : 0x7c3aed);

  const testerView = userId ? isTesterView(userId) : true;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("q:join").setLabel("Unirse").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("q:leave").setLabel("Salir").setStyle(ButtonStyle.Secondary)
  );

  if (testerView) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("q:open").setLabel("Open").setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("q:ticket").setLabel("Ticket").setStyle(ButtonStyle.Danger)
    );
  }

  const components = [row];
  if (!userId) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("q:verify").setLabel("Verify Account").setStyle(ButtonStyle.Primary)
      )
    );
  }

  return { embeds: [embed], components };
}

function isTesterView(userId) {
  return activeTesters.has(userId) || testerIds.has(userId);
}

async function refreshPanel(client) {
  const panel = getPanel();
  if (!panel) return;
  const ch = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!ch?.isTextBased()) return;
  const msg = await ch.messages.fetch(panel.messageId).catch(() => null);
  if (!msg?.editable) return;
  await msg.edit(panelPayload(null)).catch(() => {});
}

/** Responde editando el panel si el click vino del panel; si no, responde normal. */
async function respondAs(interaction, extra = {}) {
  const onPanel =
    interaction.channelId && getPanel()?.messageId === interaction.message?.id;
  const payload = { ...panelPayload(interaction.user.id), ...extra };
  return onPanel
    ? interaction.update(payload).catch(() => {})
    : interaction.reply(payload).catch(() => {});
}

// ------------------------------------------------------------------ startup
export function createBot() {
  if (!TOKEN) {
    console.log("[bot] DISCORD_TOKEN no configurado, bot desactivado (web sigue funcionando).");
    return null;
  }
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async () => {
    console.log(`[bot] GalaxyTierlist online como ${client.user.tag}`);
    registerCommands().catch(console.error);
    await refreshPanel(client).catch(() => {});
  });

  client.on("interactionCreate", async (it) => {
    try {
      markTester(it);
      if (it.isChatInputCommand()) await handleSlash(it);
      else if (it.isButton()) await handleButton(it);
      else if (it.isModalSubmit()) await handleModal(it);
      else if (it.isStringSelectMenu()) await handleSelect(it);
    } catch (e) {
      console.error(e);
      if (it.isRepliable() && !it.replied && !it.deferred) {
        await it.reply({ content: "Error interno.", ephemeral: true }).catch(() => {});
      }
    }
  });

  client.login(TOKEN).catch((e) => console.error("[bot] login fallido:", e.message));
  return client;
}

async function registerCommands() {
  if (!CLIENT_ID) return;
  const modeChoices = GAMEMODES.map((g) => ({ name: g.name, value: g.key }));
  const tierChoices = TIERS.map((t) => ({ name: t, value: t }));

  const cmds = [
    new SlashCommandBuilder()
      .setName("open").setDescription("Abre la whitelist y elige modalidad")
      .addStringOption((o) =>
        o.setName("modalidad").setDescription("Modalidad a abrir")
          .addChoices(...modeChoices).setRequired(false)),

    new SlashCommandBuilder()
      .setName("setup").setDescription("Publica el panel de whitelist en este canal")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("queue").setDescription("Control de cola")
      .addStringOption((o) =>
        o.setName("accion").setDescription("open/close/status").setRequired(true)
          .addChoices(
            { name: "open", value: "open" },
            { name: "close", value: "close" },
            { name: "status", value: "status" }
          ))
      .addStringOption((o) =>
        o.setName("modalidad").setDescription("Modalidad (por defecto la activa)")
          .addChoices(...modeChoices).setRequired(false)),

    new SlashCommandBuilder().setName("verify").setDescription("Verifica tu cuenta de Minecraft"),
    new SlashCommandBuilder().setName("start").setDescription("Marcarte como tester activo"),
    new SlashCommandBuilder().setName("stop").setDescription("Salir de testers activos"),

    new SlashCommandBuilder()
      .setName("next").setDescription("Sacar al siguiente de la whitelist y abrir ticket")
      .addStringOption((o) => o.setName("gamemode").setDescription("modo").setRequired(false)
        .addChoices(...modeChoices)),

    new SlashCommandBuilder()
      .setName("close").setDescription("Cerrar test y dar tier")
      .addUserOption((o) => o.setName("jugador").setDescription("testeado").setRequired(true))
      .addStringOption((o) => o.setName("gamemode").setDescription("modo").setRequired(true)
        .addChoices(...modeChoices))
      .addStringOption((o) => o.setName("tier").setDescription("tier").setRequired(true)
        .addChoices(...tierChoices))
      .addStringOption((o) => o.setName("notas").setDescription("notas").setRequired(false)),

    new SlashCommandBuilder()
      .setName("result").setDescription("Alias de /close (log rapido)")
      .addStringOption((o) => o.setName("ign").setDescription("IGN").setRequired(true))
      .addStringOption((o) => o.setName("gamemode").setDescription("modo").setRequired(true)
        .addChoices(...modeChoices))
      .addStringOption((o) => o.setName("tier").setDescription("tier").setRequired(true)
        .addChoices(...tierChoices)),

    new SlashCommandBuilder()
      .setName("skip").setDescription("Sacar a alguien de la whitelist sin test")
      .addUserOption((o) => o.setName("jugador").setDescription("jugador").setRequired(true))
      .addStringOption((o) => o.setName("modalidad").setDescription("modalidad").setRequired(false)
        .addChoices(...modeChoices)),

    new SlashCommandBuilder()
      .setName("profile").setDescription("Ver perfil")
      .addStringOption((o) => o.setName("ign").setDescription("IGN").setRequired(true)),

    new SlashCommandBuilder()
      .setName("tierwipe").setDescription("Borrar tiers de un jugador")
      .addStringOption((o) => o.setName("ign").setDescription("IGN").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder().setName("leave").setDescription("Salir de la whitelist"),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: cmds });
  else await rest.put(Routes.applicationCommands(CLIENT_ID), { body: cmds });
  console.log(`[bot] ${cmds.length} comandos registrados`);
}

// ------------------------------------------------------------------ modales
function verifyModal() {
  const modal = new ModalBuilder().setCustomId("verifyModal").setTitle("Verify Account");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("ign").setLabel("Tu IGN de Minecraft")
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("region").setLabel("Region: NA / EU / AS")
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)
    )
  );
  return modal;
}

async function handleModal(it) {
  if (it.customId !== "verifyModal") return;

  const ign = it.fields.getTextInputValue("ign").trim();
  const region = (it.fields.getTextInputValue("region") || "NA").trim().toUpperCase();

  if (!/^[A-Za-z0-9_]{3,16}$/.test(ign)) {
    return it.reply({ content: "IGN invalido (3-16 letras, numeros o _).", ephemeral: true });
  }

  const m = await mojangUUID(ign).catch(() => null);
  if (!m) {
    return it.reply({
      content: `El IGN **\`${ign}\`** no existe en Mojang. Revisa que este bien escrito.`,
      ephemeral: true,
    });
  }

  const taken = getPlayerByDiscord(it.user.id);
  upsertPlayer({
    uuid: m.id,
    name: m.name,
    discord_id: it.user.id,
    region: REGIONS.includes(region) ? region : "NA",
  });

  const suffix = taken && taken.name !== m.name
    ? `\nAntes estabas como \`${taken.name}\`.`
    : "";

  return it.reply({
    content:
      `Verificado: **${m.name}** (${REGIONS.includes(region) ? region : "NA"}).` +
      ` Ya puedes pulsar **Unirse** en el panel.${suffix}`,
    ephemeral: true,
  });
}

// ----------------------------------------------------------------- botones
async function handleButton(it) {
  const id = it.customId;

  if (id === "q:verify") return it.showModal(verifyModal());

  if (id === "q:join") return handleJoin(it);
  if (id === "q:leave") return handleLeave(it);
  if (id === "q:open") return handleOpenButton(it);
  if (id === "q:ticket") return handleTicket(it);

  return it.reply({ content: "Boton desconocido.", ephemeral: true });
}

async function handleJoin(it) {
  const mode = getActiveMode();
  const g = modeByKey(mode);

  if (!isQueueOpen(mode)) {
    return it.reply({ content: `La whitelist de **${g.name}** esta cerrada.`, ephemeral: true });
  }

  // Sin verificar no se puede unir a la whitelist.
  const player = getPlayerByDiscord(it.user.id);
  if (!player) {
    return it.reply({
      content:
        "Primero tienes que **verificar tu cuenta** con `Verify Account` (o `/verify`). " +
        "No se puede unir a la whitelist sin verificar.",
      ephemeral: true,
    });
  }

  const res = addToQueue({
    discord_id: it.user.id,
    ign: player.name,
    tag: it.user.username,
    gamemode: mode,
    region: player.region,
  });

  if (res.already) {
    return it.reply({
      content: `Ya estabas en la whitelist de **${g.name}** (#${res.position}).`,
      ephemeral: true,
    });
  }

  // Sincroniza el tag por si cambio desde la verificacion.
  await refreshPanel(it.client);
  return respondAs(it, {
    embeds: [
      new EmbedBuilder()
        .setTitle("En cola")
        .setDescription(
          `Te uniste a la whitelist de **${g.icon} ${g.name}** en la posicion **#${res.position}**.`
        )
        .setColor(0x22c55e)
        .setFooter({ text: "Espera a que un tester abra tu ticket." }),
    ],
    components: panelPayload(it.user.id).components,
  });
}

async function handleLeave(it) {
  const mode = getActiveMode();
  const n = removeFromQueue(it.user.id, mode);
  const nAll = n === 0 ? removeFromQueue(it.user.id) : 0;
  await refreshPanel(it.client);

  const total = n + nAll;
  return respondAs(it, {
    embeds: [
      new EmbedBuilder()
        .setTitle("Saliste de la whitelist")
        .setDescription(
          total > 0
            ? `Te sacaste de la whitelist de **${modeName(mode)}**.`
            : "No estabas en la whitelist."
        )
        .setColor(0x9aa4b2),
    ],
    components: panelPayload(it.user.id).components,
  });
}

async function handleOpenButton(it) {
  if (!isTester(it.member)) {
    return it.reply({ content: "Solo los testers pueden abrir la whitelist.", ephemeral: true });
  }
  return showModePicker(it);
}

function modePickerComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("modeSelect")
        .setPlaceholder("Elige la modalidad de la whitelist")
        .addOptions(
          GAMEMODES.map((g) => ({
            label: g.name,
            value: g.key,
            emoji: g.icon,
            description: "Whitelist abierta",
          }))
        )
    ),
  ];
}

async function showModePicker(it) {
  const states = getOpenStates();
  const lines = GAMEMODES.map(
    (g) => `${states[g.key] ? "🟢" : "🔴"} **${g.name}**${g.key === getActiveMode() ? " ← activa" : ""}`
  ).join("\n");

  return it.reply({
    content: `**Whitelist — modalidades**\n${lines}`,
    components: modePickerComponents(),
    ephemeral: true,
  });
}

export function ticketEmbed({ testerId, mode }) {
  return new EmbedBuilder()
    .setTitle("GalaxyTiers")
    .setDescription(
      [
        `Tu tester asignado es ${testerId ? `<@${testerId}>` : "un miembro del staff"}.`,
        `La modalidad es **${modeName(mode)}**.`,
        "",
        "Porfavor no seas toxico, y ten paciencia, duran de 1m-2m en contestar.",
      ].join("\n")
    )
    .setColor(0x7c3aed)
    .setTimestamp();
}

/** Saca al #1 de la whitelist y le abre un ticket privado. */
async function popAndOpenTicket(it, mode, { restrict = true } = {}) {
  const g = modeByKey(mode);
  if (!g) return { error: "Modalidad desconocida." };

  const row = popQueue(mode);
  if (!row) return { error: `No hay nadie en la whitelist de **${g.name}**.`, empty: true };

  const cleanIgn = String(row.ign).toLowerCase().replace(/[^a-z0-9]/g, "");
  const channelName = `test-${g.key}-${cleanIgn}`.slice(0, 90);

  const overwrites = restrict
    ? [
        {
          id: it.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        ...[row.discord_id, it.user.id]
          .filter(Boolean)
          .map((id) => ({
            id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          })),
      ]
    : undefined;

  let ticket = null;
  try {
    ticket = await it.guild.channels.create({
      name: channelName,
      type: 0, // GuildText
      parent: RESULTS_CHANNEL_ID || undefined,
      topic: `Test de ${row.ign} — ${g.name}`,
      reason: "GalaxyTierlist ticket",
      ...(overwrites ? { permissionOverwrites: overwrites } : {}),
    });
  } catch (e) {
    console.error("[bot] no se pudo crear el ticket:", e.message);
  }

  if (ticket) {
    const who = row.discord_id ? `<@${row.discord_id}>` : `\`${row.ign}\``;
    await ticket
      .send({
        content: `${who} — tu tester es ${it.user.tag}. Usa **/close** al terminar el test.`,
        embeds: [ticketEmbed({ testerId: it.user.id, mode })],
      })
      .catch((e) => console.error("[bot] no se pudo enviar el embed:", e.message));
  }

  await refreshPanel(it.client);
  return { row, ticket, mode: g };
}

async function handleTicket(it) {
  if (!isTester(it.member)) {
    return it.reply({ content: "Solo los testers pueden abrir tickets.", ephemeral: true });
  }

  const mode = getActiveMode();
  const res = await popAndOpenTicket(it, mode);
  if (res.error) return it.reply({ content: res.error, ephemeral: true });

  return respondAs(it, {
    embeds: [
      new EmbedBuilder()
        .setTitle("Ticket abierto")
        .setDescription(
          `**${res.row.ign}** [${res.mode.name}/${res.row.region}] -> ` +
            (res.ticket ? `<#${res.ticket.id}>` : "no se pudo crear el canal")
        )
        .setColor(0x22c55e),
    ],
    components: panelPayload(it.user.id).components,
  });
}

// ---------------------------------------------------------------- select
async function handleSelect(it) {
  if (it.customId !== "modeSelect") return;
  return applyModeSelect(it, it.values[0]);
}

async function applyModeSelect(it, modeKey) {
  if (!isTester(it.member)) {
    return it.reply({ content: "Solo los testers pueden abrir la whitelist.", ephemeral: true });
  }
  const g = modeByKey(modeKey);
  if (!g) return it.reply({ content: "Modalidad desconocida.", ephemeral: true });

  setActiveMode(modeKey);
  setQueueOpen(modeKey, true);
  await refreshPanel(it.client);

  return it.update({
    content:
      `Whitelist abierta para **${g.icon} ${g.name}**.\n` +
      `En cola: **${queueCount(modeKey)}**. El panel fue actualizado.`,
    embeds: [],
    components: [],
  });
}

/** Selector de region del flujo de verificacion (compat). */

// ----------------------------------------------------------------- slash
async function handleSlash(it) {
  const { commandName } = it;

  // --- /open : abre la whitelist y deja elegir modalidad ---
  if (commandName === "open") {
    if (!isTester(it.member)) {
      return it.reply({ content: "Solo los testers pueden abrir la whitelist.", ephemeral: true });
    }
    const chosen = it.options.getString("modalidad");
    if (chosen) return applyModeSelect(it, chosen);
    return showModePicker(it);
  }

  // --- /setup : publica el panel ---
  if (commandName === "setup") {
    const payload = panelPayload(it.user.id);
    const msg = await it.channel.send({
      content: "Panel de whitelist publicado. Fijalo con la pin 📌",
      ...payload,
    });
    setPanel(it.channel.id, msg.id);
    testerIds.add(it.user.id);
    await refreshPanel(it.client);
    return it.reply({ content: `Panel publicado. [saltar](${msg.url})`, ephemeral: true });
  }

  // --- /queue open|close|status ---
  if (commandName === "queue") {
    const accion = it.options.getString("accion");
    const mode = it.options.getString("modalidad") || getActiveMode();

    if (accion === "status") {
      const states = getOpenStates();
      const lines = GAMEMODES
        .map((g) => `${states[g.key] ? "🟢" : "🔴"} ${g.name}: ${queueCount(g.key)} en cola`)
        .join("\n");
      return it.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Estado de la whitelist")
            .setDescription(lines)
            .setColor(0x7c3aed)
            .setFooter({ text: `Testers activos: ${activeTesters.size}` }),
        ],
      });
    }

    if (accion === "open" && !isTester(it.member)) {
      return it.reply({ content: "Solo los testers pueden abrir la cola.", ephemeral: true });
    }
    if (accion === "close" && !isTester(it.member)) {
      return it.reply({ content: "Solo los testers pueden cerrar la cola.", ephemeral: true });
    }

    setQueueOpen(mode, accion === "open");
    if (accion === "open") setActiveMode(mode);
    await refreshPanel(it.client);

    const n = queueCount(mode);
    return it.reply(
      accion === "open"
        ? `Whitelist de **${modeName(mode)}** abierta. En cola: **${n}**.`
        : `Whitelist de **${modeName(mode)}** cerrada.`
    );
  }

  if (commandName === "verify") return it.showModal(verifyModal());

  if (commandName === "start") {
    activeTesters.add(it.user.id);
    testerIds.add(it.user.id);
    return it.reply(`Ahora eres tester activo.`);
  }

  if (commandName === "stop") {
    activeTesters.delete(it.user.id);
    return it.reply("Dejaste de ser tester activo.");
  }

  if (commandName === "leave") {
    const n = removeFromQueue(it.user.id);
    await refreshPanel(it.client);
    return it.reply({
      content: n > 0 ? "Saliste de la whitelist." : "No estabas en la whitelist.",
      ephemeral: true,
    });
  }

  if (commandName === "next") {
    if (!isTester(it.member)) {
      return it.reply({ content: "Solo los testers.", ephemeral: true });
    }
    return openTicketFor(it, it.options.getString("gamemode") || getActiveMode());
  }

  if (commandName === "close" || commandName === "result") {
    let ign, mode, tier, notes = "";
    const tester = it.user.id;

    if (commandName === "close") {
      const user = it.options.getUser("jugador");
      mode = it.options.getString("gamemode");
      tier = it.options.getString("tier");
      notes = it.options.getString("notas") ?? "";
      const linked = user ? db.prepare("SELECT name FROM players WHERE discord_id=?").get(user.id) : null;
      ign = linked?.name ?? user?.username ?? "unknown";
    } else {
      ign = it.options.getString("ign");
      mode = it.options.getString("gamemode");
      tier = it.options.getString("tier");
    }

    const previous = getCurrentTier(ign, mode);
    logTest({ tester_discord: tester, tested_name: ign, gamemode: mode, tier, notes });
    removeFromQueue(
      db.prepare("SELECT discord_id FROM players WHERE name=?").get(ign)?.discord_id ?? null,
      mode
    );
    await refreshPanel(it.client);

    const embed = new EmbedBuilder()
      .setTitle("Test Completed")
      .setColor(0x9b7bff)
      .setThumbnail(`https://minotar.net/avatar/${encodeURIComponent(ign)}/64`)
      .addFields(
        { name: "Player", value: `\`${ign}\``, inline: true },
        { name: "Gamemode", value: `\`${mode.toUpperCase()}\``, inline: true },
        { name: "Tier", value: `\`${tier}\``, inline: true },
        { name: "Previous", value: `\`${previous ?? "-"}\``, inline: true },
        { name: "Tester", value: `<@${tester}>`, inline: true },
        ...(notes ? [{ name: "Notes", value: `\`${notes.replace(/`/g, "'")}\`` }] : [])
      )
      .setTimestamp();

    if (RESULTS_CHANNEL_ID) {
      const rc = await it.guild.channels.fetch(RESULTS_CHANNEL_ID).catch(() => null);
      if (rc?.isTextBased()) await rc.send({ embeds: [embed] }).catch(() => {});
    }

    return it.reply({
      embeds: [embed],
      content: `Visible en la web: https://galaxytierlist.onrender.com/?player=${encodeURIComponent(ign)}`,
    });
  }

  if (commandName === "skip") {
    if (!isTester(it.member)) {
      return it.reply({ content: "Solo los testers.", ephemeral: true });
    }
    const user = it.options.getUser("jugador");
    const mode = it.options.getString("modalidad");
    const n = removeFromQueue(user.id, mode) || removeFromQueue(user.id);
    await refreshPanel(it.client);
    return it.reply(n > 0 ? `${user} sacado de la whitelist.` : `${user} no estaba en la whitelist.`);
  }

  if (commandName === "profile") {
    const ign = it.options.getString("ign");
    const p = getProfile(ign);
    if (!p) return it.reply({ content: `Sin datos para **${ign}**.`, ephemeral: true });
    const desc = GAMEMODES.map((gm) => `**${gm.name}:** ${p.current[gm.key] ?? "—"}`).join("\n");
    return it.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${ign} (${p.player.region})`)
          .setDescription(desc)
          .setColor(0x7c3aed),
      ],
    });
  }

  if (commandName === "tierwipe") {
    const ign = it.options.getString("ign");
    const removed = db.prepare("DELETE FROM tests WHERE tested_name=?").run(ign).changes;
    db.prepare("DELETE FROM players WHERE name=?").run(ign);
    return it.reply(`Tiers de **${ign}** borrados (${removed} tests).`);
  }
}

/** Logica compartida de /next y del boton Ticket. */
async function openTicketFor(it, mode) {
  const res = await popAndOpenTicket(it, mode);
  if (res.error) return it.reply({ content: res.error, ephemeral: true });
  return it.reply(
    `Siguiente: **${res.row.ign}** [${res.mode.name}/${res.row.region}] ` +
      (res.ticket ? `-> <#${res.ticket.id}>` : "(no se pudo crear el canal)")
  );
}