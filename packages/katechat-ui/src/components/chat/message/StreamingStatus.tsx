import React, { useMemo } from "react";
import { ResponseStatus } from "@/core";
import { parseMarkdown } from "@/lib";
import { Alert, Box, Loader } from "@mantine/core";
import { IconProgressBolt } from "@tabler/icons-react";

interface IProps {
  content?: string;
  status?: ResponseStatus;
  statusInfo?: string;
  streaming: boolean;
}

export const StreamingStatus = ({ content, status, statusInfo, streaming }: IProps) => {
  const cmp = useMemo(() => {
    if (!streaming) {
      return null;
    }

    if (!content && (!statusInfo || status !== ResponseStatus.REASONING)) {
      return <Loader size="md" mb="md" color="gray" />;
    }

    if (status !== ResponseStatus.REASONING) {
      return null;
    }

    const parts = parseMarkdown(statusInfo);
    return (
      <Alert color="gray" icon={<IconProgressBolt size="1rem" />}>
        {parts.map((part, index) => (
          <Box fz="13" key={index}>
            <div dangerouslySetInnerHTML={{ __html: part }} />
          </Box>
        ))}
      </Alert>
    );
  }, [content, status, statusInfo, streaming]);

  return cmp;
};

StreamingStatus.displayName = "ReasoningStatus";
