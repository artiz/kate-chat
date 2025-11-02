import React from "react";
import { Badge, DefaultMantineColor } from "@mantine/core";
import { ResponseStatus } from "@/core/message";

const TITLE_MAP: Record<ResponseStatus, string> = {
  [ResponseStatus.STARTED]: "Started",
  [ResponseStatus.IN_PROGRESS]: "In Progress",
  [ResponseStatus.COMPLETED]: "Completed",
  [ResponseStatus.RAG_SEARCH]: "RAG Search",
  [ResponseStatus.WEB_SEARCH]: "Web Search",
  [ResponseStatus.CODE_INTERPRETER]: "Code Interpreter",
  [ResponseStatus.TOOL_CALL]: "Tool Call",
  [ResponseStatus.REASONING]: "Reasoning",
  [ResponseStatus.ERROR]: "Error",
  [ResponseStatus.TOOL_CALL_COMPLETED]: "Tool Call Completed",
  [ResponseStatus.CANCELLED]: "Cancelled",
};

const COLOR_MAP: Record<ResponseStatus, DefaultMantineColor> = {
  [ResponseStatus.STARTED]: "gray",
  [ResponseStatus.IN_PROGRESS]: "blue",
  [ResponseStatus.COMPLETED]: "green",
  [ResponseStatus.RAG_SEARCH]: "orange",
  [ResponseStatus.WEB_SEARCH]: "teal",
  [ResponseStatus.CODE_INTERPRETER]: "teal",
  [ResponseStatus.TOOL_CALL]: "cyan",
  [ResponseStatus.REASONING]: "yellow",
  [ResponseStatus.ERROR]: "red",
  [ResponseStatus.TOOL_CALL_COMPLETED]: "green",
  [ResponseStatus.CANCELLED]: "dark",
};

export const MessageStatus = ({ status }: { status: ResponseStatus }) => {
  const title = TITLE_MAP[status] || status;
  const color = COLOR_MAP[status] || "indigo";

  return (
    <Badge color={color} variant="light">
      {title}
    </Badge>
  );
};
