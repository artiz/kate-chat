import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Anchor, Button, Code, Collapse, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconDownload,
  IconFile,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconPresentation,
  IconRefresh,
  IconTool,
  IconWand,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { MessageRole, PluginProps, assert } from "@katechat/ui";
import { CreateMessageResponse, GeneratedFile, Message, Skill } from "@/types/graphql";
import { CREATE_MESSAGE, GET_SKILLS, SAVE_GENERATED_FILE } from "@/store/services/graphql.queries";
import { APP_API_URL } from "@/lib/config";
import { normalizeFileName, parseSkillBlocks, SkillBlock } from "@/lib/skills/parse";
import { runSkillCode, SkillOutputFile } from "@/lib/skills/sandbox";
import { useChatPluginsContext } from "../ChatPluginsContext";

interface SkillRunsProps extends PluginProps<Message> {
  /** No automatic runs and no "Fix" in a chat the viewer cannot write to */
  readOnly?: boolean;
}

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "saving" }
  | { status: "error"; error: string; logs: string };

const MAX_ERROR_FOR_MODEL = 3000;

// Blocks already started in this page, so a remount (the list is virtualised) does not run them again
const started = new Set<string>();

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pptx") return <IconPresentation size={20} />;
  if (ext === "xlsx" || ext === "csv") return <IconFileSpreadsheet size={20} />;
  if (ext === "pdf") return <IconFileTypePdf size={20} />;
  return <IconFile size={20} />;
};

const formatSize = (size: number) =>
  size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

export const fileDownloadUrl = (file: GeneratedFile) =>
  `${APP_API_URL}/files/${file.fileName}?name=${encodeURIComponent(file.name)}`;

/**
 * The block header is the contract: when the program wrote a single file under another name, it is
 * stored under the name the header announced, so the answer and its file stay matched.
 */
const outputsFor = (block: SkillBlock, files: SkillOutputFile[]): SkillOutputFile[] =>
  files.length === 1 ? [{ ...files[0], name: normalizeFileName(block.fileName) }] : files;

interface SkillRunProps {
  block: SkillBlock;
  skill?: Skill;
  message: Message;
  autoRun: boolean;
  canFix: boolean;
  disabled?: boolean;
  onAddMessage?: (message: Message) => void;
}

const SkillRun = ({ block, skill, message, autoRun, canFix, disabled, onAddMessage }: SkillRunProps) => {
  const { t } = useTranslation();
  const { mcpTokens } = useChatPluginsContext();
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [showLogs, setShowLogs] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const file = message.metadata?.generatedFiles?.find(f => f.name === normalizeFileName(block.fileName));

  const [saveFile] = useMutation<{ saveGeneratedFile: Message }>(SAVE_GENERATED_FILE);
  const [createMessage, { loading: fixing }] = useMutation<CreateMessageResponse>(CREATE_MESSAGE, {
    onCompleted: data => data.createMessage && onAddMessage?.(data.createMessage),
  });

  const run = useCallback(async () => {
    if (!skill) return;
    started.add(`${message.id}:${block.index}`);
    setState({ status: "running" });

    const result = await runSkillCode(skill, block.code);
    if (!mounted.current) return;
    if (!result.ok) {
      setState({ status: "error", error: result.error, logs: result.logs });
      return;
    }

    setState({ status: "saving" });
    try {
      let updated: Message | undefined;
      for (const output of outputsFor(block, result.files)) {
        const { data } = await saveFile({
          variables: { input: { messageId: message.id, name: output.name, bytesBase64: toBase64(output.bytes) } },
        });
        updated = data?.saveGeneratedFile;
      }
      if (updated) onAddMessage?.(updated);
      if (mounted.current) setState({ status: "idle" });
    } catch (error) {
      if (mounted.current) {
        setState({ status: "error", error: error instanceof Error ? error.message : String(error), logs: result.logs });
      }
    }
  }, [skill, block, message.id, saveFile, onAddMessage]);

  useEffect(() => {
    if (autoRun && skill && !file && !started.has(`${message.id}:${block.index}`)) run();
  }, [autoRun, skill, file, message.id, block.index, run]);

  const askToFix = () => {
    if (state.status !== "error") return;
    assert.ok(message.chatId, "Chat id is required to ask for a fix");
    const details = [state.error, state.logs].filter(Boolean).join("\n\n").slice(-MAX_ERROR_FOR_MODEL);
    createMessage({
      variables: {
        input: {
          chatId: message.chatId,
          content: t("skills.fixPrompt", { file: block.fileName, error: details }),
          mcpTokens,
        },
      },
    });
  };

  if (!skill) {
    return (
      <Alert variant="light" color="gray" icon={<IconWand size={18} />} py="xs">
        <Text size="sm">{t("skills.unknownSkill", { skill: block.skillId, file: block.fileName })}</Text>
      </Alert>
    );
  }

  if (state.status === "running" || state.status === "saving") {
    return (
      <Paper withBorder p="xs" className="skill-run skill-run-progress">
        <Group gap="sm" wrap="nowrap">
          <Loader size="sm" />
          <div>
            <Text size="sm">
              {state.status === "running"
                ? t("skills.generating", { file: block.fileName })
                : t("skills.saving", { file: block.fileName })}
            </Text>
            {state.status === "running" && skill.runtime === "python" && (
              <Text size="xs" c="dimmed">
                {t("skills.pythonFirstRun")}
              </Text>
            )}
          </div>
        </Group>
      </Paper>
    );
  }

  if (state.status === "error") {
    return (
      <Alert
        variant="light"
        color="red"
        icon={<IconAlertTriangle size={18} />}
        py="xs"
        className="skill-run skill-run-error"
      >
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            {t("skills.failed", { file: block.fileName })}
          </Text>
          <Code block className="skill-run-error-text">
            {state.error.split("\n").slice(-12).join("\n")}
          </Code>
          {state.logs && (
            <>
              <Anchor size="xs" onClick={() => setShowLogs(v => !v)}>
                {showLogs ? t("skills.hideOutput") : t("skills.showOutput")}
              </Anchor>
              <Collapse in={showLogs}>
                <Code block>{state.logs}</Code>
              </Collapse>
            </>
          )}
          <Group gap="xs">
            {canFix && (
              <Button
                size="xs"
                color="red"
                variant="light"
                leftSection={<IconTool size={14} />}
                loading={fixing}
                disabled={disabled}
                onClick={askToFix}
                className="skill-run-fix"
              >
                {t("skills.askToFix")}
              </Button>
            )}
            <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={run}>
              {t("skills.runAgain")}
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  if (file) {
    return (
      <Paper withBorder p="xs" className="skill-run skill-run-file">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            {fileIcon(file.name)}
            <div>
              <Anchor href={fileDownloadUrl(file)} target="_blank" rel="noopener noreferrer" size="sm" fw={500}>
                {file.name}
              </Anchor>
              <Text size="xs" c="dimmed">
                {formatSize(file.size)} · {skill.name}
              </Text>
            </div>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconRefresh size={14} />}
              onClick={run}
              disabled={disabled}
              title={t("skills.runAgainHint")}
            >
              {t("skills.runAgain")}
            </Button>
            <Button
              size="xs"
              component="a"
              href={fileDownloadUrl(file)}
              target="_blank"
              rel="noopener noreferrer"
              leftSection={<IconDownload size={14} />}
            >
              {t("skills.download")}
            </Button>
          </Group>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="xs" className="skill-run skill-run-idle">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconWand size={20} />
          <Text size="sm">{t("skills.notGenerated", { file: block.fileName, skill: skill.name })}</Text>
        </Group>
        <Button size="xs" leftSection={<IconWand size={14} />} onClick={run} disabled={disabled}>
          {t("skills.generate")}
        </Button>
      </Group>
    </Paper>
  );
};

/**
 * Under an answer that contains skill blocks: runs them in the browser sandbox and attaches the
 * files to the answer. A block runs by itself once, when it is new: the last answer of the chat
 * with no file yet. Older answers offer a button instead, so opening a chat never starts programs.
 */
export const SkillRuns = ({ message, isLast, disabled, readOnly, onAddMessage }: SkillRunsProps) => {
  const blocks = useMemo(
    () => (message.role === MessageRole.ASSISTANT && !message.streaming ? parseSkillBlocks(message.content) : []),
    [message.role, message.streaming, message.content]
  );
  const { data } = useQuery<{ skills: Skill[] }>(GET_SKILLS, { skip: !blocks.length, fetchPolicy: "cache-first" });
  const skills = useMemo(() => new Map((data?.skills || []).map(skill => [skill.id, skill])), [data]);

  if (!blocks.length || !data) return null;

  return (
    <Stack gap="xs" className="skill-runs">
      {blocks.map(block => (
        <SkillRun
          key={`${message.id}:${block.index}:${block.fileName}`}
          block={block}
          skill={skills.get(block.skillId)}
          message={message}
          autoRun={!!isLast && !readOnly}
          canFix={!!isLast && !readOnly}
          disabled={disabled}
          onAddMessage={onAddMessage}
        />
      ))}
    </Stack>
  );
};
