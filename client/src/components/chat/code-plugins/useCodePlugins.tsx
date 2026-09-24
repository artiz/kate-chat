import React, { useState, useCallback, useMemo } from "react";
import { CodePlugin, CodePluginContext } from "@katechat/ui";
import { PythonExecutorModal } from "./PythonExecutorModal";
import { TypeScriptExecutorModal, TSExecutorLanguage } from "./TypeScriptExecutorModal";
import { GoExecutorModal } from "./GoExecutorModal";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { skillBlockAt } from "@/lib/skills/parse";
import { SKILL_RUN_EVENT, SkillRunRequest } from "@/lib/skills/events";

interface UseCodePluginsOptions {
  onMessageSaved?: (messageId: string, newContent: string) => void;
}

/**
 * Hook providing Python, TypeScript, JavaScript, and Go CodePlugins.
 * Returns the codePlugins record and the modal components to render.
 */
export function useCodePlugins(options?: UseCodePluginsOptions): {
  codePlugins: Record<string, CodePlugin>;
  PythonCodeModal: React.ReactNode;
  TSCodeModal: React.ReactNode;
  GoCodeModal: React.ReactNode;
} {
  const { onMessageSaved } = options ?? {};

  const [openedPython, setOpenedPython] = useState(false);
  const [pythonCode, setPythonCode] = useState("");
  const [pythonContext, setPythonContext] = useState<CodePluginContext | undefined>();

  const [openedTS, setOpenedTS] = useState(false);
  const [tsCode, setTsCode] = useState("");
  const [tsLanguage, setTsLanguage] = useState<TSExecutorLanguage>("typescript");
  const [tsContext, setTsContext] = useState<CodePluginContext | undefined>();

  const [openedGo, setOpenedGo] = useState(false);
  const [goCode, setGoCode] = useState("");
  const [goContext, setGoContext] = useState<CodePluginContext | undefined>();

  const { t, i18n } = useTranslation();

  /**
   * A skill block's program only works where its skill is loaded (packages, helpers, `output`), so
   * its Run button hands it to the skill card under the answer instead of the plain executor.
   */
  const runAsSkill = useCallback(
    (context?: CodePluginContext): boolean => {
      const block = context && skillBlockAt(context.messageContent, context.blockIndex);
      if (!context || !block) return false;
      if (!block.closed) {
        notifications.show({ color: "yellow", message: t("skills.unfinishedRun", { file: block.fileName }) });
      } else {
        const detail: SkillRunRequest = { messageId: context.messageId, index: block.index };
        window.dispatchEvent(new CustomEvent(SKILL_RUN_EVENT, { detail }));
      }
      return true;
    },
    [t]
  );

  const executePython = useCallback(
    (code: string, _language: string, context?: CodePluginContext) => {
      if (runAsSkill(context)) return;
      setPythonCode(code);
      setPythonContext(context);
      setOpenedPython(true);
    },
    [runAsSkill]
  );

  const executeTypeScript = useCallback(
    (code: string, language: string, context?: CodePluginContext) => {
      if (runAsSkill(context)) return;
      setTsCode(code);
      setTsLanguage(language === "javascript" ? "javascript" : "typescript");
      setTsContext(context);
      setOpenedTS(true);
    },
    [runAsSkill]
  );

  const executeGo = useCallback((code: string, _language: string, context?: CodePluginContext) => {
    setGoCode(code);
    setGoContext(context);
    setOpenedGo(true);
  }, []);

  const codePlugins = useMemo<Record<string, CodePlugin>>(
    () => ({
      python: { label: t("chat.codeRun"), execute: executePython },
      typescript: { label: t("chat.codeRun"), execute: executeTypeScript },
      javascript: { label: t("chat.codeRun"), execute: executeTypeScript },
      go: { label: t("chat.codeRun"), execute: executeGo },
    }),
    [executePython, executeTypeScript, executeGo, i18n.language]
  );

  const PythonCodeModal = (
    <PythonExecutorModal
      opened={openedPython}
      onClose={() => setOpenedPython(false)}
      initialCode={pythonCode}
      messageId={pythonContext?.messageId}
      blockIndex={pythonContext?.blockIndex}
      messageContent={pythonContext?.messageContent}
      onSaved={onMessageSaved}
    />
  );

  const TSCodeModal = (
    <TypeScriptExecutorModal
      opened={openedTS}
      onClose={() => setOpenedTS(false)}
      initialCode={tsCode}
      language={tsLanguage}
      messageId={tsContext?.messageId}
      blockIndex={tsContext?.blockIndex}
      messageContent={tsContext?.messageContent}
      onSaved={onMessageSaved}
    />
  );

  const GoCodeModal = (
    <GoExecutorModal
      opened={openedGo}
      onClose={() => setOpenedGo(false)}
      initialCode={goCode}
      messageId={goContext?.messageId}
      blockIndex={goContext?.blockIndex}
      messageContent={goContext?.messageContent}
      onSaved={onMessageSaved}
    />
  );

  return { codePlugins, PythonCodeModal, TSCodeModal, GoCodeModal };
}
