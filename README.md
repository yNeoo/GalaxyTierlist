# 🌌 GalaxyTierlist — estilo MCTiers (Web + Bot conectados)

Web estilo mctiers.com + bot Discord estilo MCTiers. Un solo servicio Node para Render Free.
Cuando haces `/close` en Discord, aparece al instante en la web (misma SQLite).

Modos: Vanilla, Pot, NethOP, Sword, DiaPot, Mace + Overall por puntos.

## 1. Probar en local
```bash
cd galaxytierlist
npm install
cp .env.example .env
# edita .env con tu DISCORD_TOKEN etc (opcional, la web funciona sin bot)
npm start
# abre http://localhost:3000
```

## 2. Crear el bot Discord
1. https://discord.com/developers/applications → New Application → Bot → Reset Token, copia token.
2. OAuth2 → URL Generator: marca `bot` + `applications.commands`, permisos: Manage Channels, Send Messages, Embed Links. Abre la URL e invita al servidor.
3. Copia: Application ID = DISCORD_CLIENT_ID, Server ID (clic derecho servidor → Copiar ID) = DISCORD_GUILD_ID.
4. En tu servidor crea canal #results, copia su ID = RESULTS_CHANNEL_ID (Ajustes → Avanzado → Modo desarrollador activado).

## 3. Subir a GitHub y Render
1. Sube solo la carpeta `galaxytierlist/` a un repo GitHub.
2. En render.com → New → Blueprint → conecta el repo (usa `render.yaml`).
3. En Environment agrega: DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, RESULTS_CHANNEL_ID.
4. Deploy. Te da URL tipo `https://galaxytierlist.onrender.com`.

## 4. Uso (igual que MCTiers)
- En Discord: `/setup` → publica panel Verify + Waitlist (fíjalo).
- Jugador: Verify Account (IGN + región NA/EU/AS, verifica que existe en Mojang) → Enter Waitlist (elige modo + región).
- Tester: `/start` → `/queue status` → `/next` (crea ticket `test-ign-modo`) → pelean en MC → `/close jugador:@user gamemode:pot tier:HT3`.
- Web se actualiza sola cada 15s. Perfil: `/?player=Nombre`.
- Otros: `/profile`, `/result`, `/skip`, `/tierwipe`, `/queue open|close`.

## Nota Render Free
- Se duerme a los 15 min sin visitas (tarda ~50s en despertar). Normal en free.
- SQLite se borra si haces redeploy manual. Para producción real usa un Disk de Render ($$) o Postgres externo. Para empezar gratis sirve.
