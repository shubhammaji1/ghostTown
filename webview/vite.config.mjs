import { defineConfig } from 'vite';
export default defineConfig({
  root: 'webview',
  base: './',
  build: {
    outDir: '../apps/vscode-extension/media/studio',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { output: { entryFileNames: 'studio.js', assetFileNames: 'studio.[ext]' } },
  },
});
