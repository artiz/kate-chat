import React from "react";
import { Container, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ApplicationSettings } from "@/components/settings";

interface IProps {
  onReloadAppData?: () => void;
}

export const Settings = ({ onReloadAppData }: IProps) => {
  const { t } = useTranslation();

  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="lg">
        {t("settings.title")}
      </Title>

      <ApplicationSettings onReloadAppData={onReloadAppData} />
    </Container>
  );
};
