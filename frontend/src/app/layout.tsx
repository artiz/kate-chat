import "@mantine/core/styles.css";
import React from "react";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { theme } from "../theme";
import { Notifications } from "@mantine/notifications";
import { ApolloWrapper } from "../lib/apollo-provider";

export const metadata = {
  title: "KateChat - Universal AI Chat Interface",
  description: "A universal chat interface for interacting with various AI models",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no" />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <Notifications position="top-right" />
          <ApolloWrapper>{children}</ApolloWrapper>
        </MantineProvider>
      </body>
    </html>
  );
}
