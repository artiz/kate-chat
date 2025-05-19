import { MantineThemeOverride } from "@mantine/core";

// Theme overrides with dark mode support
export const themeOverride: MantineThemeOverride = {
  components: {
    // Add component-specific styles and props here
    Paper: {
      defaultProps: (theme) => ({
        // Apply different shadows based on color scheme
        shadow: theme.colorScheme === 'dark' ? 'md' : 'sm',
      }),
    },
  },
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  // Dark mode specific configurations
  colors: {
    // Enhance brand colors for dark mode
    dark: [
      "#D9D9D9",
      "#BDBDBD",
      "#A1A1A1",
      "#858585",
      "#696969",
      "#4D4D4D",
      "#313131",
      "#252525",
      "#181818",
      "#0E0E0E",
    ],
  },
  other: {
    transitionDuration: '0.3s',
  },
};
