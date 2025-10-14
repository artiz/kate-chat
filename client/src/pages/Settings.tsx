import React from "react";
import { Container, Title } from "@mantine/core";
import { ApplicationSettings } from "@/components/settings";

interface IProps {
  onReloadAppData?: () => void;
}

export const Settings = ({ onReloadAppData }: IProps) => {
  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl">
        Settings
      </Title>

      <ApplicationSettings onReloadAppData={onReloadAppData} />
    </Container>
  );
};
