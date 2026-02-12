import { createTheme, mergeMantineTheme, MantineColorsTuple, MantineTheme, MantineThemeOverride } from "@mantine/core";
import { themeOverride } from "./theme.override";
import { getClientConfig } from "./global-config";

const buildThemeBase = (): MantineThemeOverride => {
  const config = getClientConfig();
  const fontFamily = config.theme.fontFamily || `"Segoe UI", system-ui`;

  return createTheme({
    primaryColor: config.theme.primaryColor || "indigo",
    colors: config.theme.colors,
    fontFamily,
    headings: {
      fontFamily,
    },
    spacing: {
      xs: "0.33rem",
      sm: "0.5rem",
      md: "0.75rem",
      lg: "1rem",
      xl: "1.75rem",
    },
    defaultRadius: config.theme.defaultRadius,
    other: {
      transitionDuration: "0.5s",
    },
    components: {
      Button: {
        defaultProps: {
          radius: config.theme.defaultRadius,
        },
      },
      TextInput: {
        defaultProps: {
          radius: config.theme.defaultRadius,
        },
      },
      PasswordInput: {
        defaultProps: {
          radius: config.theme.defaultRadius,
        },
      },
      Card: {
        defaultProps: {
          radius: config.theme.defaultRadius,
          shadow: "md",
        },
      },
      NavLink: {
        defaultProps: {
          p: "xs md",
        },
      },
    },
  });
};

export const createAppTheme = (): MantineTheme => {
  const base = buildThemeBase();
  return base as MantineTheme;
};
