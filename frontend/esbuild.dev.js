const esbuild = require('esbuild');
const { clean } = require('esbuild-plugin-clean');
const path = require('path');
const fs = require('fs');

// Create directory if it doesn't exist
if (!fs.existsSync('./dist')) {
  fs.mkdirSync('./dist');
}


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
    clean({ patterns: ['./dist/*.js'] }),
  ],
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  logLevel: 'info',
}).then(context => {
   
  
  // Set up dev server with live reload/HMR
  context.serve({
    servedir: './dist',
    port: 3000,
    host: 'localhost',
  }).then(server => {
    console.log(`🚀 Development server running on http://localhost:${server.port}`);
  
    // Copy index.html to dist
    fs.copyFileSync('./src/index.html', './dist/index.html');

    // Add auto-reload script to index.html
    const indexContent = fs.readFileSync('./dist/index.html', 'utf-8');
    const updatedContent = indexContent.replace(
      '</body>',
      `<script>
        // Simple live reload
        const es = new EventSource('/esbuild');
        es.addEventListener('change', () => {
          console.log('Page reload triggered by file change');
          location.reload();
        });
        es.onerror = () => {
          es.close();
          console.log('EventSource disconnected, reconnecting in 3s...');
          setTimeout(() => location.reload(), 3000);
        };
      </script>
      </body>`
    );
    fs.writeFileSync('./dist/index.html', updatedContent);
    
    // Watch for file changes
    context.watch();
  });
}).catch((e) => {
    console.error('Error starting app:', e);
    process.exit(1);
});
