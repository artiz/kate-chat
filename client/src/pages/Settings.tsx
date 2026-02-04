import React from "react";
import { UnifiedSettings } from "@/components/settings";

interface IProps {
  onReloadAppData?: () => void;
}

export const Settings = ({ onReloadAppData }: IProps) => {
  return <UnifiedSettings onReloadAppData={onReloadAppData} />;
};
