import React, { useState, useCallback, useMemo } from "react";
import { CodePlugin } from "@katechat/ui";
import { PythonExecutorModal } from "./PythonExecutorModal";
import { TypeScriptExecutorModal, TSExecutorLanguage } from "./TypeScriptExecutorModal";
import { useTranslation } from "react-i18next";

/**
 * Hook providing Python, TypeScript, and JavaScript CodePlugins.
 * Returns the codePlugins record and the modal components to render.
 */
export function useCodePlugins(): {
  codePlugins: Record<string, CodePlugin>;
  PythonCodeModal: React.ReactNode;
  TSCodeModal: React.ReactNode;
} {
  const [openedPython, setOpenedPython] = useState(false);
  const [pythonCode, setPythonCode] = useState("");

  const [openedTS, setOpenedTS] = useState(false);
  const [tsCode, setTsCode] = useState("");
  const [tsLanguage, setTsLanguage] = useState<TSExecutorLanguage>("typescript");

  const { t, i18n } = useTranslation();

  const executePython = useCallback((code: string, _language: string) => {
    setPythonCode(code);
    setOpenedPython(true);
  }, []);

  const executeTypeScript = useCallback((code: string, language: string) => {
    setTsCode(code);
    setTsLanguage(language === "javascript" ? "javascript" : "typescript");
    setOpenedTS(true);
  }, []);

  const codePlugins = useMemo<Record<string, CodePlugin>>(
    () => ({
      python: { label: t("chat.codeRun"), execute: executePython },
      typescript: { label: t("chat.codeRun"), execute: executeTypeScript },
      javascript: { label: t("chat.codeRun"), execute: executeTypeScript },
    }),
    [executePython, executeTypeScript, i18n.language]
  );

  const PythonCodeModal = (
    <PythonExecutorModal opened={openedPython} onClose={() => setOpenedPython(false)} initialCode={pythonCode} />
  );

  const TSCodeModal = (
    <TypeScriptExecutorModal
      opened={openedTS}
      onClose={() => setOpenedTS(false)}
      initialCode={tsCode}
      language={tsLanguage}
    />
  );

  return { codePlugins, PythonCodeModal, TSCodeModal };
}
