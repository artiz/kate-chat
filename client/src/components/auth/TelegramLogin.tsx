import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Anchor, Button, Group, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { APP_API_URL } from "@/lib/config";
import { useAppSelector } from "@/store";
import { MCPServer } from "@/types/graphql";

/** Where Telegram delivered the login code: the account's apps, SMS, or its login email. */
type CodeChannel = "app" | "sms" | "email";

type Step =
  | { name: "phone" }
  | { name: "code"; loginSession: string; phoneCodeHash: string; via: CodeChannel; emailPattern?: string }
  | { name: "password"; loginSession: string; hint?: string };

/**
 * The login routes live next to the MCP endpoint, /mcp/<name>/auth. Only the name is taken from the
 * server's URL: that URL is the one the API calls itself by, and its path depends on the deployment
 * (with or without a proxy prefix), while APP_API_URL is how this browser reaches the API.
 */
const mcpName = (server: MCPServer) => new URL(server.url).pathname.split("/").filter(Boolean).pop();

interface TelegramLoginProps {
  server: MCPServer;
  /** Receives the account's session string, which from then on is this server's token. */
  onSuccess: (session: string) => void;
}

/**
 * Telegram signs in by phone, the code it sends to the account's apps, and the cloud password when
 * two-step verification is on. The API runs each step and returns the session to resume from; the
 * finished session is kept in this browser like any other MCP token and never stored server-side.
 */
export const TelegramLogin: React.FC<TelegramLoginProps> = ({ server, onSuccess }) => {
  const { t } = useTranslation();
  const userToken = useAppSelector(state => state.auth.token);
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const call = async (path: string, body: object): Promise<Record<string, any> | undefined> => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`${APP_API_URL}/mcp/${mcpName(server)}/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText);
        return undefined;
      }
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  const finish = (data: Record<string, any>) => {
    if (data.passwordRequired) {
      setStep({ name: "password", loginSession: data.loginSession, hint: data.hint });
      return;
    }
    notifications.show({ message: t("mcp.telegram.connected", { name: data.user?.name }), color: "green" });
    onSuccess(data.session);
  };

  const sendCode = async () => {
    const data = await call("send-code", { phone });
    if (data) {
      setCode("");
      setStep({
        name: "code",
        loginSession: data.loginSession,
        phoneCodeHash: data.phoneCodeHash,
        via: data.via,
        emailPattern: data.emailPattern,
      });
    }
  };

  const signIn = async () => {
    if (step.name !== "code") return;
    const data = await call("sign-in", {
      loginSession: step.loginSession,
      phoneCodeHash: step.phoneCodeHash,
      phone,
      code,
      via: step.via,
    });
    if (data) finish(data);
  };

  const checkPassword = async () => {
    if (step.name !== "password") return;
    const data = await call("password", { loginSession: step.loginSession, password });
    if (data) finish(data);
  };

  const submitOnEnter = (submit: () => void, enabled: boolean) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && enabled && !loading) submit();
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t("mcp.telegram.intro")}
      </Text>

      {step.name === "phone" && (
        <>
          <TextInput
            label={t("mcp.telegram.phone")}
            placeholder={t("mcp.telegram.phonePlaceholder")}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={e => setPhone(e.currentTarget.value)}
            onKeyDown={submitOnEnter(sendCode, !!phone.trim())}
            autoFocus
          />
          <Group justify="flex-end">
            <Button onClick={sendCode} loading={loading} disabled={!phone.trim()}>
              {t("mcp.telegram.sendCode")}
            </Button>
          </Group>
        </>
      )}

      {step.name === "code" && (
        <>
          <Text size="sm">
            {step.via === "email"
              ? t("mcp.telegram.codeSentEmail", { email: step.emailPattern || "" })
              : step.via === "app"
                ? t("mcp.telegram.codeSentApp")
                : t("mcp.telegram.codeSentSms")}
          </Text>
          <TextInput
            label={t("mcp.telegram.code")}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.currentTarget.value)}
            onKeyDown={submitOnEnter(signIn, !!code.trim())}
            autoFocus
          />
          <Group justify="space-between">
            <Anchor component="button" size="sm" onClick={() => setStep({ name: "phone" })}>
              {t("mcp.telegram.changeNumber")}
            </Anchor>
            <Button onClick={signIn} loading={loading} disabled={!code.trim()}>
              {t("mcp.telegram.signIn")}
            </Button>
          </Group>
        </>
      )}

      {step.name === "password" && (
        <>
          <Text size="sm">{t("mcp.telegram.passwordRequired")}</Text>
          {step.hint && (
            <Text size="sm" c="dimmed">
              {t("mcp.telegram.passwordHint", { hint: step.hint })}
            </Text>
          )}
          <PasswordInput
            label={t("mcp.telegram.password")}
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.currentTarget.value)}
            onKeyDown={submitOnEnter(checkPassword, !!password)}
            autoFocus
          />
          <Group justify="flex-end">
            <Button onClick={checkPassword} loading={loading} disabled={!password}>
              {t("mcp.telegram.signIn")}
            </Button>
          </Group>
        </>
      )}

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
};
