import { globalConfig } from "@/global-config";
import { User } from "@/entities";
import { ConnectionParams } from "@/middleware/auth.middleware";

export function getUserConnectionInfo(user?: User): ConnectionParams {
  return {
    awsBedrockRegion: user?.settings?.awsBedrockRegion || globalConfig.bedrock.region,
    awsBedrockProfile: user?.settings?.awsBedrockProfile || globalConfig.bedrock.profile,
    awsBedrockAccessKeyId: user?.settings?.awsBedrockAccessKeyId || globalConfig.bedrock.accessKeyId,
    awsBedrockSecretAccessKey: user?.settings?.awsBedrockSecretAccessKey || globalConfig.bedrock.secretAccessKey,

    openAiApiKey: user?.settings?.openaiApiKey || globalConfig.openai.apiKey,
    openAiApiAdminKey: user?.settings?.openaiApiAdminKey || globalConfig.openai.adminApiKey,

    yandexFmApiKey: user?.settings?.yandexFmApiKey || globalConfig.yandex.fmApiKey,
    yandexFmApiFolder: user?.settings?.yandexFmApiFolderId || globalConfig.yandex.fmApiFolder,
    yandexSearchApiKey: user?.settings?.yandexFmApiKey || globalConfig.yandex.searchApiKey,
    yandexSearchApiFolder: user?.settings?.yandexFmApiFolderId || globalConfig.yandex.searchApiFolder,
  };
}
