import esbuild from "esbuild";
import { config } from "dotenv";
import { clean } from "esbuild-plugin-clean";
import { sassPlugin, postcssModules } from "esbuild-sass-plugin";
import fs from "fs";
import path from "path";

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.production") });

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
    alias: {
      // Use source files from @katechat/ui for production build as well
      // This ensures consistency and allows for proper tree-shaking
      "@katechat/ui": "../packages/katechat-ui/src/index.ts",
    },
    plugins: [
      clean({ patterns: ["./dist/*.*"] }),
      sassPlugin({
        filter: /\.module\.scss$/,
        transform: postcssModules({}),
      }),
      sassPlugin({
        filter: /\.scss$/,
      }),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
      "process.env.APP_API_URL": JSON.stringify(process.env.APP_API_URL),
      "process.env.APP_WS_URL": JSON.stringify(process.env.APP_WS_URL),
      "process.env.RECAPTCHA_SITE_KEY": JSON.stringify(process.env.RECAPTCHA_SITE_KEY),
      "process.env.COMMIT_SHA": JSON.stringify(process.env.COMMIT_SHA || "master"),
    },
    metafile: true,
  })
  .then(result => {
    console.log("⚡ Build complete! Bundle created in ./dist");
    console.log(`📦 Config: APP_API_URL: ${process.env.APP_API_URL}`);

    // Copy index.html to dist
    fs.copyFileSync("./src/index.html", "./dist/index.html");
    fs.copyFileSync("./src/favicon.ico", "./dist/favicon.ico");

    // replace index.js url in index.html to index.js?v=${process.env.COMMIT_SHA || "latest"}`;
    const indexPath = path.resolve("./dist/index.html");
    let indexContent = fs.readFileSync(indexPath, "utf8");
    indexContent = indexContent.replace(/"\/index\.js"/gi, `"/index.js?v=${process.env.COMMIT_SHA || "latest"}"`);
    console.log(`🔗 Updated index.js URL in index.html to: index.js?v=${process.env.COMMIT_SHA || "latest"}`);
    fs.writeFileSync(indexPath, indexContent);

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
