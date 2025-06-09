import { Resolver, Query, Mutation, Arg, Ctx } from "type-graphql";
import { Repository } from "typeorm";
import { User } from "../entities/User";
import { getRepository } from "../config/database";
import { generateToken, TokenPayload } from "../utils/jwt";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { RegisterInput, LoginInput, UpdateUserInput } from "../types/graphql/inputs";
import { AuthResponse } from "../types/graphql/responses";
import { DEFAULT_PROMPT } from "@/config/ai";
import { verifyRecaptchaToken } from "../utils/recaptcha";
import { logger } from "../utils/logger";

@Resolver(User)
export class UserResolver {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = getRepository(User);
  }

  @Query(() => User, { nullable: true })
  async currentUser(@Ctx() context: { user?: TokenPayload }): Promise<User | null> {
    const { user } = context;
    if (!user?.userId) return null;

    const dbUser = await this.userRepository.findOne({
      where: { id: user.userId },
    });

    return dbUser;
  }

  @Mutation(() => AuthResponse)
  async register(@Arg("input") input: RegisterInput): Promise<AuthResponse> {
    const { email, password, firstName, lastName, avatarUrl, recaptchaToken } = input;

    // Verify reCAPTCHA token
    if (recaptchaToken) {
      const isValid = await verifyRecaptchaToken(recaptchaToken, "register");
      if (!isValid) {
        logger.warn({ email }, "Registration attempt failed reCAPTCHA validation");
        throw new Error("reCAPTCHA validation failed. Please try again.");
      }
    } else {
      throw new Error("Registration attempt without reCAPTCHA token");
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const user = this.userRepository.create({
      email,
      password: hashedPassword, // Note: Add this field to your User entity
      firstName,
      lastName,
      avatarUrl,
      defaultSystemPrompt: DEFAULT_PROMPT,
      msalId: "-", // Provide a default or make this nullable
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
  async updateUser(@Arg("input") input: UpdateUserInput, @Ctx() context: { user?: TokenPayload }): Promise<User> {
    const { user } = context;
    if (!user?.userId) throw new Error("Not authenticated");

    const dbUser = await this.userRepository.findOne({
      where: { id: user.userId },
    });

    if (!dbUser) throw new Error("User not found");

    // Check if email is being updated and if it's already in use
    if (input.email && input.email !== dbUser.email) {
      const existingUser = await this.userRepository.findOne({ where: { email: input.email } });
      if (existingUser) {
        throw new Error("Email is already in use");
      }
      dbUser.email = input.email;
    }

    // Update user properties
    if (input.firstName) dbUser.firstName = input.firstName;
    if (input.lastName) dbUser.lastName = input.lastName;
    if (input.avatarUrl) dbUser.avatarUrl = input.avatarUrl;
    if (input.defaultModelId) dbUser.defaultModelId = input.defaultModelId;
    if (input.defaultSystemPrompt) dbUser.defaultSystemPrompt = input.defaultSystemPrompt;

    return await this.userRepository.save(dbUser);
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
  async refreshToken(@Ctx() context: { user?: TokenPayload }): Promise<AuthResponse> {
    const { user } = context;
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const dbUser = await this.userRepository.findOne({
      where: { id: user.userId },
    });

    if (!dbUser) throw new Error("User not found");

    // Generate JWT token
    const token = generateToken({
      userId: dbUser.id,
      email: user.email,
    });

    return {
      token,
      user: dbUser,
    };
  }
}
