import React from "react";
import { useTranslation } from "react-i18next";
import { getClientConfig } from "@/global-config";

const Home: React.FC = () => {
  const { t } = useTranslation();
  const { appTitle } = getClientConfig();
  return (
    <div className="home">
      <h1>{t("home.welcome", { appTitle })}</h1>
      <p>{t("home.subtitle")}</p>
    </div>
  );
};

export default Home;
