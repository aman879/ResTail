import { build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWatch = process.argv.includes('--watch');

const entries = {
  popup: resolve(__dirname, '../index.html'),
  content_chatgpt: resolve(__dirname, '../src/content/chatgpt.ts'),
  content_gemini: resolve(__dirname, '../src/content/gemini.ts'),
  content_claude: resolve(__dirname, '../src/content/claude.ts'),
  background: resolve(__dirname, '../src/background/service-worker.ts'),
};

async function start() {
  if (fs.existsSync(resolve(__dirname, '../dist'))) {
    fs.rmSync(resolve(__dirname, '../dist'), { recursive: true, force: true });
  }

  for (const [name, entry] of Object.entries(entries)) {
    await build({
      configFile: name === 'popup' ? resolve(__dirname, '../vite.config.ts') : false,
      plugins: name === 'popup' ? [] : undefined,
      build: {
        watch: isWatch ? { exclude: ['dist/**', 'node_modules/**'] } : null,
        emptyOutDir: false,
        rollupOptions: {
          input: { [name]: entry },
          output: name === 'popup' ? undefined : {
            format: name === 'background' ? 'es' : 'iife',
            entryFileNames: 'assets/[name].js',
            inlineDynamicImports: false,
          }
        }
      }
    });
  }
}

start().catch(console.error);
