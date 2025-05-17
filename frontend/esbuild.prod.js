const esbuild = require('esbuild');
const { clean } = require('esbuild-plugin-clean');
const fs = require('fs');

// Create directory if it doesn't exist
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist');
}

// Copy index.html to dist
fs.copyFileSync('./src/index.html', './dist/index.html');

// Production build configuration
esbuild.build({
  entryPoints: ['./src/index.tsx'],
  outdir: './dist',
  bundle: true,
  minify: true,
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
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).catch(() => process.exit(1));