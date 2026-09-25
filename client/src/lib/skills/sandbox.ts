import { loadTypeScriptCompiler } from "@/components/chat/code-plugins/TypeScriptExecutorModal";

export type SkillRuntime = "python" | "typescript";

export interface SkillSource {
  runtime: SkillRuntime;
  /** PyPI requirements for Python, npm specifiers (name@version) for TypeScript */
  packages: string[];
  /** Helper modules from the skill's scripts/ folder */
  files: { path: string; content: string }[];
}

export interface SkillOutputFile {
  name: string;
  bytes: Uint8Array;
}

/** A file of the chat a program may read, by the path the prompt lists it under ("/files/<key>") */
export interface ChatFile {
  path: string;
  mime: string;
  bytes: Uint8Array;
}

export type SkillRunResult =
  | { ok: true; files: SkillOutputFile[]; logs: string }
  | { ok: false; error: string; logs: string };

export const PYODIDE_VERSION = "0.27.5";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const NPM_CDN = "https://cdn.jsdelivr.net/npm/";
export const RUN_TIMEOUT_MS = 180_000;
export const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const RESULT_MESSAGE = "katechat-skill-result";

/** Hosts programs may load photos from: Wikimedia Commons (its search API and image servers) and Unsplash */
export const IMAGE_HOSTS = [
  "https://commons.wikimedia.org",
  "https://upload.wikimedia.org",
  "https://thumb.wikimedia.org",
  "https://images.unsplash.com",
];

/**
 * The code comes from a model, and a model's input can come from anyone: a web page it searched, an
 * email an MCP tool read. So it runs in an iframe with sandbox="allow-scripts" and no
 * allow-same-origin, which gives it an opaque origin: no access to this app's storage (the JWT, MCP
 * tokens), its cookies or its DOM. The CSP lets it reach only the package CDNs and the photo hosts,
 * whose logs nobody but their operators reads, so it cannot send anything to a server of its own.
 * What comes back is only what it posts: file names and bytes.
 */
export const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net data: blob:",
  `connect-src https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org ${IMAGE_HOSTS.join(" ")} data:`,
  "worker-src blob:",
  "img-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
].join("; ");

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const toBase64 = (text: string) => bytesToBase64(new TextEncoder().encode(text));

/** JSON for embedding in an inline <script>: "</script>" inside a string would otherwise close the tag. */
const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** A module as a data: URL; the sourceURL gives it a readable name in stack traces instead of the URL. */
const dataModule = (code: string, name: string) =>
  `data:text/javascript;base64,${toBase64(`${code}\n//# sourceURL=${name}`)}`;

/** "pptxgenjs@3.12.0" → ["pptxgenjs", ".../npm/pptxgenjs@3.12.0/+esm"]; the name is what the code imports. */
export function npmImport(spec: string): [string, string] {
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  return [name, `${NPM_CDN}${spec}/+esm`];
}

// Posts the result to the parent once, transferring the file buffers rather than copying them. An
// error a library throws where the program cannot catch it (in a callback, a promise nobody awaits)
// fails the run at once instead of leaving it to the timeout.
const REPORT = `
  removeEventListener("error", window.__guard);
  const __logs = [];
  let __reported = false;
  const __report = (result) => {
    if (__reported) return;
    __reported = true;
    const files = result.files || [];
    parent.postMessage({ type: "${RESULT_MESSAGE}", ...result }, "*", files.map(f => f.bytes.buffer));
  };
  const __describe = (error) =>
    String((error && (error.stack || error.message)) || error || "The program failed")
      .replace(/data:text\\/javascript;base64,[A-Za-z0-9+/=]+/g, "<module>");
  const __fail = (error) => __report({ ok: false, error: __describe(error), logs: __logs.join("\\n") });
  addEventListener("unhandledrejection", event => __fail(event.reason));
  addEventListener("error", event => __fail(event.error || event.message));
`;

// `images` for TypeScript programs: photos from the chat, Wikimedia Commons or Unsplash, as data URLs
// that pptxgenjs and pdfmake take directly. Large or unusual images are scaled and re-encoded.
const IMAGES_API = `
  const __imageCache = new Map();
  const __blobToDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  // A photo iterates over itself, so "const [photo] = await images.load(...)", written by a model
  // that mixed load up with search, still gets the photo
  const __photo = photo => Object.defineProperty(photo, Symbol.iterator, {
    value: function* () { yield photo; },
  });
  const __prepareImage = async (blob, details) => {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    const scale = Math.min(1, 2000 / Math.max(width, height));
    if (scale < 1 || !["image/png", "image/jpeg"].includes(blob.type)) {
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      const lossless = ["image/png", "image/gif"].includes(blob.type);
      blob = await canvas.convertToBlob(lossless ? { type: "image/png" } : { type: "image/jpeg", quality: 0.88 });
    }
    bitmap.close();
    return __photo({ data: await __blobToDataUrl(blob), mime: blob.type, width, height, credit: "", ...details });
  };
  const __fetchImage = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error(url + " is not an image (" + blob.type + ")");
    return blob;
  };
  const __text = html => String(html || "").replace(/<[^>]*>/g, "").replace(/\\s+/g, " ").trim();
  const __commons = async params => {
    const query = new URLSearchParams({
      action: "query", format: "json", origin: "*", prop: "imageinfo",
      iiprop: "url|mime|extmetadata", iiextmetadatafilter: "Artist|LicenseShortName", iiurlwidth: "1600", ...params,
    });
    // Wikimedia asks scripts to identify themselves; browsers do not let them set User-Agent
    const response = await fetch("https://commons.wikimedia.org/w/api.php?" + query, {
      headers: { "Api-User-Agent": "KateChat skills (https://github.com/artiz/kate-chat)" },
    });
    if (!response.ok) throw new Error("Wikimedia Commons: HTTP " + response.status);
    const pages = Object.values((await response.json()).query?.pages || {});
    pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return pages.filter(page => page.imageinfo?.[0]).map(page => {
      const info = page.imageinfo[0], meta = info.extmetadata || {};
      const credit = [__text(meta.Artist?.value), __text(meta.LicenseShortName?.value)].filter(Boolean).join(", ");
      return {
        url: info.thumburl || info.url, mime: info.mime, title: page.title.replace(/^File:/, ""),
        credit: (credit ? credit + " · " : "") + "Wikimedia Commons", source: info.descriptionurl,
      };
    });
  };
  const __placeholder = async () => {
    const canvas = new OffscreenCanvas(1600, 1000);
    const context = canvas.getContext("2d");
    context.fillStyle = "#E4E7EB";
    context.fillRect(0, 0, 1600, 1000);
    context.fillStyle = "#616E7C";
    context.font = "48px sans-serif";
    context.textAlign = "center";
    context.fillText("Image unavailable", 800, 520);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return __photo({ data: await __blobToDataUrl(blob), mime: "image/png", width: 1600, height: 1000, credit: "", title: "", placeholder: true });
  };
  const __loadImage = async name => {
    const chat = __chatFiles.find(file => file.mime.startsWith("image/") && (file.path === name || file.path.endsWith("/" + name)));
    if (chat) {
      const bytes = Uint8Array.from(atob(chat.base64), c => c.charCodeAt(0));
      return __prepareImage(new Blob([bytes], { type: chat.mime }), { title: chat.path });
    }
    if (name.startsWith("/files/")) throw new Error(name + " is not an image of this chat");
    const file = name.match(/^(?:commons:|File:)(.+)$/i);
    if (file) {
      const [hit] = await __commons({ titles: "File:" + file[1].trim() });
      if (!hit) throw new Error("Wikimedia Commons has no file " + file[1]);
      return __prepareImage(await __fetchImage(hit.url), hit);
    }
    if (/^(https:|data:image\\/)/.test(name)) return __prepareImage(await __fetchImage(name), { source: name });
    throw new Error("expected a chat image path, a Wikimedia Commons file (commons:Name.jpg) or an https URL, got " + JSON.stringify(name));
  };
  window.images = {
    async load(src) {
      if (src && typeof src === "object" && typeof src.data === "string") return src;
      const name = String(src ?? "").trim();
      if (!__imageCache.has(name)) {
        __imageCache.set(name, __loadImage(name).catch(error => {
          __imageCache.delete(name);
          throw new Error("images.load: " + (error && error.message || error));
        }));
      }
      return __imageCache.get(name);
    },
    // a failed search returns no photos rather than failing the program: the helpers put a
    // placeholder where a photo is missing, so the file is still made
    async search(query, { count = 1 } = {}) {
      let hits = [];
      try {
        hits = await __commons({
          generator: "search", gsrnamespace: "6", gsrsearch: String(query) + " filetype:bitmap",
          gsrlimit: String(Math.min(20, Math.max(5, count * 3))),
        });
      } catch (error) {
        console.warn("images.search: " + (error && error.message || error));
      }
      const found = [];
      for (const hit of hits) {
        if (found.length >= count) break;
        if (!/^image\\/(jpeg|png|webp)$/.test(hit.mime)) continue;
        try {
          found.push(await __prepareImage(await __fetchImage(hit.url), hit));
          console.log("images.search(" + JSON.stringify(String(query)) + "): " + hit.title);
        } catch (error) {
          console.warn("images.search: skipped " + hit.title + ": " + (error && error.message || error));
        }
      }
      // always as many as asked for, so "const [photo] = ..." never ends up undefined
      if (found.length < count) {
        console.warn("images.search: found " + found.length + " of " + count + " photos for " + JSON.stringify(String(query)) + "; the rest are placeholders");
        while (found.length < count) found.push(await __placeholder());
      }
      return found;
    },
  };
`;

// `files.load(path)` for TypeScript programs: the bytes of a chat file the client handed over
const FILES_API = `
  window.files = {
    async load(path) {
      const name = String(path ?? "").trim();
      const file = __chatFiles.find(file => file.path === name || file.path.endsWith("/" + name));
      if (!file) throw new Error("files.load: " + JSON.stringify(name) + " is not a file of this chat (use a /files/... path from the list)");
      return Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
    },
  };
`;

const embedFiles = (files: ChatFile[]) =>
  files.map(file => ({ path: file.path, mime: file.mime, base64: bytesToBase64(file.bytes) }));

function typescriptDocument(source: SkillSource, js: string, chatFiles: ChatFile[]): string {
  const imports: Record<string, string> = Object.fromEntries(source.packages.map(npmImport));
  const helpers = source.files.filter(file => /\.m?js$/.test(file.path)).map(file => `skill/${file.path}`);
  for (const file of source.files) {
    if (/\.m?js$/.test(file.path)) imports[`skill/${file.path}`] = dataModule(file.content, `skill/${file.path}`);
  }
  // Models guess module names: "skill/images.js", "globals", "katechat". Rather than fail to
  // resolve, an import the program cannot have (not a listed package, one of its files, or a relative
  // path) gets a stand-in with the skill's helpers and the runtime's globals, and the log says so. A
  // name the stand-in lacks then fails with a clear "does not provide an export named" error.
  const packageNames = Object.keys(imports).filter(name => !name.startsWith("skill/"));
  // import/export statements (the compiler puts each on its own line) and import("...")
  const IMPORTS =
    /^\s*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm;
  const specifiers = new Set([...js.matchAll(IMPORTS)].map(m => m[1] || m[2] || m[3]));
  const missing = [...specifiers].filter(
    spec =>
      !imports[spec] &&
      !/^(\.|\/|[a-z][a-z0-9+.-]*:)/i.test(spec) &&
      !packageNames.some(name => spec.startsWith(`${name}/`))
  );
  for (const spec of missing) {
    const standIn = [
      ...helpers.map((helper, i) => `import * as helper${i} from ${JSON.stringify(helper)};`),
      ...helpers.map(helper => `export * from ${JSON.stringify(helper)};`),
      "export const images = globalThis.images;",
      "export const output = globalThis.output;",
      "export const files = globalThis.files;",
      `export default { ${helpers.map((_, i) => `...helper${i}, `).join("")}images, output, files };`,
    ];
    imports[spec] = dataModule(standIn.join("\n"), spec);
  }
  const runner = `
    ${REPORT}
    const __chatFiles = ${inlineJson(embedFiles(chatFiles))};
    ${IMAGES_API}
    ${FILES_API}
    for (const level of ["log", "info", "warn", "error"]) {
      const original = console[level];
      console[level] = (...args) => { __logs.push(args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")); original(...args); };
    }
    const __files = [];
    const __toBytes = async (data) => {
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
      if (typeof data === "string") return new TextEncoder().encode(data);
      throw new Error("output.save: data must be a Uint8Array, ArrayBuffer, Blob or string");
    };
    window.output = {
      async save(name, data) {
        if (!name || typeof name !== "string") throw new Error("output.save: a file name is required");
        __files.push({ name, bytes: await __toBytes(data) });
      },
    };
    try {
      // Models often use a helper they forgot to import; the helpers' exports are globals as well, so
      // that still works. The program's own imports and declarations take precedence.
      for (const helper of ${inlineJson(helpers)}) {
        for (const [name, value] of Object.entries(await import(helper))) {
          if (!(name in globalThis)) globalThis[name] = value;
        }
      }
      for (const spec of ${inlineJson(missing)}) {
        console.warn('"' + spec + '" is not a module the program can import; the skill helpers and the images, files and output globals were used for it');
      }
      await import(${inlineJson(dataModule(js, "program.js"))});
      if (!__files.length) throw new Error("The program finished without calling output.save(...)");
      __report({ ok: true, files: __files.map(f => ({ name: f.name, bytes: f.bytes.slice() })), logs: __logs.join("\\n") });
    } catch (error) {
      __fail(error);
    }
  `;
  return `<script type="importmap">${inlineJson({ imports })}</script>
<script type="module">${runner}</script>`;
}

function pythonDocument(source: SkillSource, code: string, chatFiles: ChatFile[]): string {
  // top-level helper modules: scripts/office_helpers.py → office_helpers
  const pythonModules = source.files
    .filter(file => /^[A-Za-z_]\w*\.py$/.test(file.path) && file.path !== "__init__.py")
    .map(file => file.path.replace(/\.py$/, ""));
  const runner = `
    ${REPORT}
    (async () => {
      const logs = __logs;
      try {
        if (typeof loadPyodide !== "function") {
          throw new Error("Python (Pyodide) could not be loaded from cdn.jsdelivr.net; check the connection and run again");
        }
        const pyodide = await loadPyodide({ indexURL: ${inlineJson(PYODIDE_URL)} });
        pyodide.setStdout({ batched: line => logs.push(line) });
        pyodide.setStderr({ batched: line => logs.push(line) });
        const code = ${inlineJson(code)};
        const packages = ${inlineJson(source.packages)};
        if (packages.length) {
          await pyodide.loadPackage("micropip");
          await pyodide.pyimport("micropip").install(packages);
        }
        await pyodide.loadPackagesFromImports(code);
        for (const file of ${inlineJson(source.files)}) {
          const target = "/skill/" + file.path;
          pyodide.FS.mkdirTree(target.slice(0, target.lastIndexOf("/")));
          pyodide.FS.writeFile(target, file.content);
        }
        // chat files at the path the prompt lists them under, so open("/files/...") just works
        for (const file of ${inlineJson(embedFiles(chatFiles))}) {
          pyodide.FS.mkdirTree(file.path.slice(0, file.path.lastIndexOf("/")));
          pyodide.FS.writeFile(file.path, Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)));
        }
        pyodide.FS.mkdirTree("/skill");
        pyodide.FS.mkdirTree("/output");
        pyodide.runPython("import sys\\nif '/skill' not in sys.path: sys.path.insert(0, '/skill')");
        // the skill's helper modules are imported first, their names available without an import
        // (as in TypeScript), and so that a helper can set up the libraries it builds on
        for (const module of ${inlineJson(pythonModules)}) {
          pyodide.runPython("from " + module + " import *");
        }
        await pyodide.runPythonAsync(code);
        const files = pyodide.FS.readdir("/output")
          .filter(name => name !== "." && name !== ".." && pyodide.FS.isFile(pyodide.FS.stat("/output/" + name).mode))
          .map(name => ({ name, bytes: pyodide.FS.readFile("/output/" + name) }));
        if (!files.length) throw new Error("The program finished without writing a file to /output");
        __report({ ok: true, files, logs: logs.join("\\n") });
      } catch (error) {
        __report({ ok: false, error: String((error && error.message) || error), logs: logs.join("\\n") });
      }
    })();
  `;
  return `<script src="${PYODIDE_URL}pyodide.js"></script>
<script>${runner}</script>`;
}

/** The whole sandboxed page for one run; the code is embedded, nothing is fetched from this app. */
export function buildSandboxDocument(source: SkillSource, code: string, chatFiles: ChatFile[] = []): string {
  const body =
    source.runtime === "python" ? pythonDocument(source, code, chatFiles) : typescriptDocument(source, code, chatFiles);
  // Reports an error in the runner itself (a script that does not even parse) instead of waiting
  // for the timeout; the runner's own reporting takes over once it runs
  const guard = `<script>window.__guard = event => parent.postMessage({ type: "${RESULT_MESSAGE}", ok: false, error: "Sandbox: " + event.message, logs: "" }, "*"); addEventListener("error", window.__guard);</script>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">
</head><body>${guard}${body}</body></html>`;
}

async function transpile(code: string): Promise<string> {
  const ts = await loadTypeScriptCompiler();
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

/**
 * Runs a skill block and resolves with the files it wrote, or with the error and output to show the
 * user and, if they choose, the model.
 */
export async function runSkillCode(
  source: SkillSource,
  code: string,
  timeoutMs = RUN_TIMEOUT_MS,
  chatFiles: ChatFile[] = []
): Promise<SkillRunResult> {
  let program = code;
  if (source.runtime === "typescript") {
    try {
      program = await transpile(code);
    } catch (error) {
      return { ok: false, error: `TypeScript: ${error instanceof Error ? error.message : String(error)}`, logs: "" };
    }
  }

  return new Promise(resolve => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";

    const finish = (result: SkillRunResult) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.data?.type !== RESULT_MESSAGE) return;
      const data = event.data as { ok: boolean; files?: SkillOutputFile[]; error?: string; logs?: string };
      const logs = String(data.logs || "");
      if (!data.ok) return finish({ ok: false, error: String(data.error || "The program failed"), logs });

      const files = (data.files || []).filter(f => f && typeof f.name === "string" && f.bytes instanceof Uint8Array);
      const size = files.reduce((total, f) => total + f.bytes.length, 0);
      if (size > MAX_OUTPUT_BYTES) {
        return finish({ ok: false, error: `The files are larger than ${MAX_OUTPUT_BYTES / 1024 / 1024} MB`, logs });
      }
      finish({ ok: true, files, logs });
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `The program did not finish within ${timeoutMs / 1000} seconds`, logs: "" }),
      timeoutMs
    );

    window.addEventListener("message", onMessage);
    iframe.srcdoc = buildSandboxDocument(source, program, chatFiles);
    document.body.appendChild(iframe);
  });
}
