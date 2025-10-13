import esbuild from "esbuild";
import { clean } from "esbuild-plugin-clean";
import { sassPlugin, postcssModules } from "esbuild-sass-plugin";
import fs from "fs";

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}
// Production build configuration
esbuild
  .build({
    entryPoints: ["./src/index.ts"],
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
    },
    metafile: true,
  })
  .then(result => {
    console.log("⚡ Build complete! Bundle created in ./dist");
    console.log(`📦 Config: APP_API_URL: ${process.env.APP_API_URL}`);
    const outputSize = Object.entries(result.metafile.outputs).reduce((total, [name, data]) => {
      return total + data.bytes;
    }, 0);
    console.log(`📦 Total bundle size: ${(outputSize / 1024 / 1024).toFixed(2)}MB`);
  })
  .catch(e => {
    console.error("❌ Build failed:", e);
    process.exit(1);
  });
