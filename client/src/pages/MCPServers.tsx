import React from "react";
import { useTranslation } from "react-i18next";
import { Container, Title } from "@mantine/core";
import { MCPServersAdmin } from "@/components/admin/MCPServersAdmin";

export const MCPServers: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="lg">
        {t("mcp.title")}
      </Title>
      <MCPServersAdmin />
    </Container>
  );
};
