import React from "react";
import { Group, Text } from "@mantine/core";
import { IconWand } from "@tabler/icons-react";
import { TFunction, t as globalT } from "i18next";
import { Message } from "@/types/graphql";
import { parseSkillBlocks } from "@/lib/skills/parse";

/** The tool models call to load a skill's instructions (see api services/ai/tools/skills.tool.ts) */
export const SKILL_TOOL_NAME = "use_skill";

function skillOfArgs(args?: string): string {
  try {
    return String(JSON.parse(args || "{}").skill || "");
  } catch {
    return "";
  }
}

/**
 * Skills Details - the skills the model chose for this answer: the ones it loaded with use_skill
 * and the ones its blocks name (a model without tool calls gets every skill in its prompt)
 */
export const SkillsUsed = (message: Message, t: TFunction = globalT): React.ReactNode => {
  if (!message?.content && !message?.metadata?.toolCalls?.length) return null;

  const blocks = parseSkillBlocks(message.content || "");
  const loaded = (message.metadata?.toolCalls || [])
    .filter(call => call.name === SKILL_TOOL_NAME)
    .map(call => skillOfArgs(call.args));
  const ids = [...new Set([...loaded, ...blocks.map(block => block.skillId)])].filter(Boolean);
  if (!ids.length) return null;

  return (
    <>
      <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
        <IconWand size={16} className="message-details-icon" />
        <Text fw={600} size="sm">
          {t("messageDetails.skillsUsed")}
        </Text>
      </Group>
      <div className="message-details-content">
        {ids.map(id => {
          const files = blocks.filter(block => block.skillId === id).map(block => block.fileName);
          return (
            <Text key={id} size="xs">
              <b>{id}</b>
              {files.length ? ` → ${files.join(", ")}` : ""}
            </Text>
          );
        })}
      </div>
    </>
  );
};
