import {
  Client, GatewayIntentBits, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, EmbedBuilder, SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";
import {
  GAMEMODES, TIERS, REGIONS, MAX_QUEUE_SHOWN,
  modeByKey, modeName, skinUrl, TIER_COLORS
} from "./config.js";
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
// Categoria donde se abren los tickets de test.
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || "1555453253984981103";

const activeTesters = new Set(); // /start -> tester activo esta sesion
const testerIds = new Set();      // vista con el boton Ticket
const pendingJoin = new Set();    // pulso Unirse sin verificar -> modal y luego entra solo

// --------------------------------------------------------------- utilidades
function hasAdmin(it) {
  return it.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function isTester(it) {
  const id = it.user?.id;
  return activeTesters.has(id) || testerIds.has(id) || hasAdmin(it);
}

function markTester(it) {
  if (isTester(it)) testerIds.add(it.user.id);
}

async function mojangUUID(ign) {
  const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`);
  if (!r.ok) return null;
  return r.json();
}

// ------------------------------------------------------------ panel / cola
export function queuePayload(userId = null) {
  const mode = getActiveMode();
  const g = modeByKey(mode);
  const open = isQueueOpen(mode);
  const rows = getQueue(mode);
  const shown = rows.slice(0, MAX_QUEUE_SHOWN);

  const desc = shown.length
    ? shown
        .map((r, i) => {
          const who = r.discord_id ? `<@${r.discord_id}>` : r.tag || "—";
          return `**${i + 1}.** \`${r.ign}\` · ${who}`;
        })
        .join("\n")
    : [1, 2, 3, 4, 5].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("GalaxyTierlist")
    .setDescription(desc)
    .setColor(open ? 0x7c3aed : 0x4b5563)
    .setFooter({
      text: [
        `${g.icon} ${g.name}`,
        open ? "Abierta" : "Cerrada",
        `${rows.length} en cola`,
        rows.length > MAX_QUEUE_SHOWN ? `+${rows.length - MAX_QUEUE_SHOWN} mas` : null,
      ]
        .filter(Boolean)
        .join("  ·  "),
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("q:join").setLabel("Unirse").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("q:leave").setLabel("Salir").setStyle(ButtonStyle.Secondary)
  );

  // Ticket solo para testers.
  if (!userId || testerIds.has(userId) || activeTesters.has(userId)) {
    row.addComponents(
      new ButtonBuilder().setCustomId("q:ticket").setLabel("Ticket").setStyle(ButtonStyle.Danger)
    );
  }

  return { embeds: [embed], components: [row] };
}

async function refreshPanel(client) {
  const panel = getPanel();
  if (!panel) return null;
  const ch = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!ch?.isTextBased()) return null;
  const msg = await ch.messages.fetch(panel.messageId).catch(() => null);
  if (!msg?.editable) return null;
  await msg.edit(queuePayload(null)).catch(() => {});
  return msg;
}

/** Publica el panel o, si ya existe, lo actualiza. */
async function publishPanel(interaction) {
  const existente = await refreshPanel(interaction.client);
  if (existente) {
    return existente;
  }
  const msg = await interaction.channel.send(queuePayload(interaction.user.id));
  setPanel(interaction.channel.id, msg.id);
  return msg;
}

/**
 * El panel es un mensaje compartido: nunca se substituye con una confirmacion.
 * El feedback va efimero (solo lo ve quien pulso) y el panel se refresca aparte.
 */
async function respondEphemeral(interaction, extra = {}) {
  return interaction.reply({ ephemeral: true, ...extra }).catch(() => {});
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
      .setName("openqueue").setDescription("Abre la cola y publica el panel de la modalidad")
      .addStringOption((o) =>
        o.setName("modalidad").setDescription("Modalidad (si se omite, elige con el selector)")
          .addChoices(...modeChoices).setRequired(false)),

    new SlashCommandBuilder()
      .setName("queue").setDescription("Ver o cerrar la cola")
      .addStringOption((o) =>
        o.setName("accion").setDescription("status / close").setRequired(true)
          .addChoices({ name: "status", value: "status" }, { name: "close", value: "close" }))
      .addStringOption((o) =>
        o.setName("modalidad").setDescription("Modalidad (por defecto la activa)")
          .addChoices(...modeChoices).setRequired(false)),

    new SlashCommandBuilder().setName("verify").setDescription("Verifica tu cuenta de Minecraft"),
    new SlashCommandBuilder().setName("start").setDescription("Marcarte como tester activo"),
    new SlashCommandBuilder().setName("stop").setDescription("Salir de testers activos"),

    new SlashCommandBuilder()
      .setName("result").setDescription("Dar tier a un testeado (debe estar verificado)")
      .addUserOption((o) => o.setName("jugador").setDescription("testeado").setRequired(true))
      .addStringOption((o) => o.setName("gamemode").setDescription("modo").setRequired(true)
        .addChoices(...modeChoices))
      .addStringOption((o) => o.setName("tier").setDescription("tier").setRequired(true)
        .addChoices(...tierChoices))
      .addStringOption((o) => o.setName("notas").setDescription("notas").setRequired(false)),

    new SlashCommandBuilder()
      .setName("skip").setDescription("Sacar a alguien de la cola sin testear")
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

    new SlashCommandBuilder().setName("leave").setDescription("Salir de la cola"),
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
  const regionOk = REGIONS.includes(region) ? region : "NA";

  if (!/^[A-Za-z0-9_]{3,16}$/.test(ign)) {
    return it.reply({ content: "IGN invalido (3-16 letras, numeros o _).", ephemeral: true });
  }

  const m = await mojangUUID(ign).catch(() => null);
  if (!m) {
    return it.reply({
      content: `El IGN **\`${ign}\`** no existe en Mojang. Revisa como esta escrito.`,
      ephemeral: true,
    });
  }

  const anterior = getPlayerByDiscord(it.user.id);
  upsertPlayer({ uuid: m.id, name: m.name, discord_id: it.user.id, region: regionOk });

  // Si habia pulsado Unirse sin verificar, se une al terminar la verificacion.
  if (pendingJoin.delete(it.user.id)) {
    return enqueue(it, m.name, regionOk, true);
  }

  const cambio = anterior && anterior.name !== m.name ? `\nAntes eras \`${anterior.name}\`.` : "";
  return it.reply({
    content: `Verificado como **${m.name}** (${regionOk}). Ya puedes unirte a la cola.${cambio}`,
    ephemeral: true,
  });
}

// ----------------------------------------------------------------- botones
async function handleButton(it) {
  switch (it.customId) {
    case "q:join": return handleJoin(it);
    case "q:leave": return handleLeave(it);
    case "q:ticket": return handleTicket(it);
    default: return it.reply({ content: "Boton desconocido.", ephemeral: true });
  }
}

async function handleJoin(it) {
  const mode = getActiveMode();
  const g = modeByKey(mode);

  if (!isQueueOpen(mode)) {
    return it.reply({ content: `La cola de **${g.name}** esta cerrada.`, ephemeral: true });
  }

  const player = getPlayerByDiscord(it.user.id);
  if (!player) {
    // Sin verificar no se entra: se abre el modal y al terminar entra solo.
    pendingJoin.add(it.user.id);
    return it.showModal(verifyModal());
  }

  return enqueue(it, player.name, player.region);
}

/** Inscribe al jugador. `trasModal` cambia la respuesta a efimera. */
async function enqueue(it, ign, region, trasModal = false) {
  const mode = getActiveMode();
  const g = modeByKey(mode);

  if (!isQueueOpen(mode)) {
    return it.reply({
      content: `Verificado como **${ign}**, pero la cola de **${g.name}** esta cerrada.`,
      ephemeral: true,
    });
  }

  const res = addToQueue({
    discord_id: it.user.id,
    ign,
    tag: it.user.username,
    gamemode: mode,
    region: region ?? "NA",
  });

  await refreshPanel(it.client);

  const embed = new EmbedBuilder()
    .setTitle(res.already ? "Ya estabas" : "Unido a la cola")
    .setDescription(
      res.already
        ? `Ya estabas en la cola de **${g.icon} ${g.name}** en el puesto **${res.position}**.`
        : `Te uniste a la cola de **${g.icon} ${g.name}** en el puesto **${res.position}**.`
    )
    .setColor(res.already ? 0x9aa4b2 : 0x22c55e)
    .setFooter({ text: "Un tester abrira tu ticket." });

  if (trasModal) return it.reply({ embeds: [embed], ephemeral: true });
  return respondEphemeral(it, { embeds: [embed] });
}

async function handleLeave(it) {
  const mode = getActiveMode();
  const n = removeFromQueue(it.user.id, mode) || removeFromQueue(it.user.id);
  await refreshPanel(it.client);

  const embed = new EmbedBuilder()
    .setTitle(n > 0 ? "Saliste de la cola" : "No estabas en la cola")
    .setDescription(
      n > 0
        ? `Te sacaste de la cola de **${modeName(mode)}**.`
        : "No tenias puesto en ninguna cola."
    )
    .setColor(0x9aa4b2);

  return respondEphemeral(it, { embeds: [embed] });
}

// -------------------------------------------------------------- embed ticket
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

/** Saca al #1 de la cola y le abre un ticket privado. */
async function popAndOpenTicket(it, mode) {
  const g = modeByKey(mode);
  if (!g) return { error: "Modalidad desconocida." };

  const row = popQueue(mode);
  if (!row) return { error: `No hay nadie en la cola de **${g.name}**.`, empty: true };

  const clean = String(row.ign).toLowerCase().replace(/[^a-z0-9]/g, "");
  const overwrites = [
    {
      id: it.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    },
    ...[row.discord_id, it.user.id].filter(Boolean).map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  let ticket = null;
  try {
    ticket = await it.guild.channels.create({
      name: `test-${g.key}-${clean}`.slice(0, 90),
      type: 0,
      topic: `Test de ${row.ign} — ${g.name}`,
      reason: "GalaxyTierlist ticket",
      permissionOverwrites: overwrites,
      // Los tickets cuelgan de la categoria de test, no del canal de resultados.
      ...(TICKET_CATEGORY_ID ? { parent: TICKET_CATEGORY_ID } : {}),
    });
  } catch (e) {
    console.error("[bot] no se pudo crear el ticket:", e.message);
  }

  if (ticket) {
    const who = row.discord_id ? `<@${row.discord_id}>` : `\`${row.ign}\``;
    await ticket
      .send({
        content: `${who} — tu tester es ${it.user.tag}.`,
        embeds: [ticketEmbed({ testerId: it.user.id, mode })],
      })
      .catch((e) => console.error("[bot] no se pudo enviar el embed:", e.message));
  }

  await refreshPanel(it.client);
  return { row, ticket, mode: g };
}

async function handleTicket(it) {
  if (!isTester(it)) {
    return it.reply({ content: "Solo los testers pueden abrir tickets.", ephemeral: true });
  }

  const mode = getActiveMode();
  const res = await popAndOpenTicket(it, mode);
  if (res.error) return it.reply({ content: res.error, ephemeral: true });

  return respondEphemeral(it, {
    embeds: [
      new EmbedBuilder()
        .setTitle("Ticket abierto")
        .setDescription(
          `**${res.row.ign}** [${res.mode.name}/${res.row.region}] -> ` +
            (res.ticket ? `<#${res.ticket.id}>` : "no se pudo crear el canal")
        )
        .setColor(0x22c55e),
    ],
  });
}

// ------------------------------------------------------------------ select
function modePicker() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("modeSelect")
        .setPlaceholder("Elige la modalidad")
        .addOptions(
          GAMEMODES.map((g) => ({
            label: g.name,
            value: g.key,
            emoji: g.icon,
            description: getOpenStates()[g.key] ? "Abierta" : "Cerrada",
          }))
        )
    ),
  ];
}

async function handleSelect(it) {
  if (it.customId !== "modeSelect") return;
  if (!isTester(it)) {
    return it.reply({ content: "Solo los testers pueden abrir la cola.", ephemeral: true });
  }
  return openQueue(it, it.values[0]);
}

// --------------------------------------------------------------- comandos
async function openQueue(it, modeKey) {
  const g = modeByKey(modeKey);
  if (!g) return it.reply({ content: "Modalidad desconocida.", ephemeral: true });

  setActiveMode(modeKey);
  setQueueOpen(modeKey, true);
  const msg = await publishPanel(it);

  return it.update({
    content:
      `Cola abierta para **${g.icon} ${g.name}** — ${queueCount(modeKey)} en cola.\n` +
      (msg ? `Panel: ${msg.url}` : "No se pudo publicar el panel."),
    embeds: [],
    components: [],
  });
}

async function handleSlash(it) {
  const { commandName } = it;

  // ---- /openqueue [modalidad] ----
  if (commandName === "openqueue") {
    if (!isTester(it)) {
      return it.reply({ content: "Solo los testers pueden abrir la cola.", ephemeral: true });
    }
    const elegida = it.options.getString("modalidad");
    if (elegida) {
      setActiveMode(elegida);
      setQueueOpen(elegida, true);
      const g = modeByKey(elegida);
      const msg = await publishPanel(it);
      return it.reply({
        content:
          `Cola abierta para **${g.icon} ${g.name}**.\n` +
          (msg ? `Panel: ${msg.url}` : "No se pudo publicar el panel."),
        ephemeral: true,
      });
    }
    return it.reply({
      content: "**Elige la modalidad de la cola**",
      components: modePicker(),
      ephemeral: true,
    });
  }

  // ---- /queue status|close ----
  if (commandName === "queue") {
    const accion = it.options.getString("accion");
    const mode = it.options.getString("modalidad") || getActiveMode();

    if (accion === "status") {
      const states = getOpenStates();
      return it.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Estado de las colas")
            .setDescription(
              GAMEMODES
                .map((g) =>
                  `**${g.icon} ${g.name}** ${states[g.key] ? "🟢" : "🔴"} — ${queueCount(g.key)} en cola`
                )
                .join("\n")
            )
            .setColor(0x7c3aed)
            .setFooter({ text: `Testers activos: ${activeTesters.size}` }),
        ],
      });
    }

    if (!isTester(it)) {
      return it.reply({ content: "Solo los testers pueden cerrar la cola.", ephemeral: true });
    }
    setQueueOpen(mode, false);
    await refreshPanel(it.client);
    return it.reply(`Cola de **${modeName(mode)}** cerrada.`);
  }

  if (commandName === "verify") return it.showModal(verifyModal());

  if (commandName === "start") {
    activeTesters.add(it.user.id);
    testerIds.add(it.user.id);
    await refreshPanel(it.client).catch(() => {});
    return it.reply("Ahora eres tester activo.");
  }

  if (commandName === "stop") {
    activeTesters.delete(it.user.id);
    return it.reply("Dejaste de ser tester activo.");
  }

  if (commandName === "leave") {
    const n = removeFromQueue(it.user.id);
    await refreshPanel(it.client);
    return it.reply({
      content: n > 0 ? "Saliste de la cola." : "No estabas en la cola.",
      ephemeral: true,
    });
  }

  // ---- /result jugador gamemode tier [notas] ----
  if (commandName === "result") return handleResult(it);

  if (commandName === "skip") {
    if (!isTester(it)) return it.reply({ content: "Solo los testers.", ephemeral: true });
    const user = it.options.getUser("jugador");
    const mode = it.options.getString("modalidad");
    const n = removeFromQueue(user.id, mode) || removeFromQueue(user.id);
    await refreshPanel(it.client);
    return it.reply(n > 0 ? `${user} sacado de la cola.` : `${user} no estaba en la cola.`);
  }

  if (commandName === "profile") {
    const ign = it.options.getString("ign");
    const p = getProfile(ign);
    if (!p) return it.reply({ content: `Sin datos para **${ign}**.`, ephemeral: true });
    return it.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${ign} (${p.player.region})`)
          .setDescription(
            GAMEMODES.map((g) => `**${g.name}:** ${p.current[g.key] ?? "—"}`).join("\n")
          )
          .setColor(0x7c3aed),
      ],
    });
  }

  if (commandName === "tierwipe") {
    const ign = it.options.getString("ign");
    const n = db.prepare("DELETE FROM tests WHERE tested_name=?").run(ign).changes;
    db.prepare("DELETE FROM players WHERE name=?").run(ign);
    return it.reply(`Tiers de **${ign}** borrados (${n} tests).`);
  }
}

// ------------------------------------------------------------ embed resultado
export function resultEmbed({ name, tier, mode, tester, notes = "", uuid }) {
  const texto = new EmbedBuilder()
    .setTitle("GalaxyTierlist")
    .setDescription(`**${name}**`)
    .addFields(
      { name: "Tier", value: `\`${tier}\``, inline: true },
      { name: "Modalidad", value: `\`${modeName(mode)}\``, inline: true },
      { name: "Tester", value: `<@${tester}>`, inline: true }
    )
    .setColor(TIER_COLORS[tier] ?? 0x7c3aed)
    .setTimestamp();

  if (notes) texto.setFooter({ text: notes.replace(/`/g, "'").slice(0, 200) });

  // La skin va en un embed aparte para que Discord la muestre al lado.
  const skin = skinUrl({ uuid, name });
  return skin ? [texto, new EmbedBuilder().setImage(skin)] : [texto];
}

async function handleResult(it) {
  const user = it.options.getUser("jugador");
  const mode = it.options.getString("gamemode");
  const tier = it.options.getString("tier");
  const notes = it.options.getString("notas") ?? "";

  // El testeado debe estar verificado: el nick sale de su verificacion.
  const player = getPlayerByDiscord(user.id);
  if (!player) {
    return it.reply({
      content:
        `**${user.username}** no esta verificado, asi que no se puede registrar.\n` +
        `Que pulse Verify Account en el panel (o \`/verify\`) y luego reintenta.`,
      ephemeral: true,
    });
  }

  const ign = player.name;
  const anterior = getCurrentTier(ign, mode);

  logTest({ tester_discord: it.user.id, tested_name: ign, gamemode: mode, tier, notes });
  removeFromQueue(player.discord_id, mode);
  await refreshPanel(it.client);

  const embeds = resultEmbed({
    name: ign,
    tier,
    mode,
    tester: it.user.id,
    notes: anterior ? `${notes || "Test"}. Antes: ${anterior}` : notes,
    uuid: player.uuid,
  });

  if (RESULTS_CHANNEL_ID) {
    const rc = await it.guild.channels.fetch(RESULTS_CHANNEL_ID).catch(() => null);
    if (rc?.isTextBased()) await rc.send({ embeds }).catch(() => {});
  }

  return it.reply({
    embeds,
    content:
      `Web: https://galaxytierlist.onrender.com/?player=${encodeURIComponent(ign)}` +
      (anterior ? `  ·  antes: \`${anterior}\`` : ""),
  });
}