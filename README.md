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

## 4. Uso — panel de Whitelist

**Modalidades:** Sword, NethOP, CPVP, DiaPot, Mace, Axe.

### Poner en marcha
1. `/setup` — publica el panel en el canal y fíjalo con 📌.
2. `/open` — muestra el selector de modalidad. Al elegir una, esa whitelist queda **abierta** y es la activa. (También: `/open modalidad:Sword` directo.)
3. `/start` — te marca como tester activo (verás los botones `Open` y `Ticket`).

### El panel
El embed muestra la **modalidad activa**, si está abierta o cerrada, cuántos hay en cola, y los **puestos 1 a 5** con el tag de los primeros que se unieron (en orden de llegada). Si hay más de 5, el pie avisa de cuántos sobran.

Botones:
| Boton | Quien | Que hace |
|---|---|---|
| **Unirse** | todos | Entra a la whitelist de la modalidad activa. **Exige cuenta verificada.** |
| **Salir** | todos | Sale de la whitelist. |
| **Open** | testers | Abre el selector de modalidad. |
| **Ticket** | testers | Saca al **#1** y le abre un ticket privado con el embed de=test. |
| **Verify Account** | todos | Modal de verificación (IGN + región). |

Los jugadores que no son testers solo ven `Unirse` y `Salir`: el panel se re-renderiza según quien pulse.

### El flujo
1. Jugador pulsa **Verify Account** → ingressa IGN + región. Se valida contra la API de Mojang (si el IGN no existe, se rechaza).
2. Pulsa **Unirse**. Sin verificar, el bot responde: *"Primero tienes que verificar tu cuenta… No se puede unir a la whitelist sin verificar."*
3. Un tester pulsa **Ticket** → se crea el canal `test-<modo>-<ign>` y se le envía este embed:

```
GalaxyTiers
Tu tester Asignado es <@tester>
La modalidad es Sword.

Porfavor no seas toxico, y ten paciencia, duran de 1m-2m en contestar.
```

4. Pelean, y el tester cierra con `/close jugador:@user gamemode:sword tier:HT3` → aparece al instante en la web.

### Comandos
| Comando | Descripción |
|---|---|
| `/open [modalidad]` | Abre la whitelist y elige modality. |
| `/setup` | Publica el panel (ManageGuild). |
| `/verify` | Verifica tu cuenta sin usar el botón. |
| `/queue open\|close\|status [modalidad]` | Control de cola. |
| `/start` / `/stop` | Tester activo / salir. |
| `/next [gamemode]` | Saca al siguiente y abre ticket. |
| `/close jugador gamemode tier [notas]` | Cierra test y asigna tier. |
| `/result ign gamemode tier` | Alias rápido de `/close`. |
| `/skip jugador [modalidad]` | Saca a alguien sin testear. |
| `/profile ign` | Ver perfil. |
| `/tierwipe ign` | Borra los tiers de un jugador (ManageGuild). |
| `/leave` | Salir de la whitelist. |

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
