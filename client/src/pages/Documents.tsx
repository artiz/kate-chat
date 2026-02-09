import React from "react";
import { Container } from "@mantine/core";
import { DocumentsDashboard } from "@/components/documents";

export const Documents: React.FC = () => {
  return (
    <Container size="xl" py="xl" pos="relative">
      <DocumentsDashboard />
    </Container>
  );
};
