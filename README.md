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
3. En Render → Environment agrega: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `RESULTS_CHANNEL_ID` y `TICKET_CATEGORY_ID`.
4. Deploy. Te da URL tipo `https://galaxytierlist.onrender.com`.

## 4. Uso — cola y resultados

**Modalidades:** Sword, NethOP, CPVP, DiaPot, Mace, Axe.

### Poner en marcha
1. `/start` — te marca como tester activo (verás el botón `Ticket`).
2. `/openqueue` — muestra el selector de modalidad.
3. `/openqueue modalidad:Sword` — abre la cola de esa modalidad y publica el panel. Fíjalo con 📌.

`/openqueue` publica el panel si no existe, y si ya existe lo **actualiza** en vez de duplicarlo.

### El panel de la cola
Embed titulado **GalaxyTierlist** con los **puestos 1 a 5** en orden de llegada:

```
GalaxyTierlist
1. `Distraccion` · @user
2. `Notch` · @user
3. `Zenith` · @user
4. `Squids` · @user
5. `Betatest` · @user
🗡️ Sword · Abierta · 7 en cola · +2 mas
```

Si la cola está vacía, la descripción es solo `1 2 3 4 5`.

**El panel nunca se substituye.** Es un mensaje compartido: al pulsar `Unirse`, `Salir` o `Ticket` la confirmación llega **efímera** (solo la ve quien pulsó) y el panel se refresca aparte con las posiciones nuevas.

Botones (solo 3):
| Boton | Quien | Que hace |
|---|---|---|
| **Unirse** | todos | Entra a la cola. Si no está verificado, se abre el modal de verificación y al terminar entra solo. |
| **Salir** | todos | Sale de la cola. |
| **Ticket** | **solo testers** | Saca al **#1** y le abre un ticket privado. |

Los jugadores que no son testers solo ven `Unirse` y `Salir`: el panel se re-renderiza según quién pulse.

### El flujo
1. Jugador pulsa **Unirse**. Si no está verificado, el bot abre el modal (IGN + región) y valida el IGN contra la API de Mojang. Al confirmar, **entra directo a la cola** en el puesto que le toque.
2. Un tester pulsa **Ticket** → se crea el canal `test-<modo>-<ign>` dentro de la **categoría de test** (`TICKET_CATEGORY_ID`, por defecto `1555453253984981103`), privado para el jugador y el tester, y se le envía:

```
GalaxyTiers
Tu tester Asignado es <@tester>
La modalidad es Sword.

Porfavor no seas toxico, y ten paciencia, duran de 1m-2m en contestar.
```

3. Pelean y el tester cierra con `/result jugador:@user gamemode:sword tier:HT3`.

### `/result`
**Exige que el jugador esté verificado** — si no, el bot avisa y no registra nada. El nick que sale es el de la verificación, nunca el de Discord.

```
[embed 1]  GalaxyTierlist
           Distraccion
           Tier       Modalidad    Tester
           `HT1`      `Sword`      <@tester>

[embed 2]  [ skin render 300px de mc-heads.net ]
```

Van como dos embeds para que la skin quede **al lado** en escritorio (y apilada en móvil). El embed se envía también al canal `RESULTS_CHANNEL_ID`.

### Comandos
| Comando | Descripción |
|---|---|
| `/openqueue [modalidad]` | Abre la cola y publica/actualiza el panel. |
| `/queue status\|close [modalidad]` | Ver el estado de todas las colas o cerrar una. |
| `/verify` | Verifica tu cuenta sin pasar por el botón. |
| `/start` / `/stop` | Tester activo / salir. |
| `/result jugador gamemode tier [notas]` | **Registra el tier.** El jugador debe estar verificado. |
| `/skip jugador [modalidad]` | Saca a alguien sin testear. |
| `/profile ign` | Ver perfil. |
| `/tierwipe ign` | Borra los tiers de un jugador (ManageGuild). |
| `/leave` | Salir de la cola. |

### Web
Se refresca sola cada 15s. Perfil: `/?player=Nombre`. API: `/api/mode/list`, `/api/mode/:gamemode`, `/api/mode/overall`, `/api/queue?mode=:mode`, `/api/profile/:name`.

## 5. Tests
```bash
npm test        # valida el panel, botones, orden 1-5 y el embed de ticket
npm run test:api # levanta la API, la siembra y la prueba
```

## Nota Render Free
- Se duerme a los 15 min sin visitas (tarda ~50s en despertar). Normal en free.
- SQLite se borra si haces redeploy manual. Para producción real usa un Disk de Render ($$) o Postgres externo. Para empezar gratis sirve.
