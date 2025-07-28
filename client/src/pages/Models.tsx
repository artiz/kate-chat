import React from "react";
import { Container } from "@mantine/core";
import { ModelsDashboard } from "@/components/models/ModelsDashboard";

export const Models: React.FC = () => {
  return (
    <Container size="lg" py="xl">
      <ModelsDashboard />
    </Container>
  );
};
