const { buildSync } = require('esbuild');
const path = require('path');

buildSync({
  entryPoints: [path.join(__dirname, '..', 'server', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(__dirname, '..', 'server', 'bundle.cjs'),
  banner: {
    js: "var import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    'import.meta.url': 'import_meta_url',
  },
  logLevel: 'info',
});

console.log('[bundle-server] wrote server/bundle.cjs');
