import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

interface ThemeProviderProps {
  defaultTheme?: string;
  storageKey?: string;
  children: React.ReactNode;
}

const ThemeProvider = ({
  defaultTheme = "light",
  storageKey = "anvaya-theme",
  children,
}: ThemeProviderProps) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme={defaultTheme}
    storageKey={storageKey}
    enableSystem={false}
    disableTransitionOnChange
    enableColorScheme
  >
    {children}
  </NextThemesProvider>
);

ThemeProvider.displayName = "ThemeProvider";

export { ThemeProvider };