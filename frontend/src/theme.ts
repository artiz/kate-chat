import { createTheme, mergeMantineTheme, DefaultMantineColor, MantineColorsTuple } from "@mantine/core";
import { themeOverride } from "./theme.override";

// Define brand colors
const brandColors: Record<string, MantineColorsTuple> = {
  brand: ["#e0f2ff", "#c0e1ff", "#9aceff", "#72bdfe", "#50acfe", "#3da0fe", "#2897fe", "#0083fa", "#0077e8", "#006ad0"],
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
