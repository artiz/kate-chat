import { MantineColorsTuple } from "@mantine/core";

let customization = {};
try {
  // Attempt to load customization.json if it exists
  customization = require("../customization.json");
} catch (error) {
  console.debug("No customization.json found, using default client configuration.");
}

export type NavLinkIcon = "cv" | "github" | "network" | "link";

export interface ClientNavLink {
  tooltip: string;
  url: string;
  color?: string;
  icon: NavLinkIcon;
}

export interface ClientConfig {
  theme: {
    primaryColor?: string;
    colors?: Record<string, MantineColorsTuple>;
    defaultRadius?: "0" | "xs" | "sm" | "md" | "lg" | "xl";
    fontFamily?: string;
  };
  appTitle: string;
  navLinks?: ClientNavLink[];
  aiUsageAlert?: string;
}

const defaultConfig: ClientConfig = {
  theme: {
    primaryColor: "brand",
    colors: {
      brand: [
        "#ecf4ff",
        "#dce4f5",
        "#b9c7e2",
        "#94a8d0",
        "#748dc0",
        "#5f7cb7",
        "#5474b4",
        "#44639f",
        "#3a5890",
        "#2c4b80",
      ],
      green: [
        "#effaf3",
        "#dff3e6",
        "#b9e6c8",
        "#91daa9",
        "#70cf8e",
        "#5bc97d",
        "#4fc674",
        "#40ae62",
        "#369b56",
        "#1f6938",
      ],
      red: [
        "#ffeaec",
        "#fcd4d7",
        "#f4a7ac",
        "#ec777e",
        "#e64f57",
        "#e3353f",
        "#e22732",
        "#c91a25",
        "#b41220",
        "#9e0419",
      ],
      blue: [
        "#eef6fb",
        "#dde9f2",
        "#b6d2e6",
        "#8cbadb",
        "#6ba6d1",
        "#5799cc",
        "#4b93ca",
        "#3c7fb3",
        "#3171a1",
        "#194f73",
      ],
    },
    fontFamily: `"Noto Sans", "Segoe UI", system-ui`,
    defaultRadius: "md",
  },
  appTitle: "KateChat",
  navLinks: [
    { tooltip: "Project GitHub Repository", url: "https://github.com/artiz/kate-chat", color: "dark", icon: "github" },
    { tooltip: "Author's CV", url: "https://artiz.github.io/", color: "indigo", icon: "cv" },
  ],
  aiUsageAlert: "AI-generated, for reference only.",
};

let clientConfig: ClientConfig = { ...defaultConfig };

function mergeDeep<T>(target: T, source?: Partial<T>): T {
  if (!source) return target;
  const output: any = Array.isArray(target)
    ? [...(Array.isArray(source) ? (source as any[]) : (target as any[]))]
    : { ...target };
  Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined) return;
    const current = (output as any)[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      (output as any)[key] = mergeDeep(current, value as any);
    } else {
      (output as any)[key] = value;
    }
  });
  return output as T;
}

clientConfig = mergeDeep(clientConfig, customization as unknown as ClientConfig);

export function getClientConfig(): ClientConfig {
  return clientConfig;
}

export function getClientNavLinks(): ClientNavLink[] {
  return clientConfig.navLinks || [];
}
