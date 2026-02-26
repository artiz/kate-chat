import React, { useEffect } from "react";
import { useMutation } from "@apollo/client";
import { useForm } from "@mantine/form";
import { REGISTER_MUTATION } from "../store/services/graphql.queries";
import { useNavigate } from "react-router-dom";
import { TextInput, PasswordInput, Button, Group, Stack, Container, Title, Paper, Text, Anchor } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { logout, useAppDispatch, useAppSelector } from "../store";
import { loginStart, loginSuccess, loginFailure } from "../store/slices/authSlice";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { RECAPTCHA_SITE_KEY } from "../lib/config";
import { OAuthButtons } from "../components/auth";
import { setUser } from "@/store/slices/userSlice";
import { getClientConfig } from "@/global-config";

// Registration mutation is imported from graphql.ts

// Component that wraps the registration form with the reCAPTCHA provider
const RegisterWithReCaptcha: React.FC = () => {
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <RegisterForm />
    </GoogleReCaptchaProvider>
  );
};

interface RegisterFormProps {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
}

// Main registration form component
const RegisterForm: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);
  const { appTitle } = getClientConfig();
  const { t } = useTranslation();

  // If already authenticated, redirect to chat
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat");
    }
  }, [isAuthenticated, navigate]);

  // Define register mutation
  const [register, { loading }] = useMutation(REGISTER_MUTATION, {
    onCompleted: data => {
      dispatch(setUser(data.register.user));
      dispatch(loginSuccess(data.register.token));
      navigate("/chat");
    },
    onError: error => {
      dispatch(logout());
      dispatch(loginFailure());
      notifications.show({
        title: t("auth.registrationFailed"),
        message: error.message || t("auth.registrationFailedMessage"),
        color: "red",
      });
    },
  });

  // Form definition
  const form = useForm<RegisterFormProps>({
    initialValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
    validate: {
      email: (value: string) => (/^\S+@\S+$/.test(value) ? null : t("validation.invalidEmail")),
      password: (value: string) => (value.length < 8 ? t("validation.passwordMinLength") : null),
      confirmPassword: (value: string, values: RegisterFormProps) =>
        value !== values.password ? t("validation.passwordsDoNotMatch") : null,
      firstName: (value: string) => (value.length === 0 ? t("validation.firstNameRequired") : null),
      lastName: (value: string) => (value.length === 0 ? t("validation.lastNameRequired") : null),
    },
  });

  // Get reCAPTCHA
  const { executeRecaptcha } = useGoogleReCaptcha();

  // Handle form submission
  const handleSubmit = async (values: typeof form.values) => {
    if (!executeRecaptcha) {
      notifications.show({
        title: t("auth.recaptchaError"),
        message: t("auth.recaptchaNotLoaded"),
        color: "red",
      });
      return;
    }

    try {
      // Execute reCAPTCHA and get token
      const recaptchaToken = await executeRecaptcha("register");

      dispatch(loginStart());
      await register({
        variables: {
          input: {
            email: values.email,
            password: values.password,
            firstName: values.firstName,
            lastName: values.lastName,
            recaptchaToken, // Add the recaptcha token to the input
          },
        },
      });
    } catch (error) {
      dispatch(loginFailure());
      notifications.show({
        title: t("auth.registrationFailed"),
        message: t("auth.recaptchaVerificationError"),
        color: "red",
      });
    }
  };

  return (
    <Container size="sm" my={40}>
      <Title ta="center" fw={900}>
        {t("auth.createAccount")}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {t("auth.registerSubtitle", { appTitle })}
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              label={t("auth.email")}
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              required
              {...form.getInputProps("email")}
            />

            <Group grow>
              <TextInput
                label={t("auth.firstName")}
                placeholder={t("auth.firstNamePlaceholder")}
                required
                {...form.getInputProps("firstName")}
              />
              <TextInput
                label={t("auth.lastName")}
                placeholder={t("auth.lastNamePlaceholder")}
                required
                {...form.getInputProps("lastName")}
              />
            </Group>

            <PasswordInput
              label={t("auth.password")}
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

          <Button type="submit" size="md" mt="xl" loading={loading}>
            {t("auth.register")}
          </Button>

          <OAuthButtons />

          <Text ta="center" mt="md">
            {t("auth.haveAccount")}{" "}
            <Anchor component="button" type="button" onClick={() => navigate("/login")}>
              {t("auth.signIn")}
            </Anchor>
          </Text>
        </form>
      </Paper>
    </Container>
  );
};

export default RegisterWithReCaptcha;
