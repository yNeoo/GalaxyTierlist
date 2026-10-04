// GalaxyTierlist - configuracion central (estilo MCTiers)

export const GAMEMODES = [
  { key: "sword", name: "Sword", icon: "🗡️", img: "/tier_icons/sword.svg" },
  { key: "nethop", name: "NethOP", icon: "🔥", img: "/tier_icons/nethop.svg" },
  { key: "cpvp", name: "CPVP", icon: "🏹", img: "/tier_icons/cpvp.svg" },
  { key: "diapot", name: "DiaPot", icon: "💎", img: "/tier_icons/diapot.svg" },
  { key: "mace", name: "Mace", icon: "🔨", img: "/tier_icons/mace.svg" },
  { key: "axe", name: "Axe", icon: "🪓", img: "/tier_icons/axe.svg" }
];

export const REGIONS = ["NA", "EU", "AS"];

// Orden oficial: de mejor a peor.
export const TIERS = [
  "HT1", "LT1", "HT2", "LT2", "HT3",
  "LT3", "HT4", "LT4", "HT5", "LT5"
];

// Puntos para el ranking Overall (1 test por modo, se toma el ultimo).
export const TIER_POINTS = {
  HT1: 100, LT1: 80,
  HT2: 60, LT2: 50,
  HT3: 40, LT3: 30,
  HT4: 20, LT4: 15,
  HT5: 10, LT5: 5
};

// Cuantos puestos se muestran en el panel de la cola.
export const MAX_QUEUE_SHOWN = 5;

export const DEFAULT_MODE = GAMEMODES[0].key;

// Colores por tier para los embeds.
export const TIER_COLORS = {
  HT1: 0xff4d4d, LT1: 0xff8080,
  HT2: 0xff9f43, LT2: 0xf7b96c,
  HT3: 0xffe066, LT3: 0xf3e6a6,
  HT4: 0xb6ff5c, LT4: 0xd3f5a6,
  HT5: 0x7fc3ff, LT5: 0xc2ddff,
};

export function modeByKey(key) {
  return GAMEMODES.find((g) => g.key === key) ?? null;
}

export function modeName(key) {
  return modeByKey(key)?.name ?? String(key ?? "?").toUpperCase();
}

/**
 * Render grande de la skin. mc-heads acepta nombre o uuid; el uuid es mas
 * estable porque sobrevive a un cambio de nombre del jugador.
 */
export function skinUrl({ uuid, name } = {}) {
  const id = uuid || name;
  if (!id) return null;
  return `https://mc-heads.net/body/${encodeURIComponent(id)}/300.png`;
}