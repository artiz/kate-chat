import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Group, Text, Loader, ScrollArea, Box, Textarea, ActionIcon, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconTrash, IconDownload, IconDeviceFloppy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@apollo/client";
import { UPDATE_MESSAGE_CONTENT_MUTATION } from "@/store/services/graphql.queries";

import "./CodeExecutorModal.scss";

const TS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/typescript/5.7.3/typescript.min.js";

export type TSExecutorLanguage = "typescript" | "javascript";

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

interface TypeScriptExecutorModalProps {
  opened: boolean;
  onClose: () => void;
  initialCode: string;
  language: TSExecutorLanguage;
  messageId?: string;
  blockIndex?: number;
  messageContent?: string;
  onSaved?: (messageId: string, newContent: string) => void;
}

interface OutputEntry {
  type: "stdout" | "stderr" | "info";
  text: string;
}

// Minimal typing for the TypeScript compiler global
interface TSCompiler {
  transpileModule: (
    code: string,
    opts: { compilerOptions: { module: number; target: number }; reportDiagnostics?: boolean }
  ) => { outputText: string; diagnostics?: Array<{ messageText: string | { messageText: string } }> };
  ModuleKind: { None: number };
  ScriptTarget: { ES2020: number };
}

// Global compiler cache — loaded once, reused across modal opens
let tsCompiler: TSCompiler | null = null;
let tsLoadPromise: Promise<TSCompiler> | null = null;

async function loadTypeScriptCompiler(): Promise<TSCompiler> {
  if (tsCompiler) return tsCompiler;
  if (tsLoadPromise) return tsLoadPromise;

  tsLoadPromise = (async () => {
    if (!(window as unknown as Record<string, unknown>).ts) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = TS_CDN;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load TypeScript compiler from CDN"));
        document.head.appendChild(script);
      });
    }
    tsCompiler = (window as unknown as Record<string, unknown>).ts as TSCompiler;
    return tsCompiler;
  })();

  return tsLoadPromise;
}

function runInSandbox(jsCode: string, onOutput: (entry: OutputEntry) => void): Promise<void> {
  return new Promise(resolve => {
    // srcdoc for the sandboxed iframe — console methods post messages to parent
    const srcdoc = `<!DOCTYPE html><html><head><script>
window.console = {
  log:  (...a) => parent.postMessage({ t: 'log', v: a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ') }, '*'),
  error:(...a) => parent.postMessage({ t: 'err', v: a.map(x => x instanceof Error ? x.toString() : typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ') }, '*'),
  warn: (...a) => parent.postMessage({ t: 'log', v: a.map(x => String(x)).join(' ') }, '*'),
  info: (...a) => parent.postMessage({ t: 'log', v: a.map(x => String(x)).join(' ') }, '*'),
};
window.onerror = (_msg, _s, _l, _c, err) => {
  parent.postMessage({ t: 'err', v: err ? err.toString() : String(_msg) }, '*');
  parent.postMessage({ t: 'done' }, '*');
  return true;
};
window.onunhandledrejection = e => {
  parent.postMessage({ t: 'err', v: e.reason ? String(e.reason) : 'Unhandled rejection' }, '*');
  parent.postMessage({ t: 'done' }, '*');
};
<\/script></head><body><script>
(async () => {
  try {
    ${jsCode}
  } catch(e) {
    parent.postMessage({ t: 'err', v: e.toString() }, '*');
  } finally {
    parent.postMessage({ t: 'done' }, '*');
  }
})();
<\/script></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.cssText = "display:none;position:absolute;width:0;height:0;";

    const cleanup = () => {
      window.removeEventListener("message", handler);
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    };

    const timer = setTimeout(() => {
      cleanup();
      onOutput({ type: "stderr", text: "Execution timed out (10s)\n" });
      resolve();
    }, 10_000);

    const handler = (event: MessageEvent) => {
      if (event.source !== (iframe.contentWindow as Window)) return;
      const { t, v } = (event.data ?? {}) as { t?: string; v?: string };
      if (t === "done") {
        clearTimeout(timer);
        cleanup();
        resolve();
      } else if (t === "log") {
        onOutput({ type: "stdout", text: (v ?? "") + "\n" });
      } else if (t === "err") {
        onOutput({ type: "stderr", text: (v ?? "") + "\n" });
      }
    };

    window.addEventListener("message", handler);
    document.body.appendChild(iframe);
    iframe.srcdoc = srcdoc;
  });
}

export const TypeScriptExecutorModal: React.FC<TypeScriptExecutorModalProps> = ({
  opened,
  onClose,
  initialCode,
  language,
  messageId,
  blockIndex,
  messageContent,
  onSaved,
}) => {
  const { t } = useTranslation();
  const isTypeScript = language === "typescript";
  const [updateMessageContent, { loading: saving }] = useMutation(UPDATE_MESSAGE_CONTENT_MUTATION);

  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [compilerReady, setCompilerReady] = useState(!isTypeScript || !!tsCompiler);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (opened) {
      setCode(initialCode);
      setOutput([]);
      setError(null);
    }
  }, [opened, initialCode]);

  // Load TS compiler when modal opens (no-op for JS)
  useEffect(() => {
    if (!opened || !isTypeScript) return;
    if (tsCompiler) {
      setCompilerReady(true);
      return;
    }
    setLoading(true);
    loadTypeScriptCompiler()
      .then(() => {
        setCompilerReady(true);
        setLoading(false);
      })
      .catch(err => {
        setError(t("codePlugin.typescript.failedToLoad", { error: (err as Error).message }));
        setLoading(false);
      });
  }, [opened, isTypeScript]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const runCode = useCallback(async () => {
    if (runningRef.current) return;
    if (isTypeScript && !tsCompiler) return;

    runningRef.current = true;
    setLoading(true);
    setOutput(prev => [...prev, { type: "info", text: ">>> Running...\n" }]);

    try {
      let jsCode = code;

      if (isTypeScript && tsCompiler) {
        const result = tsCompiler.transpileModule(code, {
          compilerOptions: {
            module: tsCompiler.ModuleKind.None,
            target: tsCompiler.ScriptTarget.ES2020,
          },
          reportDiagnostics: true,
        });

        // Surface transpile-time diagnostics as warnings
        if (result.diagnostics?.length) {
          for (const d of result.diagnostics) {
            const msg = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
            setOutput(prev => [...prev, { type: "stderr", text: `TypeScript: ${msg}\n` }]);
          }
        }

        jsCode = result.outputText;
      }

      await runInSandbox(jsCode, entry => {
        setOutput(prev => [...prev, entry]);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(prev => [...prev, { type: "stderr", text: message }]);
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [code, isTypeScript]);

  const clearOutput = useCallback(() => setOutput([]), []);

  const downloadOutput = useCallback(() => {
    const text = output.map(e => e.text).join("");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${language}-output.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [output, language]);

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

  const title = isTypeScript ? t("codePlugin.typescript.title") : t("codePlugin.javascript.title");
  const color = isTypeScript ? "blue" : "yellow";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={
        <Group gap="xs">
          <Text fw={600}>{title}</Text>
          {isTypeScript && !compilerReady && !error && <Loader size="xs" />}
          {isTypeScript && compilerReady && (
            <Text size="xs" c="blue">
              {t("codePlugin.typescript.runtimeReady")}
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
            placeholder={t(isTypeScript ? "codePlugin.typescript.enterCode" : "codePlugin.javascript.enterCode")}
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
              {output.length === 0 && (
                <Text size="xs" c="dimmed" fs="italic">
                  {t("codePlugin.outputPlaceholder")}
                </Text>
              )}
              {output.map((entry, idx) => (
                <pre
                  key={idx}
                  className={[
                    "output-line",
                    entry.type === "stderr" ? "output-error" : "",
                    entry.type === "info" ? "output-info" : "",
                  ].join(" ")}
                >
                  {entry.text}
                </pre>
              ))}
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
            disabled={loading || saving}
            loading={saving}
            leftSection={<IconDeviceFloppy size={16} />}
          >
            {t("codePlugin.save")}
          </Button>
        )}
        <Button
          color={color}
          onClick={runCode}
          disabled={(!compilerReady && isTypeScript) || loading}
          loading={loading}
          leftSection={<IconPlayerPlay size={16} />}
        >
          {t("common.run")}
        </Button>
      </Group>
    </Modal>
  );
};
