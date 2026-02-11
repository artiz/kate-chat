import { createTheme, mergeMantineTheme, MantineColorsTuple, MantineTheme, MantineThemeOverride } from "@mantine/core";
import { themeOverride } from "./theme.override";

// Define brand colors
const brandColors: Record<string, MantineColorsTuple> = {
  // orange
  // brand: ["#fff4e1", "#ffe8cc", "#fed09b", "#fdb766", "#fca13a", "#fc931d", "#fc8a08", "#e17800", "#c86a00", "#af5a00"],
  // pink
  brand: ["#fff0f6", "#ffe0ec", "#ffccd7", "#ffb3c2", "#ff99ab", "#ff8095", "#e65a74", "#cc3352", "#b31231", "#c00a34"],
};

// Create a basic theme with brand colors
export const themeBase: MantineThemeOverride = createTheme({
  // Use the brand color as the primary color
  primaryColor: "brand",
  colors: brandColors,
  fontFamily: `"Noto Sans", "Segoe UI", system-ui`,
  headings: {
    fontFamily: `"Noto Sans", "Segoe UI", system-ui`,
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

// Merge the basic theme with theme overrides
export const theme = mergeMantineTheme(themeBase as MantineTheme, themeOverride);
