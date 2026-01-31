import { Resolver, Query, Mutation, Arg, Ctx, ID } from "type-graphql";
import bcrypt from "bcryptjs";
import { User, AuthProvider, UserRole } from "@/entities/User";
import { generateToken } from "@/utils/jwt";
import { RegisterInput, LoginInput, UpdateUserInput, ChangePasswordInput } from "@/types/graphql/inputs";
import { ApplicationConfig, AuthResponse } from "@/types/graphql/responses";
import { DEFAULT_CHAT_PROMPT } from "@/config/ai/prompts";
import { verifyRecaptchaToken } from "@/utils/recaptcha";
import { logger } from "@/utils/logger";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from ".";

import {
  DEMO_MODE,
  DEFAULT_ADMIN_EMAILS,
  DEMO_MAX_CHATS,
  DEMO_MAX_CHAT_MESSAGES,
  DEMO_MAX_IMAGES,
} from "@/config/application";
import { DB_TYPE } from "@/config/database";

@Resolver(User)
export class UserResolver extends BaseResolver {
  @Query(() => ApplicationConfig, { nullable: true })
  async appConfig(@Ctx() context: GraphQLContext): Promise<ApplicationConfig> {
    const user = await this.loadUserFromContext(context);
    const s3settings = {
      ...(user?.settings || {}),
      s3endpoint: process.env.S3_ENDPOINT || "",
      s3FilesBucketName: process.env.S3_FILES_BUCKET_NAME || "",
      s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      s3Profile: process.env.S3_AWS_PROFILE || "",
    };

    // Generate JWT token
    const token = user
      ? generateToken({
          userId: user.id,
          email: user.email,
          roles: [user.role],
        })
      : undefined;

    const demoMode = user?.isAdmin() ? false : DEMO_MODE;
    const s3Connected = Boolean(
      s3settings.s3FilesBucketName &&
        ((s3settings.s3AccessKeyId && s3settings.s3SecretAccessKey) || s3settings.s3Profile)
    );
    const ragSupported = Boolean(!demoMode && s3Connected && ["sqlite", "postgres", "mssql"].includes(DB_TYPE));

    const ragEnabled = Boolean(
      ragSupported && user && user.documentsEmbeddingsModelId && user.documentSummarizationModelId
    );

    return {
      currentUser: user || undefined,
      token,
      demoMode,
      s3Connected,
      ragSupported,
      ragEnabled,
      maxChats: demoMode ? DEMO_MAX_CHATS : -1,
      maxChatMessages: demoMode ? DEMO_MAX_CHAT_MESSAGES : -1,
      maxImages: demoMode ? DEMO_MAX_IMAGES : -1,
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
    const role = DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase()) ? UserRole.ADMIN : UserRole.USER;

    // Create new user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      avatarUrl,
      role,
      defaultSystemPrompt: DEFAULT_CHAT_PROMPT,
      authProvider: authProvider || AuthProvider.LOCAL,
    });

    const savedUser = await this.userRepository.save(user);

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
    if (input.defaultModelId) user.defaultModelId = input.defaultModelId;
    if (input.defaultSystemPrompt) user.defaultSystemPrompt = input.defaultSystemPrompt;
    if (input.documentsEmbeddingsModelId) user.documentsEmbeddingsModelId = input.documentsEmbeddingsModelId;
    if (input.documentSummarizationModelId) user.documentSummarizationModelId = input.documentSummarizationModelId;

    if (input.settings) {
      user.settings = {
        ...(user.settings || {}),
        ...input.settings,
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
    if (DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== UserRole.ADMIN) {
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
}
