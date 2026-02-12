import React, { useState, useCallback, useMemo } from "react";
import { CodePlugin } from "@katechat/ui";
import { PythonExecutorModal } from "./PythonExecutorModal";

/**
 * Hook providing a Python CodePlugin backed by Pyodide.
 * Returns the codePlugins record and the modal component to render.
 */
export function useCodePlugins(): {
  codePlugins: Record<string, CodePlugin>;
  PythonCodeModal: React.ReactNode;
} {
  const [opened, setOpened] = useState(false);
  const [initialCode, setInitialCode] = useState("");

  const execute = useCallback((code: string, _language: string) => {
    setInitialCode(code);
    setOpened(true);
  }, []);

  const onClose = useCallback(() => {
    setOpened(false);
  }, []);

  const codePlugins = useMemo<Record<string, CodePlugin>>(
    () => ({
      python: { label: "Run", execute },
    }),
    [execute]
  );

  const PythonCodeModal = <PythonExecutorModal opened={opened} onClose={onClose} initialCode={initialCode} />;

  return { codePlugins, PythonCodeModal };
}
