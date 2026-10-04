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

// Cuantos puestos se muestran en el panel de la whitelist.
export const MAX_QUEUE_SHOWN = 5;

export const DEFAULT_MODE = GAMEMODES[0].key;

export function modeByKey(key) {
  return GAMEMODES.find((g) => g.key === key) ?? null;
}

export function modeName(key) {
  return modeByKey(key)?.name ?? String(key ?? "?").toUpperCase();
}