import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

function swDevPlugin(): Plugin {
  return {
    name: 'sw-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/sw.js', async (_req, res) => {
        const result = await server.transformRequest('/src/lib/sw.ts');
        res.setHeader('Content-Type', 'application/javascript');
        res.end(result?.code ?? '');
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [solid(), swDevPlugin()],
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    //host: '0.0.0.0',
  },
  build: {
    target: ['esnext', 'chrome133'],
    rollupOptions: {
      input: {
        main: './index.html',
        sw: './src/lib/sw.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
        manualChunks(id) {
          if (id.includes('src/lib/sw.ts')) return undefined;
          if (id.includes('codemirror')) return 'codemirror';
          if (id.includes('solid')) return 'solid';
        },
      },
    },
  },
});
