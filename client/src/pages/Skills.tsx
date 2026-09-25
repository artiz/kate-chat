import React from "react";
import { useTranslation } from "react-i18next";
import { Container, Title } from "@mantine/core";
import { SkillsAdmin } from "@/components/admin/SkillsAdmin";

export const Skills: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="lg">
        {t("skills.title")}
      </Title>
      <SkillsAdmin />
    </Container>
  );
};
