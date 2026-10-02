import { createServer } from "./server.js";
import { createBot } from "./bot.js";

const PORT = process.env.PORT || 3000;
const app = createServer();
app.listen(PORT, () => console.log(`[web] GalaxyTierlist en puerto ${PORT}`));
createBot();
