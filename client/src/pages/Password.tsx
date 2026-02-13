import React from "react";
import { Container, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PasswordSettings as PasswordSettingsComponent } from "@/components/settings/PasswordSettings";

export const Password: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="lg">
        {t("auth.password")}
      </Title>
      <PasswordSettingsComponent />
    </Container>
  );
};
