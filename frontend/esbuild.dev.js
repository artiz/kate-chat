const esbuild = require("esbuild");
const { clean } = require("esbuild-plugin-clean");
const { polyfillNode } = require("esbuild-plugin-polyfill-node");
const path = require("path");
const fs = require("fs");

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}

// Development build configuration
esbuild
  .context({
    entryPoints: ["./src/index.tsx"],
    outdir: "./dist",
    bundle: true,
    sourcemap: true,
    minify: false,
    format: "iife",
    splitting: false,
    loader: {
      ".js": "jsx",
      ".svg": "dataurl",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".gif": "dataurl",
      ".woff": "file",
      ".woff2": "file",
      ".ttf": "file",
      ".eot": "file",
    },
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.REACT_APP_API_URL": '"http://localhost:4000/graphql"',
    },
    plugins: [clean({ patterns: ["./dist/*.js"] }), polyfillNode()],
    logLevel: "info",
  })
  .then(context => {
    // Set up dev server with live reload/HMR
    context
      .serve({
        servedir: "./dist",
        port: 3000,
        host: "localhost",
        fallback: "./dist/index.html",
      })
      .then(server => {
        console.log(`🚀 Development server running on http://localhost:${server.port}`);

        // Copy index.html to dist
        fs.copyFileSync("./src/index.html", "./dist/index.html");

        // Copy CSS to dist
        if (fs.existsSync("./src/index.css")) {
          fs.copyFileSync("./src/index.css", "./dist/index.css");
        }

        // Add HMR script to index.html
        const indexContent = fs.readFileSync("./dist/index.html", "utf-8");
        const updatedContent = indexContent.replace(
          "</body>",
          `<script>
        // HMR with esbuild
        const es = new EventSource('/esbuild');
        es.addEventListener('change', (e) => {
          const { added, removed, updated } = JSON.parse(e.data);
          
          // Detect if CSS was updated, if so just refresh the stylesheet
          if (updated.some(path => path.endsWith('.css'))) {
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            links.forEach(link => {
              const url = new URL(link.href);
              link.href = url.pathname + '?' + Date.now();
            });
            console.log('🔄 CSS updated without page reload');
          } else {
            // For JS/component changes, reload the page
            console.log('🔄 Page reload triggered by file change');
            location.reload();
          }
        });
        
        es.onerror = () => {
          es.close();
          console.log('⚠️ EventSource disconnected, reconnecting in 3s...');
          setTimeout(() => location.reload(), 3000);
        };
      </script>
      </body>`
        );
        fs.writeFileSync("./dist/index.html", updatedContent);

        // Watch for file changes
        context.watch();
      });
  })
  .catch(e => {
    console.error("Error starting app:", e);
    process.exit(1);
  });
