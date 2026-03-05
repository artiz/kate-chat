import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Group, Text, Loader, ScrollArea, Box, Textarea, ActionIcon, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconTrash, IconDownload, IconCopy, IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@apollo/client";
import { UPDATE_MESSAGE_CONTENT_MUTATION } from "@/store/services/graphql.queries";

import "./CodeExecutorModal.scss";

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

/** Replace the blockIndex-th fenced code block in markdown content with newCode */
function replaceCodeBlock(content: string, blockIndex: number, newCode: string): string {
  let count = -1;
  return content.replace(/```[^\n]*\n[\s\S]*?```/g, match => {
    count++;
    if (count === blockIndex) {
      const langLine = match.split("\n")[0];
      return `${langLine}\n${newCode}\n\`\`\``;
    }
    return match;
  });
}

interface PythonExecutorModalProps {
  opened: boolean;
  onClose: () => void;
  initialCode: string;
  messageId?: string;
  blockIndex?: number;
  messageContent?: string;
  onSaved?: (messageId: string, newContent: string) => void;
}

interface OutputEntry {
  type: "stdout" | "stderr" | "result" | "info" | "input-prompt" | "image";
  text: string;
  dataUrl?: string;
}

// Pyodide typings (minimal)
interface PyodideInterface {
  runPythonAsync: (code: string, options?: { globals?: unknown }) => Promise<unknown>;
  runPython: (code: string) => unknown;
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
  loadPackagesFromImports: (code: string) => Promise<void>;
  globals: { set: (name: string, value: unknown) => void; delete: (name: string) => void };
}

// Global pyodide cache to avoid reloading across modal opens
let pyodideInstance: PyodideInterface | null = null;
let pyodideLoadPromise: Promise<PyodideInterface> | null = null;
let matplotlibPatched = false;

async function loadPyodideRuntime(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoadPromise) return pyodideLoadPromise;

  pyodideLoadPromise = (async () => {
    // Dynamically load the Pyodide script from CDN
    if (!(window as unknown as Record<string, unknown>).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${PYODIDE_CDN}pyodide.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Pyodide from CDN"));
        document.head.appendChild(script);
      });
    }

    const loadPyodide = (window as unknown as Record<string, unknown>).loadPyodide as (config: {
      indexURL: string;
    }) => Promise<PyodideInterface>;

    const pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });
    pyodideInstance = pyodide;

    // One-time: patch builtins.input to use a JS callback
    pyodide.runPython(`
import builtins
from pyodide.ffi import run_sync

_original_input = builtins.input

def _browser_input(prompt=""):
    return run_sync(__js_input__(prompt))

builtins.input = _browser_input
`);

    return pyodide;
  })();

  return pyodideLoadPromise;
}

/** Pre-load and patch matplotlib (once, after first import) */
async function ensureMatplotlibPatched(pyodide: PyodideInterface): Promise<void> {
  if (matplotlibPatched) return;
  matplotlibPatched = true;

  // Pre-install matplotlib so the font cache builds now, not during user code
  try {
    await pyodide.loadPackagesFromImports("import matplotlib");
  } catch {
    // not critical
  }

  pyodide.runPython(`
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as _plt

_original_show = _plt.show

def _browser_show(*args, **kwargs):
    import io, base64
    for fig_num in _plt.get_fignums():
        fig = _plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        data = base64.b64encode(buf.read()).decode('utf-8')
        __js_show_image__('data:image/png;base64,' + data)
        buf.close()
    _plt.close('all')

_plt.show = _browser_show
del _original_show
`);
}

/** Small button to copy a data-URL image to clipboard */
const CopyImageButton: React.FC<{ dataUrl: string }> = ({ dataUrl }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: do nothing
    }
  }, [dataUrl]);

  return (
    <Tooltip label={copied ? "Copied!" : "Copy image"} withArrow>
      <ActionIcon
        className="copy-image-btn"
        size="sm"
        variant="filled"
        color={copied ? "teal" : "gray"}
        onClick={handleCopy}
      >
        {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
      </ActionIcon>
    </Tooltip>
  );
};

export const PythonExecutorModal: React.FC<PythonExecutorModalProps> = ({
  opened,
  onClose,
  initialCode,
  messageId,
  blockIndex,
  messageContent,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(initialCode);
  const [updateMessageContent, { loading: saving }] = useMutation(UPDATE_MESSAGE_CONTENT_MUTATION);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(!!pyodideInstance);
  const [error, setError] = useState<string | null>(null);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);
  const inputResolveRef = useRef<((value: string) => void) | null>(null);

  // Update code when initialCode changes (new modal open)
  useEffect(() => {
    if (opened) {
      setCode(initialCode);
      setOutput([]);
      setError(null);
    }
  }, [opened, initialCode]);

  // Load Pyodide when modal opens
  useEffect(() => {
    if (!opened) return;
    if (pyodideInstance) {
      setPyodideReady(true);
      return;
    }

    setLoading(true);
    loadPyodideRuntime()
      .then(async pyodide => {
        await ensureMatplotlibPatched(pyodide);
        setPyodideReady(true);
        setLoading(false);
      })
      .catch(err => {
        setError(t("codePlugin.python.failedToLoad", { error: err.message }));
        setLoading(false);
      });
  }, [opened]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Focus inline input when waiting
  useEffect(() => {
    if (waitingForInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingForInput]);

  const submitInput = useCallback(() => {
    if (inputResolveRef.current) {
      const value = inputValue;
      setOutput(prev => [...prev, { type: "stdout", text: value + "\n" }]);
      setInputValue("");
      setWaitingForInput(false);
      inputResolveRef.current(value);
      inputResolveRef.current = null;
    }
  }, [inputValue]);

  const runCode = useCallback(async () => {
    if (!pyodideInstance || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setOutput(prev => [...prev, { type: "info", text: ">>> Running...\n" }]);

    try {
      // Set up stdout/stderr capture
      pyodideInstance.setStdout({
        batched: (text: string) => {
          setOutput(prev => [...prev, { type: "stdout", text }]);
        },
      });
      pyodideInstance.setStderr({
        batched: (text: string) => {
          setOutput(prev => [...prev, { type: "stderr", text }]);
        },
      });

      // Set up JS callbacks that the Python patches reference
      const jsShowImage = (dataUrl: string) => {
        setOutput(prev => [...prev, { type: "image", text: "[matplotlib figure]", dataUrl }]);
      };
      pyodideInstance.globals.set("__js_show_image__", jsShowImage);

      const jsInputHandler = (promptText?: string): Promise<string> => {
        return new Promise<string>(resolve => {
          if (promptText) {
            setOutput(prev => [...prev, { type: "input-prompt", text: promptText }]);
          }
          inputResolveRef.current = resolve;
          setWaitingForInput(true);
        });
      };
      pyodideInstance.globals.set("__js_input__", jsInputHandler);

      // Auto-install imports
      try {
        await pyodideInstance.loadPackagesFromImports(code);
      } catch {
        // Some imports may not be available in Pyodide, continue anyway
      }

      const result = await pyodideInstance.runPythonAsync(code);
      if (result !== undefined && result !== null) {
        setOutput(prev => [...prev, { type: "result", text: String(result) }]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(prev => [...prev, { type: "stderr", text: message }]);
    } finally {
      setLoading(false);
      setWaitingForInput(false);
      inputResolveRef.current = null;
      runningRef.current = false;

      // Cleanup: reset waiting state (keep patches — they are one-time permanent)
    }
  }, [code]);

  const clearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  const downloadOutput = useCallback(() => {
    const text = output.map(e => e.text).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "python-output.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [output]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runCode();
      }
    },
    [runCode]
  );

  const saveCode = useCallback(async () => {
    if (!messageId || messageContent === undefined || blockIndex === undefined) return;
    const newContent = replaceCodeBlock(messageContent, blockIndex, code);
    const result = await updateMessageContent({ variables: { messageId, content: newContent } });
    if (!result.data?.updateMessageContent?.error) {
      onSaved?.(messageId, newContent);
    }
  }, [messageId, messageContent, blockIndex, code, updateMessageContent, onSaved]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={
        <Group gap="xs">
          <Text fw={600}>{t("codePlugin.python.title")}</Text>
          {!pyodideReady && !error && <Loader size="xs" />}
          {pyodideReady && (
            <Text size="xs" c="teal">
              {t("codePlugin.python.runtimeReady")}
            </Text>
          )}
        </Group>
      }
      styles={{
        content: { display: "flex", flexDirection: "column" },
        body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      {error && (
        <Text c="red" size="sm" mb="sm">
          {error}
        </Text>
      )}

      <div className="code-executor-container">
        <div className="executor-editor">
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              {t("codePlugin.code")}
            </Text>
            <Text size="xs" c="dimmed">
              {t("codePlugin.ctrlEnterToRun")}
            </Text>
          </Group>
          <Textarea
            value={code}
            onChange={e => setCode(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            autosize
            minRows={8}
            maxRows={20}
            styles={{
              input: {
                fontFamily: "monospace",
                fontSize: "0.85rem",
                whiteSpace: "pre",
                overflowWrap: "normal",
              },
            }}
            placeholder={t("codePlugin.python.enterCode")}
            readOnly={loading}
          />
        </div>

        <div className="executor-output">
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              {t("codePlugin.output")}
            </Text>
            <Group gap="xs">
              {output.length > 0 && (
                <>
                  <Tooltip label={t("codePlugin.downloadOutput")}>
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={downloadOutput}>
                      <IconDownload size={20} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("codePlugin.clearOutput")}>
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={clearOutput}>
                      <IconTrash size={20} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          </Group>

          <ScrollArea className="executor-output-scroll" viewportRef={outputRef}>
            <Box className="executor-output-content">
              {output.length === 0 && !waitingForInput && (
                <Text size="xs" c="dimmed" fs="italic">
                  {t("codePlugin.outputPlaceholder")}
                </Text>
              )}
              {output.map((entry, idx) =>
                entry.type === "image" && entry.dataUrl ? (
                  <div key={idx} className="output-image">
                    <img src={entry.dataUrl} alt="matplotlib figure" />
                    <CopyImageButton dataUrl={entry.dataUrl} />
                  </div>
                ) : (
                  <pre
                    key={idx}
                    className={[
                      "output-line",
                      entry.type === "stderr" ? "output-error" : "",
                      entry.type === "result" ? "output-result" : "",
                      entry.type === "info" ? "output-info" : "",
                      entry.type === "input-prompt" ? "output-prompt" : "",
                    ].join(" ")}
                  >
                    {entry.text}
                  </pre>
                )
              )}
              {waitingForInput && (
                <div className="input-inline">
                  <span className="input-caret">&gt;&gt;&gt; </span>
                  <input
                    ref={inputRef}
                    className="input-field"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitInput();
                      }
                    }}
                    placeholder={t("codePlugin.python.enterInput")}
                    autoFocus
                  />
                </div>
              )}
            </Box>
          </ScrollArea>
        </div>
      </div>

      <Group justify="flex-end" mt="md">
        <Button variant="light" onClick={onClose}>
          {t("common.close")}
        </Button>
        {messageId && (
          <Button
            variant="light"
            color="green"
            onClick={saveCode}
            disabled={!pyodideReady || loading || saving}
            loading={saving}
            leftSection={<IconDeviceFloppy size={16} />}
          >
            {t("codePlugin.save")}
          </Button>
        )}
        <Button
          color="teal"
          onClick={runCode}
          disabled={!pyodideReady || loading}
          loading={loading}
          leftSection={<IconPlayerPlay size={16} />}
        >
          {t("common.run")}
        </Button>
      </Group>
    </Modal>
  );
};
