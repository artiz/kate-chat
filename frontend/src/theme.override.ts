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
      "#d9d9d9",
      "#bdbdbd",
      "#a1a1a1",
      "#858585",
      "#696969",
      "#4d4d4d",
      "#313131",
      "#252525",
      "#181818",
      "#0e0e0e",
    ],
  },
  other: {
    transitionDuration: '0.3s',
  },
};
