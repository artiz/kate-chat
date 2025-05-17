"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gql, useMutation } from "@apollo/client";
import {
  TextInput,
  PasswordInput,
  Checkbox,
  Anchor,
  Paper,
  Title,
  Text,
  Container,
  Group,
  Button,
  Divider,
  Stack,
} from "@mantine/core";
import { useForm, zodResolver } from "@mantine/form";
import { z } from "zod";
import { notifications } from "@mantine/notifications";

// Define login mutation
const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      user {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

// Define register mutation
const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      token
      user {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

// Form validation schema
const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email" }),
  password: z.string().min(6, { message: "Password should be at least 6 characters" }),
  rememberMe: z.boolean().optional(),
});

const registerSchema = loginSchema
  .extend({
    firstName: z.string().min(2, { message: "First name should be at least 2 characters" }),
    lastName: z.string().min(2, { message: "Last name should be at least 2 characters" }),
    confirmPassword: z.string().min(6, { message: "Password should be at least 6 characters" }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export default function LoginPage() {
  const router = useRouter();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Login mutation
  const [login, { loading: loginLoading }] = useMutation(LOGIN_MUTATION, {
    onCompleted: data => {
      // Save token to local storage
      localStorage.setItem("auth-token", data.login.token);

      // Save user data (can be stored in context or other state management)
      localStorage.setItem("user-data", JSON.stringify(data.login.user));

      // Show success notification
      notifications.show({
        title: "Login successful",
        message: "Welcome back!",
        color: "green",
      });

      // Redirect to chat page
      router.push("/chat");
    },
    onError: error => {
      notifications.show({
        title: "Login failed",
        message: error.message,
        color: "red",
      });
    },
  });

  // Register mutation
  const [register, { loading: registerLoading }] = useMutation(REGISTER_MUTATION, {
    onCompleted: data => {
      // Save token to local storage
      localStorage.setItem("auth-token", data.register.token);

      // Save user data
      localStorage.setItem("user-data", JSON.stringify(data.register.user));

      // Show success notification
      notifications.show({
        title: "Registration successful",
        message: "Welcome to KateChat!",
        color: "green",
      });

      // Redirect to chat page
      router.push("/chat");
    },
    onError: error => {
      notifications.show({
        title: "Registration failed",
        message: error.message,
        color: "red",
      });
    },
  });

  // Initialize form
  const loginForm = useForm({
    initialValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    validate: zodResolver(loginSchema),
  });

  // Initialize register form
  const registerForm = useForm({
    initialValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      rememberMe: false,
    },
    validate: zodResolver(registerSchema),
  });

  // Handle login form submission
  const handleLoginSubmit = (values: typeof loginForm.values) => {
    login({
      variables: {
        input: {
          email: values.email,
          password: values.password,
        },
      },
    });
  };

  // Handle register form submission
  const handleRegisterSubmit = (values: typeof registerForm.values) => {
    register({
      variables: {
        input: {
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
        },
      },
    });
  };

  // Toggle between login and register mode
  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
  };

  // Check if form is loading
  const isLoading = loginLoading || registerLoading;

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome to KateChat</Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {isRegisterMode ? "Already have an account?" : "Do not have an account yet?"}{" "}
        <Anchor size="sm" component="button" onClick={toggleMode}>
          {isRegisterMode ? "Login" : "Create account"}
        </Anchor>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {isRegisterMode ? (
          <form onSubmit={registerForm.onSubmit(handleRegisterSubmit)}>
            <Stack>
              <Group grow>
                <TextInput
                  label="First name"
                  placeholder="Your first name"
                  required
                  {...registerForm.getInputProps("firstName")}
                />
                <TextInput
                  label="Last name"
                  placeholder="Your last name"
                  required
                  {...registerForm.getInputProps("lastName")}
                />
              </Group>

              <TextInput label="Email" placeholder="your@email.com" required {...registerForm.getInputProps("email")} />

              <PasswordInput
                label="Password"
                placeholder="Your password"
                required
                {...registerForm.getInputProps("password")}
              />

              <PasswordInput
                label="Confirm Password"
                placeholder="Confirm your password"
                required
                {...registerForm.getInputProps("confirmPassword")}
              />

              <Checkbox label="Remember me" {...registerForm.getInputProps("rememberMe", { type: "checkbox" })} />

              <Button fullWidth mt="xl" type="submit" loading={isLoading}>
                Register
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={loginForm.onSubmit(handleLoginSubmit)}>
            <Stack>
              <TextInput label="Email" placeholder="your@email.com" required {...loginForm.getInputProps("email")} />

              <PasswordInput
                label="Password"
                placeholder="Your password"
                required
                {...loginForm.getInputProps("password")}
              />

              <Group justify="space-between">
                <Checkbox label="Remember me" {...loginForm.getInputProps("rememberMe", { type: "checkbox" })} />
                <Anchor size="sm" component="button">
                  Forgot password?
                </Anchor>
              </Group>

              <Button fullWidth mt="xl" type="submit" loading={isLoading}>
                Sign in
              </Button>
            </Stack>
          </form>
        )}
      </Paper>
    </Container>
  );
}
