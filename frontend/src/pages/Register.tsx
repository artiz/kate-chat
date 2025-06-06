import React, { useEffect } from "react";
import { useMutation } from "@apollo/client";
import { useForm } from "@mantine/form";
import { REGISTER_MUTATION } from "../store/services/graphql";
import { useNavigate } from "react-router-dom";
import { TextInput, PasswordInput, Button, Group, Stack, Container, Title, Paper, Text, Anchor } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAppDispatch, useAppSelector } from "../store";
import { loginStart, loginSuccess, loginFailure } from "../store/slices/authSlice";

// Registration mutation is imported from graphql.ts

const Register: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector(state => state.auth.isAuthenticated);

  // If already authenticated, redirect to chat
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat");
    }
  }, [isAuthenticated, navigate]);

  // Define register mutation
  const [register, { loading }] = useMutation(REGISTER_MUTATION, {
    onCompleted: data => {
      dispatch(loginSuccess(data.register.token));
      navigate("/chat");
    },
    onError: error => {
      dispatch(loginFailure());
      notifications.show({
        title: "Registration Failed",
        message: error.message || "Failed to register. Please try again.",
        color: "red",
      });
    },
  });

  // Form definition
  const form = useForm({
    initialValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
    validate: {
      email: value => (/^\S+@\S+$/.test(value) ? null : "Invalid email"),
      password: value => (value.length < 8 ? "Password must be at least 8 characters" : null),
      confirmPassword: (value, values) => (value !== values.password ? "Passwords do not match" : null),
      firstName: value => (value.length === 0 ? "First name is required" : null),
      lastName: value => (value.length === 0 ? "Last name is required" : null),
    },
  });

  // Handle form submission
  const handleSubmit = async (values: typeof form.values) => {
    dispatch(loginStart());
    await register({
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

  return (
    <Container size={420} my={40}>
      <Title ta="center" fw={900}>
        Create an Account
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Register to start using KateChat
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput label="Email" placeholder="you@example.com" required {...form.getInputProps("email")} />

            <Group grow>
              <TextInput
                label="First Name"
                placeholder="Your first name"
                required
                {...form.getInputProps("firstName")}
              />
              <TextInput label="Last Name" placeholder="Your last name" required {...form.getInputProps("lastName")} />
            </Group>

            <PasswordInput label="Password" placeholder="Your password" required {...form.getInputProps("password")} />

            <PasswordInput
              label="Confirm Password"
              placeholder="Confirm your password"
              required
              {...form.getInputProps("confirmPassword")}
            />
          </Stack>

          <Button type="submit" fullWidth mt="xl" loading={loading}>
            Register
          </Button>

          <Text ta="center" mt="md">
            Already have an account?{" "}
            <Anchor component="button" type="button" onClick={() => navigate("/login")}>
              Sign in
            </Anchor>
          </Text>
        </form>
      </Paper>
    </Container>
  );
};

export default Register;
