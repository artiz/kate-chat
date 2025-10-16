import esbuild from "esbuild";
import { clean } from "esbuild-plugin-clean";
import { sassPlugin, postcssModules } from "esbuild-sass-plugin";
import fs from "fs";

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}

// Production build configuration
await esbuild.build({
  entryPoints: ["./src/index.tsx"],
  outdir: "./dist",
  bundle: true,
  sourcemap: false,
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
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
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

// Copy index.html to dist
fs.copyFileSync("./src/index.html", "./dist/index.html");

console.log("✅ Production build complete!");
