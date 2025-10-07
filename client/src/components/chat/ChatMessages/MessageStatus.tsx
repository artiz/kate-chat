import { ResponseStatus } from "@/types/graphql";
import { Badge, DefaultMantineColor } from "@mantine/core";
import React from "react";

const TITLE_MAP: Record<ResponseStatus, string> = {
  [ResponseStatus.IN_PROGRESS]: "In Progress",
  [ResponseStatus.COMPLETED]: "Completed",
  [ResponseStatus.WEB_SEARCH]: "Web Search",
  [ResponseStatus.CODE_INTERPRETER]: "Code Interpreter",
  [ResponseStatus.TOOL_CALL]: "Tool Call",
  [ResponseStatus.REASONING]: "Reasoning",
  [ResponseStatus.ERROR]: "Error",
};

const COLOR_MAP: Record<ResponseStatus, DefaultMantineColor> = {
  [ResponseStatus.IN_PROGRESS]: "blue",
  [ResponseStatus.COMPLETED]: "green",
  [ResponseStatus.WEB_SEARCH]: "teal",
  [ResponseStatus.CODE_INTERPRETER]: "teal",
  [ResponseStatus.TOOL_CALL]: "cyan",
  [ResponseStatus.REASONING]: "yellow",
  [ResponseStatus.ERROR]: "red",
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
