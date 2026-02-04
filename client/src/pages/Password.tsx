import React from "react";
import { Container, Title } from "@mantine/core";
import { PasswordSettings as PasswordSettingsComponent } from "@/components/settings/PasswordSettings";

export const Password: React.FC = () => {
  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="lg">
        Password
      </Title>
      <PasswordSettingsComponent />
    </Container>
  );
};
