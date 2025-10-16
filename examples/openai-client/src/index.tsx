import React from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { App } from "./App";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.scss";

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <MantineProvider>
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
