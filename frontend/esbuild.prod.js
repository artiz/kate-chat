import esbuild from "esbuild";
import { config } from "dotenv";
import { clean } from "esbuild-plugin-clean";
import { polyfillNode } from "esbuild-plugin-polyfill-node";
import { sassPlugin, postcssModules } from "esbuild-sass-plugin";
import fs from "fs";

// Load environment variables
config();

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
      sassPlugin({
        filter: /\.module\.scss$/,
        transform: postcssModules({}),
      }),
      sassPlugin({
        filter: /\.scss$/,
      }),
      polyfillNode(),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
      "process.env.REACT_APP_API_URL": JSON.stringify(process.env.REACT_APP_API_URL),
      "process.env.REACT_APP_WS_URL": JSON.stringify(process.env.REACT_APP_WS_URL),
      "process.env.RECAPTCHA_SITE_KEY": JSON.stringify(process.env.RECAPTCHA_SITE_KEY),
    },
    metafile: true,
  })
  .then(result => {
    console.log("⚡ Build complete!");

    // Output bundle size analysis
    const outputSize = Object.entries(result.metafile.outputs).reduce((total, [name, data]) => {
      return total + data.bytes;
    }, 0);

    console.log(`📦 Total bundle size: ${(outputSize / 1024 / 1024).toFixed(2)}MB`);
  })
  .catch(e => {
    console.error("❌ Build failed:", e);
    process.exit(1);
  });
