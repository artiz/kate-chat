import React from "react";
import { Container, Tabs } from "@mantine/core";
import { IconPhoto, IconFileText } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ImageLibrary, ChatDataLibrary } from "../components/library";

export const Library: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "media";

  return (
    <Container size="lg" py="md">
      <Tabs value={tab} onChange={value => setSearchParams(value && value !== "media" ? { tab: value } : {})}>
        <Tabs.List>
          <Tabs.Tab value="media" leftSection={<IconPhoto size={16} />}>
            {t("library.tabMedia")}
          </Tabs.Tab>
          <Tabs.Tab value="chat-data" leftSection={<IconFileText size={16} />}>
            {t("library.tabChatData")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="media">
          <ImageLibrary />
        </Tabs.Panel>
        <Tabs.Panel value="chat-data" pt="lg">
          <ChatDataLibrary />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
};
