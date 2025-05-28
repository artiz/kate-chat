import React, { createContext, useContext, useEffect } from "react";
import { useLocalStorage } from "@mantine/hooks";

type ColorScheme = "light" | "dark" | "auto";

// Define the ThemeContext type
interface ThemeContextType {
  colorScheme: ColorScheme;
  setColorScheme: (value: ColorScheme) => void;
  toggleColorScheme: () => void;
}

// Create the context
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme provider component
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use localStorage to store theme preference
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "ui-theme",
    defaultValue: "light",
  });

  // Apply theme changes to document
  useEffect(() => {
    if (colorScheme === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.mantine = prefersDark ? "dark" : "light";
    } else {
      document.documentElement.dataset.mantine = colorScheme;
    }
  }, [colorScheme]);

  // Toggle between light and dark themes
  const toggleColorScheme = () => {
    const newColorScheme = colorScheme === "dark" ? "light" : "dark";
    setColorScheme(newColorScheme);
    document.documentElement.dataset.mantine = newColorScheme;
  };

  // Listen for system color scheme changes if set to 'auto'
  useEffect(() => {
    if (colorScheme === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        document.documentElement.dataset.mantine = e.matches ? "dark" : "light";
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [colorScheme]);

  return (
    <ThemeContext.Provider value={{ colorScheme, setColorScheme, toggleColorScheme }}>{children}</ThemeContext.Provider>
  );
};

// Custom hook to use the theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
