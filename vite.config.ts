import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// base: './' ensures the static build works out-of-the-box on GitHub Pages,
// local file preview, or inside a Tauri/Electron wrapper without path issues.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          storage: ['dexie', 'dexie-react-hooks', 'jszip'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
