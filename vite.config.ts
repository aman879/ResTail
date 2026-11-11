import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  // Relative asset URLs: works for extension pages and for opening the build from disk.
  base: './',
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'index.html'),
        'preview-docx': resolve(import.meta.dirname, 'preview-docx.html'),
        'whats-new': resolve(import.meta.dirname, 'whats-new.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        // Popup and result pages share React and icons; keep them in one clearly named chunk.
        manualChunks: (id) =>
          /node_modules\/(\.pnpm\/)?(react|react-dom|scheduler|@phosphor-icons)/.test(id) ? 'vendor' : undefined,
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith('.css') ? 'assets/styles.css' : 'assets/[name].[ext]')
      }
    }
  }
})
