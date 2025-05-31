import http from "node:http";
import esbuild from "esbuild";
import { clean } from "esbuild-plugin-clean";
import { polyfillNode } from "esbuild-plugin-polyfill-node";
import { sassPlugin, postcssModules } from "esbuild-sass-plugin";
import fs from "fs";

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}

// Development build configuration
const context = await esbuild.context({
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
    "process.env.REACT_APP_API_URL": '"http://localhost:4000"',
  },
  plugins: [
    clean({ patterns: ["./dist/*.js"] }),
    polyfillNode(),
    sassPlugin({
      filter: /\.module\.scss$/,
      transform: postcssModules({}),
    }),
    sassPlugin({
      filter: /\.scss$/,
    }),
  ],
  logLevel: "info",
});

const server = await context.serve({
  servedir: "./dist",
  host: "localhost",
  port: 8888,
  fallback: "./dist/index.html",
});

console.log("⚡ Development build complete!", server);

const { host, port } = server;

console.log(`🚀 Development server running on http://localhost:${port}`);

// Copy index.html to dist
fs.copyFileSync("./src/index.html", "./dist/index.html");
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
    location.reload();
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

// Start the server

http
  .createServer((req, res) => {
    const backendProxy = {
      hostname: host,
      port: 4000,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    if (req.url.startsWith("/output/")) {
      const proxyReq = http.request(backendProxy, proxyRes => {
        console.log(`Proxying request to backend: ${req.url}`);
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });
      return req.pipe(proxyReq, { end: true });
    }

    const frontendProxy = {
      hostname: host,
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    // Forward each incoming request to esbuild
    const proxyReq = http.request(frontendProxy, proxyRes => {
      // If esbuild returns "not found", send a custom 404 page
      if (proxyRes.statusCode === 404) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>A custom 404 page</h1>");
        return;
      }

      // Otherwise, forward the response from esbuild to the client
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    // Forward the body of the request to esbuild
    req.pipe(proxyReq, { end: true });
  })
  .listen(3000);
