"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Center, Loader } from "@mantine/core";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem("auth-token");

    // Redirect based on authentication status
    if (token) {
      // If authenticated, go to chat page
      router.push("/chat");
    } else {
      // If not authenticated, go to login page
      router.push("/login");
    }
  }, [router]);

  // Show loading indicator while redirecting
  return (
    <Center h="100vh">
      <Loader size="xl" />
    </Center>
  );
}
