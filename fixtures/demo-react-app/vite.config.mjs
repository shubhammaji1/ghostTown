import { defineConfig } from 'vite';
export default defineConfig({
  root: 'fixtures/demo-react-app',
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: [
    {
      name: 'controlled-fixture-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/error') {
            res.statusCode = 500;
            res.end('Seeded fixture failure');
            return;
          }
          if (req.url === '/missing') {
            res.statusCode = 404;
            res.end('Seeded broken link');
            return;
          }
          next();
        });
      },
    },
  ],
});
