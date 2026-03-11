import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { TextInput, Button, Stack, Container, Title, Paper, Text, Anchor, Alert } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { FORGOT_PASSWORD_MUTATION } from "../store/services/graphql.queries";
import { RECAPTCHA_SITE_KEY } from "@/lib/config";

const ForgotPasswordForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [sent, setSent] = useState(false);

  const [forgotPassword, { loading }] = useMutation(FORGOT_PASSWORD_MUTATION, {
    onCompleted: response => {
      if (response.forgotPassword?.success) {
        setSent(true);
      } else {
        notifications.show({
          title: t("common.error"),
          message: response.forgotPassword?.error || t("validation.invalidEmail"),
          color: "red",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message,
        color: "red",
      });
    },
  });

  const form = useForm({
    initialValues: { email: "" },
    validate: {
      email: (value: string) => (/^\S+@\S+$/.test(value) ? null : t("validation.invalidEmail")),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    const recaptchaToken = executeRecaptcha ? await executeRecaptcha("forgot_password") : undefined;
    await forgotPassword({ variables: { input: { email: values.email, recaptchaToken } } });
  };

  if (sent) {
    return (
      <Container size="sm" my={40}>
        <Paper withBorder shadow="md" p={30} mt={30} radius="md">
          <Alert icon={<IconCheck />} color="green" title={t("auth.resetEmailSent")}>
            {t("auth.resetEmailSentMessage")}
          </Alert>
          <Text ta="center" mt="md">
            <Anchor component="button" onClick={() => navigate("/login")}>
              {t("auth.backToLogin")}
            </Anchor>
          </Text>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size="sm" my={40}>
      <Title ta="center" fw={900}>
        {t("auth.forgotPasswordTitle")}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {t("auth.forgotPasswordSubtitle")}
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              label={t("auth.email")}
              placeholder={t("auth.emailPlaceholder")}
              required
              {...form.getInputProps("email")}
            />
          </Stack>

          <Button type="submit" size="md" mt="xl" fullWidth loading={loading}>
            {t("auth.sendResetLink")}
          </Button>

          <Text ta="center" mt="md">
            <Anchor component="button" onClick={() => navigate("/login")}>
              {t("auth.backToLogin")}
            </Anchor>
          </Text>
        </form>
      </Paper>
    </Container>
  );
};

const ForgotPassword: React.FC = () => (
  <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
    <ForgotPasswordForm />
  </GoogleReCaptchaProvider>
);

export default ForgotPassword;
