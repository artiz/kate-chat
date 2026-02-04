import React from "react";
import { Container, Title } from "@mantine/core";
import { MCPServersAdmin } from "@/components/admin/MCPServersAdmin";

export const MCPServers: React.FC = () => {
  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="lg">
        MCP Servers
      </Title>
      <MCPServersAdmin />
    </Container>
  );
};
