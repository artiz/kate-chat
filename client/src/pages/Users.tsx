import React from "react";
import { Container, Title } from "@mantine/core";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const Users: React.FC = () => {
  return (
    <Container size="xl" py="xl">
      <AdminDashboard />
    </Container>
  );
};
