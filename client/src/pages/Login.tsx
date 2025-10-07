import React, { useEffect } from "react";
import { useMutation } from "@apollo/client";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { LOGIN_MUTATION } from "../store/services/graphql";
import { TextInput, PasswordInput, Button, Group, Stack, Container, Title, Paper, Text, Anchor } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { logout, useAppDispatch, useAppSelector } from "../store";
import { loginStart, loginSuccess, loginFailure } from "../store/slices/authSlice";
import { OAuthButtons } from "../components/auth";
import { setUser } from "@/store/slices/userSlice";

// Login mutation is imported from graphql.ts

const Login: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);

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
        title: "Login Failed",
        message: error.message || "Failed to login. Please try again.",
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
      email: (value: string) => (/^\S+@\S+$/.test(value) ? null : "Invalid email"),
      password: (value: string) => (value.length > 0 ? null : "Password is required"),
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
    <Container size={420} my={40}>
      <Title ta="center" fw={900}>
        Welcome to KateChat!
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Sign in to access your AI chats
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput label="Email" placeholder="you@example.com" required {...form.getInputProps("email")} />

            <PasswordInput label="Password" placeholder="Your password" required {...form.getInputProps("password")} />
          </Stack>

          <Group justify="space-between" mt="lg">
            <Anchor component="button" type="button" c="dimmed" size="sm">
              Forgot password?
            </Anchor>
          </Group>

          <Button type="submit" fullWidth mt="xl" loading={loading}>
            Sign in
          </Button>

          <OAuthButtons variant="light" />

          <Text ta="center" mt="md">
            Don't have an account?{" "}
            <Anchor component="button" type="button" onClick={() => navigate("/register")}>
              Register
            </Anchor>
          </Text>
        </form>
      </Paper>
    </Container>
  );
};

export default Login;
