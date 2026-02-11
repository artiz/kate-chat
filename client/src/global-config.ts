export type NavLinkIcon = "cv" | "github" | "network" | "link";

export interface ClientNavLink {
  tooltip: string;
  url: string;
  color?: string;
  icon: NavLinkIcon;
}

export interface ClientConfig {
  theme: {
    brandColors: Record<string, string[]>;
    fontFamily: string;
  };
  appTitle: string;
  navLinks: ClientNavLink[];
  aiUsageAlert?: string;
}

const defaultConfig: ClientConfig = {
  theme: {
    brandColors: {
      brand: ["#fff0f6", "#ffe0ec", "#ffccd7", "#ffb3c2", "#ff99ab", "#ff8095", "#e65a74", "#cc3352", "#b31231", "#c00a34"],
    },
    fontFamily: `"Noto Sans", "Segoe UI", system-ui`,
  },
  appTitle: "KateChat",
  navLinks: [
    { tooltip: "Project GitHub Repository", url: "https://github.com/artiz/kate-chat", color: "dark", icon: "github" },
    { tooltip: "Author's CV", url: "https://artiz.github.io/", color: "indigo", icon: "cv" },
  ],
  aiUsageAlert: "AI-generated, for reference only.",
};

let clientConfig: ClientConfig = { ...defaultConfig };
let loadPromise: Promise<void> | undefined;

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

async function loadCustomization(): Promise<Partial<ClientConfig> | undefined> {
  const locations = ["./customization.json", "../customization.json"];
  for (const location of locations) {
    try {
      const resp = await fetch(location, { cache: "no-store" });
      if (resp.ok) {
        return (await resp.json()) as Partial<ClientConfig>;
      }
    } catch {
      // ignore missing customization
    }
  }
  return undefined;
}

export async function ensureClientConfig(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const customization = await loadCustomization();
      clientConfig = mergeDeep(clientConfig, customization);
      if (clientConfig.appTitle) {
        document.title = clientConfig.appTitle;
      }
    })();
  }
  return loadPromise;
}

export function getClientConfig(): ClientConfig {
  return clientConfig;
}

export function getClientNavLinks(): ClientNavLink[] {
  return clientConfig.navLinks || [];
}

export const clientDefaultConfig = defaultConfig;
