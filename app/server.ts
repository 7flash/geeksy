// geeksy/app/server.ts
import { measure } from 'measure-fn';
import { start } from 'melina';
import path from 'path';

import { startHeartbeat } from './lib/heartbeat';
import { startTgBot } from './lib/tg-bot';

const appDir = import.meta.dir;

// Wire jsx-ai prompt tracing to our own API
const port = parseInt(process.env.BUN_PORT || "3737");
if (!process.env.JSX_AI_EXPLORER_URL) {
    process.env.JSX_AI_EXPLORER_URL = `http://localhost:${port}`;
}

await measure('Melina server start', () => start({
    port: parseInt(process.env.BUN_PORT || "3737"),
    appDir,
    defaultTitle: 'Geeksy',
}));

startHeartbeat();
startTgBot();