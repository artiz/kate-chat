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
  IconBrandGoogle,
} from "@tabler/icons-react";
import { ApiProvider } from "@/core/ai";

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
    case "OPEN_AI":
      return <IconBrandOpenai size={size} />;
    case "AWS_BEDROCK":
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
    case "YANDEX_FM":
      return <IconBrandYandex size={size} />;
    case "GOOGLE_VERTEX_AI":
      return <IconBrandGoogle size={size} />;

    default:
      return <IconMessageChatbot size={size} />;
  }
};
