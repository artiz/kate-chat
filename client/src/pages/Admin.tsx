import React from "react";
import { Container } from "@mantine/core";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const Admin: React.FC = () => {
  return (
    <Container size="xl" py="xl">
      <AdminDashboard />
    </Container>
  );
};
