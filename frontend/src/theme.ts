import { createTheme, mergeMantineTheme, DefaultMantineColor, MantineColorsTuple } from "@mantine/core";
import { themeOverride } from "./theme.override";

// Define brand colors
const brandColors: Record<string, MantineColorsTuple> = {
  // orange
  // brand: ["#fff4e1", "#ffe8cc", "#fed09b", "#fdb766", "#fca13a", "#fc931d", "#fc8a08", "#e17800", "#c86a00", "#af5a00"],
  // pink
  brand: ["#fff0f6", "#ffdeeb", "#f8b3d9", "#f17bb5", "#e84c8a", "#d71f5f", "#c00a34", "#a0001c", "#800014", "#60000c"],
};

// Create a basic theme with brand colors
export const themeBase = createTheme({
  primaryColor: "brand",
  colors: brandColors,
  fontFamily: `Roboto, "Segoe UI", system-ui`,
  headings: {
    fontFamily: `"Segoe UI", system-ui`,
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
