import React from "react";
import { getClientConfig } from "@/global-config";

const Home: React.FC = () => {
  const { appTitle } = getClientConfig();
  return (
    <div className="home">
      <h1>Welcome to {appTitle}</h1>
      <p>A universal chat interface for AI models</p>
    </div>
  );
};

export default Home;
