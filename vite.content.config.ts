import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    emptyOutDir: false, // Prevent deleting popup builds
    rollupOptions: {
      input: {
        content_chatgpt: resolve(import.meta.dirname, 'src/content/chatgpt.ts'),
        content_gemini: resolve(import.meta.dirname, 'src/content/gemini.ts'),
        content_claude: resolve(import.meta.dirname, 'src/content/claude.ts'),
        background: resolve(import.meta.dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'iife',
        dir: 'dist',
        entryFileNames: 'assets/[name].js',
        inlineDynamicImports: false,
      }
    }
  }
})
