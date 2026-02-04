import React, { useState } from "react";
import { Container, Tabs, Title, Group } from "@mantine/core";
import { IconDashboard, IconPlugConnected } from "@tabler/icons-react";
import { AdminDashboard, MCPServersAdmin } from "@/components/admin";

export const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string | null>("dashboard");

  return (
    <Container size="xl" py="xl">
      <Title order={1} mb="xl">
        Administration
      </Title>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="dashboard" leftSection={<IconDashboard size="1rem" />}>
            Dashboard
          </Tabs.Tab>
          <Tabs.Tab value="mcp" leftSection={<IconPlugConnected size="1rem" />}>
            MCP Servers
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="dashboard">
          <AdminDashboard />
        </Tabs.Panel>

        <Tabs.Panel value="mcp">
          <MCPServersAdmin />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
};
