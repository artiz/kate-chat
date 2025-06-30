import { Resolver, Query, Mutation, Arg, Ctx } from "type-graphql";
import { Repository } from "typeorm";
import { User } from "../entities/User";
import { getRepository } from "../config/database";
import { generateToken, TokenPayload } from "../utils/jwt";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { RegisterInput, LoginInput, UpdateUserInput } from "../types/graphql/inputs";
import { ApplicationConfig, AuthResponse } from "../types/graphql/responses";
import { DEFAULT_PROMPT } from "@/config/ai";
import { verifyRecaptchaToken } from "../utils/recaptcha";
import { logger } from "../utils/logger";
import { AuthProvider } from "../types/ai.types";
import { BaseResolver } from "./base.resolver";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { DEMO_MODE } from "@/config/application";

@Resolver(User)
export class UserResolver extends BaseResolver {
  @Query(() => User, { nullable: true })
  async currentUser(@Ctx() context: GraphQLContext): Promise<User | null> {
    return await this.loadUserFromContext(context);
  }

  @Query(() => ApplicationConfig, { nullable: true })
  async appConfig(@Ctx() context: GraphQLContext): Promise<ApplicationConfig> {
    const user = await this.loadUserFromContext(context);
    const s3settings = {
      ...(user?.settings || {}),
      s3FilesBucketName: process.env.S3_FILES_BUCKET_NAME || "",
      s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      s3Profile: process.env.S3_AWS_PROFILE || "",
    };

    return {
      demoMode: !!DEMO_MODE,
      s3Connected: !!(
        s3settings.s3FilesBucketName &&
        ((s3settings.s3AccessKeyId && s3settings.s3SecretAccessKey) || s3settings.s3Profile)
      ),
      maxChats: DEMO_MODE ? 50 : -1,
      maxChatMessages: DEMO_MODE ? 50 : -1,
      maxImages: DEMO_MODE ? 25 : -1,
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

    // Create new user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      avatarUrl,
      defaultSystemPrompt: DEFAULT_PROMPT,
      authProvider: authProvider || AuthProvider.LOCAL,
    });

    const savedUser = await this.userRepository.save(user);

    // Generate JWT token
    const token = generateToken({
      userId: savedUser.id,
      email: savedUser.email,
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
    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Check password
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      throw new Error("Invalid email or password");
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
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
    });

    return {
      token,
      user,
    };
  }
}
