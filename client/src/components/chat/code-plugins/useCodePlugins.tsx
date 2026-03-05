import React, { useState, useCallback, useMemo } from "react";
import { CodePlugin, CodePluginContext } from "@katechat/ui";
import { PythonExecutorModal } from "./PythonExecutorModal";
import { TypeScriptExecutorModal, TSExecutorLanguage } from "./TypeScriptExecutorModal";
import { GoExecutorModal } from "./GoExecutorModal";
import { useTranslation } from "react-i18next";

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

  const executePython = useCallback((code: string, _language: string, context?: CodePluginContext) => {
    setPythonCode(code);
    setPythonContext(context);
    setOpenedPython(true);
  }, []);

  const executeTypeScript = useCallback((code: string, language: string, context?: CodePluginContext) => {
    setTsCode(code);
    setTsLanguage(language === "javascript" ? "javascript" : "typescript");
    setTsContext(context);
    setOpenedTS(true);
  }, []);

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
