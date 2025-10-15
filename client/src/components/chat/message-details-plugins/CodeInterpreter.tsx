import React from "react";
import { Text, Box, Group } from "@mantine/core";
import { Message } from "@/types/graphql";
import { IconCode } from "@tabler/icons-react";
import { parseMarkdown } from "@katechat/ui";
import { text } from "stream/consumers";

export const CodeInterpreterCall = (message: Message): React.ReactNode => {
  if (!message || !message.metadata) return null;

  const tools = message.metadata.tools || [];
  if (!tools.length) return null;
  const detailsNodes: React.ReactNode[] = [];

  const codeBlocks = tools
    .filter(tool => tool.name === "code_interpreter")
    .map(tool => tool.content?.trim())
    .filter(Boolean);
  if (!codeBlocks.length) return null;

  const html = codeBlocks
    .map(code => {
      if (!code.startsWith("```")) {
        code = "```python\n" + code + "\n```";
      }
      return code;
    })
    .flatMap(text => parseMarkdown(text));

  // parseMarkdown

  const cmp = (
    <>
      <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
        <IconCode size={16} />
        <Text fw={600} size="sm">
          Code Interpreter
        </Text>
      </Group>

      <div className="message-details-content">
        {html.map((content, idx) => (
          <div key={idx}>
            <Box fz="12" dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        ))}
      </div>
    </>
  );

  detailsNodes.push(cmp);

  return detailsNodes;
};
