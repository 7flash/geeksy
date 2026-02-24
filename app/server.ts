// geeksy/app/server.ts
import { measure } from 'measure-fn';
import { start } from 'melina';
import path from 'path';

const appDir = import.meta.dir;

await measure('Melina server start', () => start({
    port: parseInt(process.env.BUN_PORT || "3737"),
    appDir,
    defaultTitle: 'Geeksy',
}));