import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Group, Text, ScrollArea, Box, Textarea, ActionIcon, Tooltip, Alert } from "@mantine/core";
import { IconPlayerPlay, IconTrash, IconDownload, IconDeviceFloppy, IconWand } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { APP_API_URL } from "@/lib/config";

import "./CodeExecutorModal.scss";

const GO_DEV_COMPILE = "https://go.dev/_/compile?backend=";
const GO_DEV_FMT = "https://go.dev/_/fmt?backend=";

interface GoExecutorModalProps {
  opened: boolean;
  onClose: () => void;
  initialCode: string;
  messageId?: string;
  blockIndex?: number;
  messageContent?: string;
  onSaved?: (messageId: string, newContent: string) => void;
}

interface OutputEntry {
  type: "stdout" | "stderr" | "info";
  text: string;
}

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

async function executeGoCode(code: string): Promise<{ stdout?: string; stderr?: string; error?: string }> {
  try {
    const response = await fetch(`${APP_API_URL}/auth/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: GO_DEV_COMPILE,
        body: { version: "2", body: code, withVet: "true" },
      }),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    let stderr = "";
    let stdout = "";

    if (result.Errors) {
      stderr += Array.isArray(result.Errors)
        ? result.Errors.map((e: any) => JSON.stringify(e)).join("\n")
        : String(result.Errors);
    }

    if (result.VetErrors) {
      stderr += Array.isArray(result.VetErrors)
        ? result.VetErrors.map((e: any) => JSON.stringify(e)).join("\n")
        : String(result.VetErrors);
    }

    if (result.Events && Array.isArray(result.Events)) {
      stderr += result.Events.filter((e: any) => e.Kind === "stderr")
        .map((e: any) => e.Message)
        .join("\n");

      stdout += result.Events.filter((e: any) => e.Kind === "stdout")
        .map((e: any) => e.Message)
        .join("\n");
    }

    return { stdout, stderr };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to execute code" };
  }
}

async function formatGoCode(code: string): Promise<{ body?: string; error?: string }> {
  try {
    const response = await fetch(`${APP_API_URL}/auth/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: GO_DEV_FMT,
        body: { body: code, imports: "true" },
      }),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    return result.Error ? { error: result.Error } : { body: result.Body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to format code" };
  }
}

export const GoExecutorModal: React.FC<GoExecutorModalProps> = ({
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
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [saving, setSaving] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (opened) {
      setCode(initialCode);
      setOutput([]);
    }
  }, [opened, initialCode]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const runCode = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setOutput(prev => [...prev, { type: "info", text: ">>> Running...\n" }]);

    try {
      const result = await executeGoCode(code);

      if (result.error) {
        setOutput(prev => [...prev, { type: "stderr", text: `Error: ${result.error}\n` }]);
      } else {
        if (result.stdout) {
          setOutput(prev => [...prev, { type: "stdout", text: result.stdout! }]);
        }
        if (result.stderr) {
          setOutput(prev => [...prev, { type: "stderr", text: result.stderr! }]);
        }
        if (!result.stdout && !result.stderr) {
          setOutput(prev => [...prev, { type: "stdout", text: "(no output)\n" }]);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(prev => [...prev, { type: "stderr", text: `Error: ${message}\n` }]);
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [code]);

  const formatCode = useCallback(async () => {
    setFormatting(true);
    setOutput(prev => [...prev, { type: "info", text: ">>> Formatting...\n" }]);

    try {
      const result = await formatGoCode(code);

      if (result.error) {
        setOutput(prev => [...prev, { type: "stderr", text: `Format error: ${result.error}\n` }]);
      } else if (result.body) {
        setCode(result.body);
        setOutput(prev => [...prev, { type: "stdout", text: "Code formatted successfully\n" }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(prev => [...prev, { type: "stderr", text: `Format error: ${message}\n` }]);
    } finally {
      setFormatting(false);
    }
  }, [code]);

  const clearOutput = useCallback(() => setOutput([]), []);

  const downloadOutput = useCallback(() => {
    const text = output.map(e => e.text).join("");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "go-output.txt";
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
    setSaving(true);
    try {
      const newContent = replaceCodeBlock(messageContent, blockIndex, code);
      onSaved?.(messageId, newContent);
    } finally {
      setSaving(false);
    }
  }, [messageId, messageContent, blockIndex, code, onSaved]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={
        <Group gap="xs">
          <Text fw={600}>{t("codePlugin.go.title")}</Text>
        </Group>
      }
      styles={{
        content: { display: "flex", flexDirection: "column" },
        body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      <Alert icon={null} title={t("codePlugin.go.executedOn")} color="blue" mb="sm">
        {t("codePlugin.go.disclaimer")}
      </Alert>

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
            placeholder={t("codePlugin.go.enterCode")}
            readOnly={loading || formatting}
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
        <Button
          variant="light"
          color="grape"
          onClick={formatCode}
          disabled={formatting || loading}
          loading={formatting}
          leftSection={<IconWand size={16} />}
        >
          {t("codePlugin.go.format")}
        </Button>
        {messageId && (
          <Button
            variant="light"
            color="green"
            onClick={saveCode}
            disabled={saving}
            loading={saving}
            leftSection={<IconDeviceFloppy size={16} />}
          >
            {t("codePlugin.save")}
          </Button>
        )}
        <Button
          color="blue"
          onClick={runCode}
          disabled={loading || formatting}
          loading={loading}
          leftSection={<IconPlayerPlay size={16} />}
        >
          {t("common.run")}
        </Button>
      </Group>
    </Modal>
  );
};
