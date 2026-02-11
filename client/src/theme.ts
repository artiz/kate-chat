import { createTheme, mergeMantineTheme, MantineColorsTuple, MantineTheme, MantineThemeOverride } from "@mantine/core";
import { themeOverride } from "./theme.override";
import { getClientConfig } from "./global-config";

const buildThemeBase = (): MantineThemeOverride => {
  const config = getClientConfig();
  const brandColors: Record<string, MantineColorsTuple> = config.theme.brandColors as Record<
    string,
    MantineColorsTuple
  >;
  const fontFamily = config.theme.fontFamily;

  return createTheme({
    primaryColor: "brand",
    colors: brandColors,
    fontFamily,
    headings: {
      fontFamily,
    },
    defaultRadius: "md",
    components: {
      Button: {
        defaultProps: {
          radius: "md",
        },
      },
      TextInput: {
        defaultProps: {
          radius: "md",
        },
      },
      PasswordInput: {
        defaultProps: {
          radius: "md",
        },
      },
      Card: {
        defaultProps: {
          radius: "md",
          shadow: "sm",
        },
      },
    },
  });
};

export const createAppTheme = (): MantineTheme => {
  const base = buildThemeBase();
  return mergeMantineTheme(base as MantineTheme, themeOverride);
};
