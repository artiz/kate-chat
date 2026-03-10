import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@apollo/client";
import { useForm } from "@mantine/form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PasswordInput, Button, Stack, Container, Title, Paper, Text, Alert, Badge, Group } from "@mantine/core";
import { IconAlertCircle, IconClock } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { RESET_PASSWORD_MUTATION } from "../store/services/graphql.queries";
import { loginSuccess } from "@/store/slices/authSlice";
import { setUser } from "@/store/slices/userSlice";
import { useAppDispatch } from "@/store";

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

const ResetPassword: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const exp = useMemo(() => decodeJwtPayload(token)?.exp, [token]);
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 0
  );

  useEffect(() => {
    if (!exp) return;
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, exp - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [exp]);

  const isExpired = secondsLeft === 0;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;

  const [resetPassword, { loading }] = useMutation(RESET_PASSWORD_MUTATION, {
    onCompleted: data => {
      dispatch(loginSuccess(data.resetPassword.token));
      dispatch(setUser(data.resetPassword.user));
      notifications.show({
        title: t("auth.passwordResetSuccess"),
        message: t("auth.passwordResetSuccessMessage"),
        color: "green",
      });
      navigate("/chat", { replace: true });
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
    initialValues: { password: "", confirmPassword: "" },
    validate: {
      password: (value: string) => (value.length >= 8 ? null : t("validation.passwordMinLength")),
      confirmPassword: (value: string, values) =>
        value === values.password ? null : t("validation.passwordsDoNotMatch"),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    await resetPassword({ variables: { input: { token, newPassword: values.password } } });
  };

  if (!token) {
    return (
      <Container size="sm" my={40}>
        <Alert icon={<IconAlertCircle />} color="red" title={t("common.error")}>
          {t("auth.resetTokenMissing")}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="sm" my={40}>
      <Title ta="center" fw={900}>
        {t("auth.resetPasswordTitle")}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {t("auth.resetPasswordSubtitle")}
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {isExpired ? (
          <Alert icon={<IconAlertCircle />} color="red" title={t("auth.resetLinkExpired")}>
            {t("auth.resetLinkExpiredMessage")}
          </Alert>
        ) : (
          <>
            <Group justify="flex-end" mb="md">
              <Badge leftSection={<IconClock size={12} />} color="orange" variant="light">
                {countdown}
              </Badge>
            </Group>

            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack>
                <PasswordInput
                  label={t("password.newPassword")}
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                  {...form.getInputProps("password")}
                />
                <PasswordInput
                  label={t("auth.confirmPassword")}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  required
                  {...form.getInputProps("confirmPassword")}
                />
              </Stack>

              <Button type="submit" size="md" mt="xl" fullWidth loading={loading}>
                {t("auth.setNewPassword")}
              </Button>
            </form>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default ResetPassword;
