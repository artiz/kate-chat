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

export type SkillRunResult =
  | { ok: true; files: SkillOutputFile[]; logs: string }
  | { ok: false; error: string; logs: string };

export const PYODIDE_VERSION = "0.27.5";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const NPM_CDN = "https://cdn.jsdelivr.net/npm/";
export const RUN_TIMEOUT_MS = 180_000;
export const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const RESULT_MESSAGE = "katechat-skill-result";

/**
 * The code comes from a model, and a model's input can come from anyone: a web page it searched, an
 * email an MCP tool read. So it runs in an iframe with sandbox="allow-scripts" and no
 * allow-same-origin, which gives it an opaque origin: no access to this app's storage (the JWT, MCP
 * tokens), its cookies or its DOM. The CSP lets it reach only the package CDNs, so it cannot send
 * anything elsewhere either. What comes back is only what it posts: file names and bytes.
 */
export const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net data: blob:",
  "connect-src https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org",
  "worker-src blob:",
  "img-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
].join("; ");

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** JSON for embedding in an inline <script>: "</script>" inside a string would otherwise close the tag. */
const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const dataModule = (code: string) => `data:text/javascript;base64,${toBase64(code)}`;

/** "pptxgenjs@3.12.0" → ["pptxgenjs", ".../npm/pptxgenjs@3.12.0/+esm"]; the name is what the code imports. */
export function npmImport(spec: string): [string, string] {
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  return [name, `${NPM_CDN}${spec}/+esm`];
}

// Posts the result to the parent, transferring the file buffers rather than copying them
const REPORT = `
  const __report = (result) => {
    const files = result.files || [];
    parent.postMessage({ type: "${RESULT_MESSAGE}", ...result }, "*", files.map(f => f.bytes.buffer));
  };
`;

function typescriptDocument(source: SkillSource, js: string): string {
  const imports: Record<string, string> = Object.fromEntries(source.packages.map(npmImport));
  for (const file of source.files) {
    if (/\.m?js$/.test(file.path)) imports[`skill/${file.path}`] = dataModule(file.content);
  }
  const runner = `
    ${REPORT}
    const __logs = [];
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
      await import(${inlineJson(dataModule(js))});
      if (!__files.length) throw new Error("The program finished without calling output.save(...)");
      __report({ ok: true, files: __files.map(f => ({ name: f.name, bytes: f.bytes.slice() })), logs: __logs.join("\\n") });
    } catch (error) {
      __report({ ok: false, error: String(error && error.stack || error), logs: __logs.join("\\n") });
    }
  `;
  return `<script type="importmap">${inlineJson({ imports })}</script>
<script type="module">${runner}</script>`;
}

function pythonDocument(source: SkillSource, code: string): string {
  const runner = `
    ${REPORT}
    (async () => {
      const logs = [];
      try {
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
        pyodide.FS.mkdirTree("/skill");
        pyodide.FS.mkdirTree("/output");
        pyodide.runPython("import sys\\nif '/skill' not in sys.path: sys.path.insert(0, '/skill')");
        await pyodide.runPythonAsync(code);
        const files = pyodide.FS.readdir("/output")
          .filter(name => name !== "." && name !== ".." && pyodide.FS.isFile(pyodide.FS.stat("/output/" + name).mode))
          .map(name => ({ name, bytes: pyodide.FS.readFile("/output/" + name) }));
        if (!files.length) throw new Error("The program finished without writing a file to /output");
        __report({ ok: true, files, logs: logs.join("\\n") });
      } catch (error) {
        __report({ ok: false, error: String(error && error.message || error), logs: logs.join("\\n") });
      }
    })();
  `;
  return `<script src="${PYODIDE_URL}pyodide.js"></script>
<script>${runner}</script>`;
}

/** The whole sandboxed page for one run; the code is embedded, nothing is fetched from this app. */
export function buildSandboxDocument(source: SkillSource, code: string): string {
  const body = source.runtime === "python" ? pythonDocument(source, code) : typescriptDocument(source, code);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">
</head><body>${body}</body></html>`;
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
  timeoutMs = RUN_TIMEOUT_MS
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
    iframe.srcdoc = buildSandboxDocument(source, program);
    document.body.appendChild(iframe);
  });
}
