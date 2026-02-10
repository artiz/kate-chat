import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Group, Text, Loader, ScrollArea, Box, Textarea, ActionIcon, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconTrash, IconDownload } from "@tabler/icons-react";

import "./PythonExecutorModal.scss";

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

interface PythonExecutorModalProps {
  opened: boolean;
  onClose: () => void;
  initialCode: string;
}

interface OutputEntry {
  type: "stdout" | "stderr" | "result" | "info" | "input-prompt";
  text: string;
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
    return pyodide;
  })();

  return pyodideLoadPromise;
}

export const PythonExecutorModal: React.FC<PythonExecutorModalProps> = ({ opened, onClose, initialCode }) => {
  const [code, setCode] = useState(initialCode);
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
      .then(() => {
        setPyodideReady(true);
        setLoading(false);
      })
      .catch(err => {
        setError(`Failed to load Python runtime: ${err.message}`);
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

      // Provide a JS function for Python's input() to call
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

      // Patch builtins.input to use our JS handler
      pyodideInstance.runPython(`
import builtins
from pyodide.ffi import run_sync

_original_input = builtins.input

def _browser_input(prompt=""):
    return run_sync(__js_input__(prompt))

builtins.input = _browser_input
`);

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

      // Restore original input
      try {
        pyodideInstance?.runPython(`
import builtins
if hasattr(builtins, '_original_input'):
    builtins.input = builtins._original_input
`);
        pyodideInstance?.globals.delete("__js_input__");
      } catch {
        // ignore cleanup errors
      }
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={600}>Python Executor</Text>
          {!pyodideReady && !error && <Loader size="xs" />}
          {pyodideReady && (
            <Text size="xs" c="teal">
              (Pyodide ready)
            </Text>
          )}
        </Group>
      }
      size="xl"
      fullScreen={false}
      styles={{
        content: { height: "80vh", display: "flex", flexDirection: "column" },
        body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      {error && (
        <Text c="red" size="sm" mb="sm">
          {error}
        </Text>
      )}

      <div className="python-executor-container">
        <div className="python-executor-editor">
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              Code
            </Text>
            <Text size="xs" c="dimmed">
              Ctrl+Enter to run
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
            placeholder="Enter Python code..."
            readOnly={loading}
          />
        </div>

        <div className="python-executor-output">
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              Output
            </Text>
            <Group gap="xs">
              {output.length > 0 && (
                <>
                  <Tooltip label="Download output">
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={downloadOutput}>
                      <IconDownload size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Clear output">
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={clearOutput}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          </Group>

          <ScrollArea className="python-executor-output-scroll" viewportRef={outputRef}>
            <Box className="python-executor-output-content">
              {output.length === 0 && !waitingForInput && (
                <Text size="xs" c="dimmed" fs="italic">
                  Output will appear here...
                </Text>
              )}
              {output.map((entry, idx) => (
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
              ))}
              {waitingForInput && (
                <div className="python-input-inline">
                  <span className="python-input-caret">&gt;&gt;&gt; </span>
                  <input
                    ref={inputRef}
                    className="python-input-field"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitInput();
                      }
                    }}
                    placeholder="Enter input..."
                    autoFocus
                  />
                </div>
              )}
            </Box>
          </ScrollArea>
        </div>
      </div>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Close
        </Button>
        <Button
          color="teal"
          onClick={runCode}
          disabled={!pyodideReady || loading}
          loading={loading}
          leftSection={<IconPlayerPlay size={16} />}
        >
          Run
        </Button>
      </Group>
    </Modal>
  );
};
