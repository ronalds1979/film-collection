import path from 'path';
import { fileURLToPath } from 'url';
import { app, prisma, start } from '../apps/api/server/index.js';

export { app, prisma, start };

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch((error) => {
    console.error('Failed to start the film collection API.', error);
    process.exit(1);
  });
}
