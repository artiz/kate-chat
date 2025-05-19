const esbuild = require("esbuild");
const { clean } = require("esbuild-plugin-clean");
const { polyfillNode } = require("esbuild-plugin-polyfill-node");
const fs = require("fs");

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}

// Copy index.html to dist
fs.copyFileSync("./src/index.html", "./dist/index.html");

// Production build configuration
esbuild
  .build({
    entryPoints: ["./src/index.tsx"],
    outdir: "./dist",
    bundle: true,
    minify: true,
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
    plugins: [
      clean({ patterns: ["./dist/*"] }),
      polyfillNode(),
    ],
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.REACT_APP_API_URL": '"http://localhost:4000/graphql"',
    },
    metafile: true,
  })
  .then((result) => {
    console.log("⚡ Build complete!");
    
    // Output bundle size analysis
    const outputSize = Object.entries(result.metafile.outputs).reduce(
      (total, [name, data]) => {
        return total + data.bytes;
      },
      0
    );
    
    console.log(`📦 Total bundle size: ${(outputSize / 1024 / 1024).toFixed(2)}MB`);
  })
  .catch((e) => {
    console.error("❌ Build failed:", e);
    process.exit(1);
  });
