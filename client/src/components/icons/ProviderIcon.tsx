import React from "react";
import {
  IconBrandOpenai,
  IconBrandAws,
  IconServer,
  IconBrandYandex,
  IconMessageChatbot,
  IconAi,
  IconBrandMeta,
  IconBrandMedium,
} from "@tabler/icons-react";
import { ApiProvider } from "@/types/ai";

export const ProviderIcon = ({
  apiProvider,
  provider,
  size = 24,
}: {
  apiProvider: ApiProvider;
  provider?: string;
  size?: number;
}) => {
  switch (apiProvider) {
    case "open_ai":
      return <IconBrandOpenai size={size} />;
    case "aws_bedrock":
      switch (provider?.toLowerCase()) {
        case "amazon":
          return <IconBrandAws size={size} />;
        case "anthropic":
          return <IconAi size={size} />;
        case "mistral ai":
          return <IconBrandMedium size={size} />;
        case "meta":
          return <IconBrandMeta size={size} />;

        default:
          return <IconBrandAws size={size} />;
      }
    case "yandex_fm":
      return <IconBrandYandex size={size} />;

    default:
      return <IconMessageChatbot size={size} />;
  }
};
