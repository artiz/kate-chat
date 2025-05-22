import { createTheme, mergeMantineTheme, DefaultMantineColor, MantineColorsTuple } from "@mantine/core";
import { themeOverride } from "./theme.override";

// Define brand colors
const brandColors: Record<string, MantineColorsTuple> = {
  brand: ["#fff4e1", "#ffe8cc", "#fed09b", "#fdb766", "#fca13a", "#fc931d", "#fc8a08", "#e17800", "#c86a00", "#af5a00"],
  brand_contrast: ["#222", "#222", "#222", "#222", "#222", "#222", "#222", "#222", "#222", "#eee", "#eee"],
};

// Create a basic theme with brand colors
export const themeBase = createTheme({
  primaryColor: "brand",
  colors: brandColors,
  fontFamily: "Inter, sans-serif",
  headings: {
    fontFamily: "Inter, sans-serif",
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
export const theme = mergeMantineTheme(themeBase, themeOverride);
