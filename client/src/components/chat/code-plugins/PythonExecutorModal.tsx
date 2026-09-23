import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Group, Text, Loader, ScrollArea, Box, Textarea, ActionIcon, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconTrash, IconDownload, IconCopy, IconCheck, IconDeviceFloppy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@apollo/client";
import { UPDATE_MESSAGE_CONTENT_MUTATION } from "@/store/services/graphql.queries";
import { pythonSandbox } from "@/lib/pythonSandbox";

import "./CodeExecutorModal.scss";

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

// Set once the sandboxed interpreter has loaded, so a reopened modal does not show the loader again
let sandboxReady = false;

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
  const [pyodideReady, setPyodideReady] = useState(sandboxReady);
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

  // Load the sandboxed interpreter when the modal opens
  useEffect(() => {
    if (!opened) return;
    if (sandboxReady) {
      setPyodideReady(true);
      return;
    }

    setLoading(true);
    pythonSandbox
      .load()
      .then(() => {
        sandboxReady = true;
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
    if (!sandboxReady || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setOutput(prev => [...prev, { type: "info", text: ">>> Running...\n" }]);

    try {
      const { result, error } = await pythonSandbox.run(code, {
        onStdout: text => setOutput(prev => [...prev, { type: "stdout", text }]),
        onStderr: text => setOutput(prev => [...prev, { type: "stderr", text }]),
        onImage: dataUrl => setOutput(prev => [...prev, { type: "image", text: "[matplotlib figure]", dataUrl }]),
        onInput: promptText =>
          new Promise<string>(resolve => {
            if (promptText) {
              setOutput(prev => [...prev, { type: "input-prompt", text: promptText }]);
            }
            inputResolveRef.current = resolve;
            setWaitingForInput(true);
          }),
      });
      if (error) {
        setOutput(prev => [...prev, { type: "stderr", text: error }]);
      } else if (result !== undefined) {
        setOutput(prev => [...prev, { type: "result", text: result }]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(prev => [...prev, { type: "stderr", text: message }]);
    } finally {
      setLoading(false);
      setWaitingForInput(false);
      inputResolveRef.current = null;
      runningRef.current = false;
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
