import esbuild from "esbuild";
import { clean } from "esbuild-plugin-clean";
import { sassPlugin, postcssModules } from "esbuild-sass-plugin";
import fs from "fs";

// Create directory if it doesn't exist
if (!fs.existsSync("./dist")) {
  fs.mkdirSync("./dist");
}

// Build ESM and CJS versions
const buildConfig = {
  entryPoints: ["./src/index.ts"],
  bundle: true,
  sourcemap: true,
  minify: true,
  metafile: true,
  external: ["react", "react-dom", "react-router-dom", "react-redux", "@mantine/*", "@tabler/icons-react"],
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
    sassPlugin({
      filter: /\.module\.scss$/,
      transform: postcssModules({}),
    }),
    sassPlugin({
      filter: /\.scss$/,
    }),
  ],
};

Promise.all([
  // ESM build
  esbuild.build({
    ...buildConfig,
    outdir: "./dist/esm",
    format: "esm",
    plugins: [clean({ patterns: ["./dist/esm/*.*"] }), ...buildConfig.plugins],
  }),
  // CJS build
  esbuild.build({
    ...buildConfig,
    outdir: "./dist/cjs",
    format: "cjs",
    plugins: [clean({ patterns: ["./dist/cjs/*.*"] }), ...buildConfig.plugins],
  }),
])
  .then(results => {
    console.log("⚡ Build complete!");
    console.log("📦 ESM build created in ./dist/esm");
    console.log("📦 CJS build created in ./dist/cjs");

    // Calculate total size
    const totalSize = results.reduce((total, result) => {
      if (result.metafile) {
        return (
          total +
          Object.entries(result.metafile.outputs).reduce((sum, [, data]) => {
            return sum + data.bytes;
          }, 0)
        );
      }
      return total;
    }, 0);

    console.log(`📦 Total bundle size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  })
  .catch(e => {
    console.error("❌ Build failed:", e);
    process.exit(1);
  });
