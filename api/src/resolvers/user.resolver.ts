import { Resolver, Query, Mutation, Arg, Ctx, ID, FieldResolver, Root } from "type-graphql";
import bcrypt from "bcryptjs";
import { User, AuthProvider, UserRole, UserSettings } from "@/entities/User";
import { generateToken, generateResetToken, verifyResetToken } from "@/utils/jwt";
import {
  RegisterInput,
  LoginInput,
  UpdateUserInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "@/types/graphql/inputs";
import { ApplicationConfig, AuthResponse, CredentialSource, ForgotPasswordResponse } from "@/types/graphql/responses";
import { verifyRecaptchaToken } from "@/utils/recaptcha";
import { logger } from "@/utils/logger";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from ".";
import { ensureInitialUserAssets } from "@/config/initial-data";
import { APPLICATION_FEATURE, getProviderCredentialsSource, globalConfig } from "@/global-config";
import { sendPasswordResetEmail } from "@/services/mail.service";

@Resolver(User)
export class UserResolver extends BaseResolver {
  @Query(() => ApplicationConfig, { nullable: true })
  async appConfig(@Ctx() context: GraphQLContext): Promise<ApplicationConfig> {
    const user = await this.loadUserFromContext(context);

    const s3settings = {
      ...(user?.settings || {}),
      s3endpoint: globalConfig.s3.endpoint || "",
      s3FilesBucketName: globalConfig.s3.filesBucketName || "",
      s3AccessKeyId: globalConfig.s3.accessKeyId || "",
      s3SecretAccessKey: globalConfig.s3.secretAccessKey,
      s3Profile: globalConfig.s3.profile || "",
    };

    // Generate JWT token
    const token = user
      ? generateToken({
          userId: user.id,
          email: user.email,
          roles: [user.role],
        })
      : undefined;

    const demoMode = user?.isAdmin() ? false : globalConfig.demoMode;

    const s3Connected = Boolean(
      s3settings.s3FilesBucketName &&
        ((s3settings.s3AccessKeyId && s3settings.s3SecretAccessKey) || s3settings.s3Profile)
    );
    const ragSupported = Boolean(
      user?.isFeatureEnabled(APPLICATION_FEATURE.RAG) &&
        s3Connected &&
        ["sqlite", "postgres", "mssql"].includes(globalConfig.db.type)
    );

    const ragEnabled = Boolean(
      !demoMode &&
        ragSupported &&
        user &&
        user.settings?.documentsEmbeddingsModelId &&
        user.settings?.documentSummarizationModelId
    );

    const credentialsSource: CredentialSource[] = [];
    if (s3Connected) {
      credentialsSource.push({
        type: "S3",
        source: user?.getProviderCredentialsSource("S3") || globalConfig.s3.credentialsSource || "DATABASE",
      });
    }

    for (const provider of globalConfig.ai.enabledProviders) {
      credentialsSource.push({
        type: provider,
        source: user?.getProviderCredentialsSource(provider) || getProviderCredentialsSource(provider) || "BROWSER",
      });
    }

    return {
      currentUser: user || undefined,
      token,
      demoMode,
      s3Connected,
      ragSupported,
      ragEnabled: user?.isFeatureEnabled(APPLICATION_FEATURE.RAG) ? ragEnabled : false,
      mcpEnabled: !!user?.isFeatureEnabled(APPLICATION_FEATURE.RAG),
      maxChats: user?.isAdmin() ? -1 : globalConfig.limits.maxChats,
      maxChatMessages: user?.isAdmin() ? -1 : globalConfig.limits.maxChatMessages,
      maxImages: user?.isAdmin() ? -1 : globalConfig.limits.maxImages,
      credentialsSource,
      reasoningMaxTokenBudget: globalConfig.ai.reasoningMaxTokenBudget,
      reasoningMinTokenBudget: globalConfig.ai.reasoningMinTokenBudget,
      contextMessagesLimit: globalConfig.ai.contextMessagesLimit,
    };
  }

  @Mutation(() => AuthResponse)
  async register(@Arg("input") input: RegisterInput): Promise<AuthResponse> {
    const { email, password, firstName, lastName, avatarUrl, recaptchaToken, authProvider } = input;

    // Verify reCAPTCHA token for local registration
    if (authProvider !== AuthProvider.GOOGLE && authProvider !== AuthProvider.GITHUB) {
      if (recaptchaToken) {
        const isValid = await verifyRecaptchaToken(recaptchaToken, "register");
        if (!isValid) {
          logger.warn({ email }, "Registration attempt failed reCAPTCHA validation");
          throw new Error("reCAPTCHA validation failed. Please try again.");
        }
      } else {
        throw new Error("Registration attempt without reCAPTCHA token");
      }
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password for local users
    const hashedPassword = authProvider ? "" : await bcrypt.hash(password, 12);

    // Determine user role
    const role = globalConfig.app.defaultAdminEmails.includes(email.toLowerCase()) ? UserRole.ADMIN : UserRole.USER;

    // Create new user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      avatarUrl,
      role,
      authProvider: authProvider || AuthProvider.LOCAL,
    });

    const savedUser = await this.userRepository.save(user);
    await ensureInitialUserAssets(savedUser);

    // Generate JWT token
    const token = generateToken({
      userId: savedUser.id,
      email: savedUser.email,
      roles: [savedUser.role],
    });

    return {
      token,
      user: savedUser,
    };
  }

  @Mutation(() => User)
  async updateUser(@Arg("input") input: UpdateUserInput, @Ctx() context: GraphQLContext): Promise<User> {
    const user = await this.validateContextUser(context);

    // Check if email is being updated and if it's already in use
    if (input.email && input.email !== user.email) {
      const existingUser = await this.userRepository.findOne({ where: { email: input.email } });
      if (existingUser) {
        throw new Error("Email is already in use");
      }
      user.email = input.email;
    }

    // Update user properties
    if (input.firstName) user.firstName = input.firstName;
    if (input.lastName) user.lastName = input.lastName;
    if (input.avatarUrl) user.avatarUrl = input.avatarUrl;

    if (!user.settings) user.settings = {};
    if (input.defaultModelId) user.settings.defaultModelId = input.defaultModelId;
    if (input.defaultSystemPrompt) user.settings.defaultSystemPrompt = input.defaultSystemPrompt;
    if (input.documentsEmbeddingsModelId) user.settings.documentsEmbeddingsModelId = input.documentsEmbeddingsModelId;
    if (input.documentSummarizationModelId)
      user.settings.documentSummarizationModelId = input.documentSummarizationModelId;

    if (input.settings) {
      const settingsToUpdate: Partial<UserSettings> = input.settings;
      for (const [key, value] of Object.entries(input.settings)) {
        if (value) {
          settingsToUpdate[key as keyof UserSettings] = value;
        }
      }

      user.settings = {
        ...(user.settings || {}),
        ...settingsToUpdate,
      };
    }

    return await this.userRepository.save(user);
  }

  @Mutation(() => AuthResponse)
  async login(@Arg("input") input: LoginInput): Promise<AuthResponse> {
    const { email, password } = input;

    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.password) {
      throw new Error("Invalid email or password");
    }

    // Check password
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      throw new Error("Invalid email or password");
    }

    // Update user role if they are in admin emails list
    if (globalConfig.app.defaultAdminEmails.includes(user.email.toLowerCase()) && user.role !== UserRole.ADMIN) {
      user.role = UserRole.ADMIN;
      await this.userRepository.save(user);
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      roles: [user.role],
    });

    return {
      token,
      user,
    };
  }

  @Query(() => AuthResponse)
  async refreshToken(@Ctx() context: GraphQLContext): Promise<AuthResponse> {
    const user = await this.validateContextUser(context);
    if (!user) throw new Error("User not found");

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      roles: [user.role],
    });

    return {
      token,
      user,
    };
  }

  @Mutation(() => ID)
  async changePassword(@Arg("input") input: ChangePasswordInput, @Ctx() context: GraphQLContext): Promise<string> {
    const user = await this.validateContextUser(context);
    if (!user) throw new Error("User not found");

    // Check if the old password is correct
    const passwordIsValid = await bcrypt.compare(input.currentPassword, user.password);
    if (!passwordIsValid) throw new Error("Invalid old password");

    // Hash the new password
    const newHashedPassword = await bcrypt.hash(input.newPassword, 12);
    user.password = newHashedPassword;

    await this.userRepository.save(user);

    return user.id;
  }

  @Mutation(() => ForgotPasswordResponse)
  async forgotPassword(@Arg("input") input: ForgotPasswordInput): Promise<ForgotPasswordResponse> {
    if (input.recaptchaToken) {
      const isValid = await verifyRecaptchaToken(input.recaptchaToken, "forgot_password");
      if (!isValid) throw new Error("reCAPTCHA validation failed. Please try again.");
    }

    const user = await this.userRepository.findOne({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.password) {
      return { success: false, error: `User not found for email ${input.email}` };
    }

    if (!globalConfig.smtp.enabled) {
      return { success: false, error: "SMTP is not enabled. Cannot send password reset email." };
    }

    const resetToken = generateResetToken({ userId: user.id, email: user.email });
    const resetUrl = `${globalConfig.runtime.frontendUrl}/reset-password?token=${resetToken}`;

    logger.info({ email: user.email, resetUrl }, "Password reset requested");
    await sendPasswordResetEmail(user.email, resetUrl);

    return { success: true };
  }

  @Mutation(() => AuthResponse)
  async resetPassword(@Arg("input") input: ResetPasswordInput): Promise<AuthResponse> {
    let payload: ReturnType<typeof verifyResetToken>;
    try {
      payload = verifyResetToken(input.token);
    } catch {
      throw new Error("Reset link is invalid or has expired.");
    }

    const user = await this.userRepository.findOne({ where: { id: payload.userId } });
    if (!user) throw new Error("User not found");

    user.password = await bcrypt.hash(input.newPassword, 12);
    await this.userRepository.save(user);

    const token = generateToken({ userId: user.id, email: user.email, roles: [user.role] });
    return { token, user };
  }
}

@Resolver(() => UserSettings)
export class UserSettingsResolver {
  private mask(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    // Mask the API key if it's shorter than 10 chars, otherwise show parts
    if (value.length <= 10) {
      return "********";
    }
    // Show first 3 and last 4 characters
    return `${value.substring(0, 3)}...${value.substring(value.length - 4)}`;
  }

  @FieldResolver(() => String, { nullable: true })
  awsBedrockAccessKeyId(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.awsBedrockAccessKeyId);
  }

  @FieldResolver(() => String, { nullable: true })
  awsBedrockSecretAccessKey(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.awsBedrockSecretAccessKey);
  }

  @FieldResolver(() => String, { nullable: true })
  openaiApiKey(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.openaiApiKey);
  }

  @FieldResolver(() => String, { nullable: true })
  openaiApiAdminKey(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.openaiApiAdminKey);
  }

  @FieldResolver(() => String, { nullable: true })
  yandexFmApiKey(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.yandexFmApiKey);
  }

  @FieldResolver(() => String, { nullable: true })
  yandexFmApiFolderId(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.yandexFmApiFolderId);
  }

  @FieldResolver(() => String, { nullable: true })
  s3AccessKeyId(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.s3AccessKeyId);
  }

  @FieldResolver(() => String, { nullable: true })
  s3SecretAccessKey(@Root() settings: UserSettings): string | undefined {
    return this.mask(settings.s3SecretAccessKey);
  }
}
