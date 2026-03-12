import React, { Fragment } from "react";
import { Text, Group, Anchor } from "@mantine/core";
import { Message } from "@/types/graphql";
import { IconAddressBook, IconFile, IconWorldSearch } from "@tabler/icons-react";
import { TFunction, t as globalT } from "i18next";

const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const Annotations = (message: Message, t: TFunction = globalT): React.ReactNode => {
  if (!message || !message.metadata) return null;

  const annotations = message.metadata.annotations || [];
  if (!annotations.length) return null;

  const detailsNodes: React.ReactNode[] = [];

  const cmp = (
    <Fragment key={`annotations-${message.id}`}>
      <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
        <IconAddressBook size={16} className="message-details-icon" />
        <Text fw={600} size="sm">
          {t("messageDetails.annotations")}
        </Text>
      </Group>

      <div className="message-details-content">
        {annotations.map((entry, idx) => {
          const { title, source, type } = entry;

          if (type === "url") {
            return (
              <Group key={idx} align="center">
                <IconWorldSearch size={12} />{" "}
                {source ? (
                  isSafeUrl(source) ? (
                    <Anchor href={source} target="_blank" rel="noopener noreferrer" size="xs">
                      {entry.title || source}
                    </Anchor>
                  ) : (
                    <Text size="xs">{source}</Text>
                  )
                ) : (
                  <Text size="xs">{title || source || `#${idx + 1}`}</Text>
                )}
              </Group>
            );
          } else if (["file", "file_path", "container_file"].includes(type) && source) {
            return (
              <Group key={idx} align="center">
                <IconFile size={12} /> {title && <Text size="xs">{title || `#${idx + 1}`}&nbsp;</Text>}
                <Text size="xs">{source}</Text>
              </Group>
            );
          }

          return null;
        })}
      </div>
    </Fragment>
  );

  detailsNodes.push(cmp);

  return detailsNodes;
};
