import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { Container, Title, Text, Group, Anchor } from "@mantine/core";
import { getUserIdFromToken, loginSuccess } from "@/store/slices/authSlice";
import { getStorageValue, removeStorageValue, STORAGE_RETURN_URL_KEY } from "@/store";
import { set } from "lodash";

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
      const userId = getUserIdFromToken(token);
      const url = getStorageValue(STORAGE_RETURN_URL_KEY, userId, false) || "/chat";
      setTimeout(() => removeStorageValue(STORAGE_RETURN_URL_KEY, userId, false), 500);
      navigate(url);
    } else {
      navigate("/login");
    }
  }, [token]);

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
