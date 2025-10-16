import http from "node:http";
import https from "node:https";
import esbuild from "esbuild";
import { clean } from "esbuild-plugin-clean";
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
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
  plugins: [
    clean({ patterns: ["./dist/*.js"] }),
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
  port: 8889,
  fallback: "./dist/index.html",
});

console.log("⚡ Development build complete!", server);

const { host, port } = server;

console.log(`🚀 Development server running on http://localhost:${port}`);

// Copy index.html to dist
fs.copyFileSync("./src/index.html", "./dist/index.html");

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
</body>`,
);
fs.writeFileSync("./dist/index.html", updatedContent);

// Watch for file changes
context.watch();

// Start proxy server for CORS handling
http
  .createServer((req, res) => {
    // CORS proxy for OpenAI API calls
    if (req.url.startsWith("/proxy/")) {
      const targetUrl = decodeURIComponent(req.url.substring(7));

      // Parse the target URL
      const url = new URL(targetUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: url.hostname,
        },
      };

      const protocol = url.protocol === "https:" ? https : http;
      const proxyReq = protocol.request(options, (proxyRes) => {
        console.log(`Proxying request to: ${targetUrl}`);

        // Add CORS headers
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on("error", (err) => {
        console.error("Proxy error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });

      req.pipe(proxyReq, { end: true });
      return;
    }

    // Handle OPTIONS requests for CORS
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // Forward to esbuild server
    const frontendProxy = {
      hostname: host,
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(frontendProxy, (proxyRes) => {
      if (proxyRes.statusCode === 404) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 - Not Found</h1>");
        return;
      }

      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });
  })
  .listen(3001);

console.log(`🔗 Proxy server running on http://localhost:3001`);
