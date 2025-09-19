import React from "react";
import { Container } from "@mantine/core";
import { DocumentsDashboard } from "@/components/documents";
import { useParams } from "react-router";

export const ChatDocuments: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <Container size="xl" py="xl">
      <DocumentsDashboard />
    </Container>
  );
};
