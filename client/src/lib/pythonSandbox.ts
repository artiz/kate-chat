import { PYODIDE_VERSION, SANDBOX_CSP } from "@/lib/skills/sandbox";

const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const CHANNEL = "katechat-python";

export interface PythonRunHandlers {
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
  onImage: (dataUrl: string) => void;
  /** Called for input(); the run waits until the promise resolves */
  onInput: (prompt: string) => Promise<string>;
}

export interface PythonRunResult {
  result?: string;
  error?: string;
}

// Runs inside the sandbox: loads Pyodide once, then executes "run" requests one at a time. input() and
// plt.show() reach the page through postMessage; the interpreter state survives between runs.
const SANDBOX_SCRIPT = `
(async () => {
  const post = (message) => parent.postMessage({ channel: "${CHANNEL}", ...message }, "*");
  let pendingInput = null;
  let runId = null;
  try {
    const pyodide = await loadPyodide({ indexURL: "${PYODIDE_URL}" });
    self.__js_input__ = (prompt) => new Promise(resolve => {
      pendingInput = resolve;
      post({ type: "input", runId, prompt: String(prompt || "") });
    });
    self.__js_show_image__ = (dataUrl) => post({ type: "image", runId, dataUrl: String(dataUrl) });
    pyodide.runPython([
      "import builtins",
      "from pyodide.ffi import run_sync",
      "from js import __js_input__",
      "builtins.input = lambda prompt='': run_sync(__js_input__(prompt))",
    ].join("\\n"));
    try {
      await pyodide.loadPackagesFromImports("import matplotlib");
      pyodide.runPython([
        "import matplotlib",
        "matplotlib.use('agg')",
        "import matplotlib.pyplot as _plt",
        "def _browser_show(*args, **kwargs):",
        "    import io, base64",
        "    from js import __js_show_image__",
        "    for num in _plt.get_fignums():",
        "        buf = io.BytesIO()",
        "        _plt.figure(num).savefig(buf, format='png', bbox_inches='tight', dpi=100)",
        "        __js_show_image__('data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode())",
        "    _plt.close('all')",
        "_plt.show = _browser_show",
      ].join("\\n"));
    } catch (error) {
      // matplotlib is optional
    }

    window.addEventListener("message", async (event) => {
      if (event.source !== parent || !event.data || event.data.channel !== "${CHANNEL}") return;
      const data = event.data;
      if (data.type === "input" && pendingInput) {
        const resolve = pendingInput;
        pendingInput = null;
        resolve(String(data.value ?? ""));
        return;
      }
      if (data.type !== "run") return;
      runId = data.runId;
      pyodide.setStdout({ batched: text => post({ type: "stdout", runId, text }) });
      pyodide.setStderr({ batched: text => post({ type: "stderr", runId, text }) });
      try {
        try { await pyodide.loadPackagesFromImports(data.code); } catch (error) { /* run anyway */ }
        const result = await pyodide.runPythonAsync(data.code);
        post({ type: "done", runId, result: result === undefined || result === null ? undefined : String(result) });
      } catch (error) {
        post({ type: "done", runId, error: String(error && error.message || error) });
      }
    });
    post({ type: "ready" });
  } catch (error) {
    post({ type: "load-error", error: String(error && error.message || error) });
  }
})();
`;

const sandboxDocument = () => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">
</head><body><script src="${PYODIDE_URL}pyodide.js"></script><script>${SANDBOX_SCRIPT}</script></body></html>`;

/**
 * The interactive Python runner behind the "Run" button on Python code blocks. It used to load
 * Pyodide into the app's own window, where `from js import localStorage` reaches the JWT and every
 * MCP token; the code it runs is a model's, and a model can be steered by what it read. Now the
 * interpreter lives in the same kind of sandbox as skills: an opaque-origin iframe whose network is
 * limited to the package CDNs. One iframe is kept for the page so state and packages survive runs.
 */
class PythonSandbox {
  private iframe?: HTMLIFrameElement;
  private ready?: Promise<void>;
  private runs = new Map<string, { handlers: PythonRunHandlers; resolve: (result: PythonRunResult) => void }>();
  private counter = 0;

  load(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";
      this.iframe = iframe;

      window.addEventListener("message", event => {
        if (event.source !== iframe.contentWindow || event.data?.channel !== CHANNEL) return;
        const data = event.data;
        if (data.type === "ready") return resolve();
        if (data.type === "load-error") {
          this.reset();
          return reject(new Error(data.error));
        }
        this.onRunMessage(data);
      });

      iframe.srcdoc = sandboxDocument();
      document.body.appendChild(iframe);
    });
    return this.ready;
  }

  private reset() {
    this.iframe?.remove();
    this.iframe = undefined;
    this.ready = undefined;
  }

  private onRunMessage(data: { type: string; runId: string; [key: string]: unknown }) {
    const run = this.runs.get(data.runId);
    if (!run) return;
    switch (data.type) {
      case "stdout":
        return run.handlers.onStdout(String(data.text));
      case "stderr":
        return run.handlers.onStderr(String(data.text));
      case "image":
        if (typeof data.dataUrl === "string" && data.dataUrl.startsWith("data:image/png;base64,")) {
          run.handlers.onImage(data.dataUrl);
        }
        return;
      case "input":
        run.handlers
          .onInput(String(data.prompt || ""))
          .then(value => this.iframe?.contentWindow?.postMessage({ channel: CHANNEL, type: "input", value }, "*"));
        return;
      case "done":
        this.runs.delete(data.runId);
        run.resolve({
          result: typeof data.result === "string" ? data.result : undefined,
          error: typeof data.error === "string" ? data.error : undefined,
        });
    }
  }

  async run(code: string, handlers: PythonRunHandlers): Promise<PythonRunResult> {
    await this.load();
    const runId = `run-${++this.counter}`;
    return new Promise(resolve => {
      this.runs.set(runId, { handlers, resolve });
      this.iframe?.contentWindow?.postMessage({ channel: CHANNEL, type: "run", runId, code }, "*");
    });
  }
}

export const pythonSandbox = new PythonSandbox();
