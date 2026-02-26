import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { loginSuccess } from "../../store/slices/authSlice";
import { useTranslation } from "react-i18next";
import { Container, Title, Text, Group, Anchor } from "@mantine/core";

const OAuthCallbackHandler: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      // Store the token and redirect to home page
      dispatch(loginSuccess(token));
      navigate("/");
    } else {
      navigate("/login", { replace: true });
    }
  }, [token, dispatch, navigate]);

  return (
    <Container size="sm" my={40}>
      <Title ta="center" fw={900}>
        {t("auth.authenticating")}
      </Title>
      <Group justify="center" mt="xl">
        <Text c="dimmed" size="sm" mt={5}>
          {t("auth.authenticatingMessage")}{" "}
          <Anchor component="button" type="button" onClick={() => navigate("/login")}>
            {t("auth.signIn")}
          </Anchor>
        </Text>
      </Group>
    </Container>
  );
};

export default OAuthCallbackHandler;
