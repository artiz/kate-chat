import React, { Fragment } from "react";
import { Text, Box, Group } from "@mantine/core";
import { Message } from "@/types/graphql";
import { IconCode } from "@tabler/icons-react";
import { parseMarkdown } from "@katechat/ui";
import { TFunction, t as globalT } from "i18next";

export const CodeInterpreterCall = (message: Message, t: TFunction = globalT): React.ReactNode => {
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

  const cmp = (
    <Fragment key="code-interpreter">
      <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
        <IconCode size={16} />
        <Text fw={600} size="sm">
          {t("messageDetails.codeInterpreter")}
        </Text>
      </Group>

      <div className="message-details-content">
        {html.map((content, idx) => (
          <div key={idx}>
            <Box fz="12" dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        ))}
      </div>
    </Fragment>
  );

  detailsNodes.push(cmp);

  return detailsNodes;
};
