import React from "react";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Accordion, Alert, Badge, Center, Code, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconBrandPython, IconBrandTypescript, IconInfoCircle, IconLock } from "@tabler/icons-react";
import { GET_SKILLS } from "@/store/services/graphql.queries";
import { Skill } from "@/types/graphql";

/**
 * Skills as the server loaded them from resources/skills. Read-only on purpose: they change only with
 * a deployment, so the instructions and scripts shown here are exactly what the model is given and
 * what the browser runs.
 */
export const SkillsAdmin: React.FC = () => {
  const { t } = useTranslation();
  const { data, loading, error } = useQuery<{ skills: Skill[] }>(GET_SKILLS, { fetchPolicy: "cache-and-network" });
  const skills = data?.skills || [];

  if (loading && !data) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Alert variant="light" icon={<IconLock size={18} />}>
        {t("skills.adminDescription")}
      </Alert>
      {error && (
        <Alert color="red" icon={<IconInfoCircle size={18} />}>
          {error.message}
        </Alert>
      )}
      {!skills.length && !error && <Text c="dimmed">{t("skills.noSkills")}</Text>}

      <Accordion variant="separated" multiple>
        {skills.map(skill => (
          <Accordion.Item key={skill.id} value={skill.id}>
            <Accordion.Control
              icon={skill.runtime === "python" ? <IconBrandPython size={20} /> : <IconBrandTypescript size={20} />}
            >
              <Group gap="xs" wrap="nowrap">
                <Text fw={500}>{skill.name}</Text>
                <Badge variant="light" color="gray">
                  {skill.id}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {skill.description}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    {t("skills.runtime")}:
                  </Text>
                  <Badge variant="outline">{skill.runtime}</Badge>
                  <Text size="sm" fw={500} ml="md">
                    {t("skills.packages")}:
                  </Text>
                  {skill.packages.length ? (
                    skill.packages.map(pkg => (
                      <Badge key={pkg} variant="light">
                        {pkg}
                      </Badge>
                    ))
                  ) : (
                    <Text size="sm" c="dimmed">
                      {t("skills.noPackages")}
                    </Text>
                  )}
                </Group>

                <Title order={6}>{t("skills.instructions")}</Title>
                <Code block style={{ whiteSpace: "pre-wrap" }}>
                  {skill.instructions}
                </Code>

                {skill.files.length > 0 && <Title order={6}>{t("skills.scripts")}</Title>}
                {skill.files.map(file => (
                  <Stack key={file.path} gap={4}>
                    <Text size="sm" ff="monospace" c="dimmed">
                      scripts/{file.path}
                    </Text>
                    <Code block mah={480} style={{ overflow: "auto" }}>
                      {file.content}
                    </Code>
                  </Stack>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
};
