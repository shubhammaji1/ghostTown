import { createServer } from 'vite';
const server = await createServer({ configFile: 'fixtures/demo-react-app/vite.config.mjs' });
await server.listen();
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
