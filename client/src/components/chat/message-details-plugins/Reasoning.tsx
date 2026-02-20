import React, { Fragment } from "react";
import { Text, Box, Group } from "@mantine/core";
import { Message } from "@/types/graphql";
import { IconProgressBolt } from "@tabler/icons-react";
import { assert, formatDate, parseMarkdown } from "@katechat/ui";
import { TFunction, t as globalT } from "i18next";

export const Reasoning = (message: Message, t: TFunction = globalT): React.ReactNode => {
  if (!message || !message.metadata) return null;

  const chunks = message.metadata.reasoning;
  if (!chunks?.length) return null;
  const detailsNodes: React.ReactNode[] = [];

  const reasoningBlocks = chunks
    .filter(ch => ch.text?.trim())
    .filter(assert.notEmpty)
    .map(ch => ({
      ...ch,
      html: parseMarkdown(ch.text),
    }));

  if (!reasoningBlocks.length) return null;

  const cmp = (
    <Fragment key="reasoning">
      <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
        <IconProgressBolt size={16} />
        <Text fw={600} size="sm">
          {t("messageDetails.reasoning")}
        </Text>
      </Group>

      <div className="message-details-content">
        {reasoningBlocks.map((block, idx) => (
          <div key={idx}>
            {block.timestamp && (
              <Text size="xs" c="dimmed" mt="sm">
                {formatDate(block.timestamp)}
              </Text>
            )}
            {block?.html?.map((content, idx) => (
              <Box key={idx} fz="12" dangerouslySetInnerHTML={{ __html: content }} />
            ))}
          </div>
        ))}
      </div>
    </Fragment>
  );

  detailsNodes.push(cmp);

  return detailsNodes;
};
