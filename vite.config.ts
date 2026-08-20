import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { build } from 'vite'

// Custom plugin that builds content scripts as IIFE (no ES imports) after the main build
function buildContentScripts() {
  return {
    name: 'build-content-scripts',
    closeBundle: async () => {
      const contentEntries = {
        content_chatgpt: resolve(import.meta.dirname, 'src/content/chatgpt.ts'),
        content_gemini: resolve(import.meta.dirname, 'src/content/gemini.ts'),
        content_claude: resolve(import.meta.dirname, 'src/content/claude.ts'),
        background: resolve(import.meta.dirname, 'src/background/service-worker.ts'),
      }

      for (const [name, entry] of Object.entries(contentEntries)) {
        await build({
          configFile: false,
          build: {
            emptyOutDir: false,
            rollupOptions: {
              input: { [name]: entry },
              output: {
                format: 'iife',
                dir: 'dist',
                entryFileNames: 'assets/[name].js',
                // No code splitting — everything inlined
                inlineDynamicImports: true,
              }
            },
            // Don't copy public assets again
            copyPublicDir: false,
          },
        })
      }
    }
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    buildContentScripts(),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
