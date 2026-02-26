import React, { useEffect } from "react";
import { useMutation } from "@apollo/client";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { LOGIN_MUTATION } from "../store/services/graphql.queries";
import {
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Container,
  Title,
  Paper,
  Text,
  Anchor,
  Loader,
  Center,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { logout, useAppDispatch, useAppSelector } from "../store";
import { loginStart, loginSuccess, loginFailure } from "../store/slices/authSlice";
import { OAuthButtons } from "../components/auth";
import { setUser } from "@/store/slices/userSlice";
import { getClientConfig } from "@/global-config";

const Login: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  const [loggingIn, setLoggingIn] = React.useState(false);
  const { appTitle } = getClientConfig();
  const { t } = useTranslation();

  // If already authenticated, redirect to chat
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat");
    }
  }, [isAuthenticated, navigate]);

  // Define login mutation
  const [login, { loading }] = useMutation(LOGIN_MUTATION, {
    onCompleted: data => {
      dispatch(loginSuccess(data.login.token));
      dispatch(setUser(data.login.user));
      navigate("/chat");
    },
    onError: error => {
      dispatch(logout());
      dispatch(loginFailure());
      notifications.show({
        title: t("auth.loginFailed"),
        message: error.message || t("auth.loginFailedMessage"),
        color: "red",
      });
    },
  });

  // Form definition
  const form = useForm({
    initialValues: {
      email: "",
      password: "",
    },
    validate: {
      email: (value: string) => (/^\S+@\S+$/.test(value) ? null : t("validation.invalidEmail")),
      password: (value: string) => (value.length > 0 ? null : t("validation.passwordRequired")),
    },
  });

  // Handle form submission
  const handleSubmit = async (values: typeof form.values) => {
    dispatch(loginStart());
    await login({
      variables: {
        input: {
          email: values.email,
          password: values.password,
        },
      },
    });
  };

  return (
    <Container size="sm" my={40}>
      <Title ta="center" fw={900}>
        {t("auth.welcomeTo", { appTitle })}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {t("auth.signInSubtitle")}
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

            <PasswordInput
              label={t("auth.password")}
              placeholder={t("auth.passwordPlaceholder")}
              required
              {...form.getInputProps("password")}
            />
          </Stack>

          {/* <Group justify="space-between" mt="lg">
            <Anchor component="button" type="button" c="dimmed" size="sm">
              Forgot password?
            </Anchor>
          </Group> */}

          <Button type="submit" size="md" mt="xl" loading={loading} disabled={loggingIn}>
            {t("auth.signIn")}
          </Button>

          <OAuthButtons variant="light" onLogin={() => setLoggingIn(true)} />
          <Center mt="md">{loggingIn && <Loader size="md" />}</Center>

          {!loggingIn && (
            <Text ta="center" mt="md">
              {t("auth.noAccount")}{" "}
              <Anchor component="button" type="button" onClick={() => navigate("/register")} disabled={loggingIn}>
                {t("auth.register")}
              </Anchor>
            </Text>
          )}
        </form>
      </Paper>
    </Container>
  );
};

export default Login;
