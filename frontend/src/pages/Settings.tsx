import React from "react";
import { Container, Title } from "@mantine/core";
import { ApplicationSettings } from "@/components/settings";

export const Settings: React.FC = () => {
  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">
        Settings
      </Title>

      <ApplicationSettings />
    </Container>
  );
};
