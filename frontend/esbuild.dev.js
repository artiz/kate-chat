const esbuild = require('esbuild');
const { clean } = require('esbuild-plugin-clean');
const postcss = require('esbuild-plugin-postcss');
const path = require('path');
const fs = require('fs');

// Create directory if it doesn't exist
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist');
}

// Copy index.html to dist
fs.copyFileSync('./src/index.html', './dist/index.html');

// Development build configuration
esbuild.context({
  entryPoints: ['./src/index.tsx'],
  outdir: './dist',
  bundle: true,
  sourcemap: true,
  minify: false,
  format: 'esm',
  splitting: true,
  loader: {
    '.js': 'jsx',
    '.svg': 'dataurl',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.gif': 'dataurl',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
  },
  plugins: [
    clean({ patterns: ['./dist/*'] }),
    postcss()
  ],
  define: {
    'process.env.NODE_ENV': '"development"',
  },
}).then(context => {
  context.serve({
    servedir: './dist',
    port: 3000,
  }).then(server => {
    console.log(`🚀 Development server running on http://localhost:${server.port}`);
  });

  context.watch();
}).catch(() => process.exit(1));
