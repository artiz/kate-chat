import passport from "passport";
import oauth2 = require("passport-oauth2");
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Repository } from "typeorm";
import { User } from "../entities/User";
import { getRepository } from "./database";
import { AuthProvider, UserRole } from "../types/ai.types";
import { DEFAULT_PROMPT } from "./ai";
import { logger } from "../utils/logger";
import {
  CALLBACK_URL_BASE,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  DEFAULT_ADMIN_EMAILS,
} from "./application";
import { VerifyCallback } from "passport-oauth2";

// Load environment variables

export const configurePassport = () => {
  const userRepository: Repository<User> = getRepository(User);

  // Serialize user to the session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await userRepository.findOne({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Configure Google OAuth Strategy
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          callbackURL: `${CALLBACK_URL_BASE}/auth/google/callback`,
        },
        async (accessToken: string, refreshToken: string, profile: passport.Profile, done: VerifyCallback) => {
          try {
            // Check if user exists by googleId
            let user = await userRepository.findOne({
              where: { googleId: profile.id },
            });

            const email = profile.emails?.[0]?.value || "";

            // If user doesn't exist, check if there's a user with the same email
            if (!user && email) {
              user = await userRepository.findOne({ where: { email } });

              // If user exists with the email, update with googleId
              if (user) {
                user.googleId = profile.id;
                user.authProvider = AuthProvider.GOOGLE;
                user.password = ""; // No password for OAuth users
                user = await userRepository.save(user);
                logger.info({ userId: user.id }, "User linked with Google account");
              }
            }

            // If no user exists, create a new one
            if (!user) {
              if (!email) {
                logger.error({ profileId: profile.id }, "No email provided from Google");
                return done(new Error("No email provided by Google"), false);
              }

              const firstName = profile.name?.givenName || "User";
              const lastName = profile.name?.familyName || "";
              const avatarUrl = profile.photos?.[0]?.value || undefined;

              // Determine user role
              const role = DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase()) ? UserRole.ADMIN : UserRole.USER;
              user = userRepository.create({
                email,
                googleId: profile.id,
                firstName,
                lastName,
                avatarUrl,
                role,
                authProvider: AuthProvider.GOOGLE,
                defaultSystemPrompt: DEFAULT_PROMPT,
              });

              user = await userRepository.save(user);
              logger.info({ userId: user.id }, "New user created via Google OAuth");
            }

            // Update user role if they are in admin emails list
            if (DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== UserRole.ADMIN) {
              user.role = UserRole.ADMIN;
              user = await userRepository.save(user);
            }

            done(null, user);
          } catch (error) {
            logger.error(error, "Error during Google OAuth authentication");
            done(error, false);
          }
        }
      )
    );
  }

  // Configure GitHub OAuth Strategy
  if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: GITHUB_CLIENT_ID,
          clientSecret: GITHUB_CLIENT_SECRET,
          callbackURL: `${CALLBACK_URL_BASE}/auth/github/callback`,
          scope: ["user:email"], // Request email scope
        },
        async (accessToken: string, refreshToken: string, profile: passport.Profile, done: VerifyCallback) => {
          try {
            // Check if user exists by githubId
            let user = await userRepository.findOne({
              where: { githubId: profile.id },
            });
            // For GitHub, we need to extract email from the profile
            const email = profile.emails?.[0]?.value;

            // If user doesn't exist, check if there's a user with the same email
            if (!user && email) {
              user = await userRepository.findOne({ where: { email } });

              // If user exists with the email, update with githubId
              if (user) {
                user.githubId = profile.id;
                user.authProvider = AuthProvider.GITHUB;
                user.password = ""; // No password for OAuth users
                user = await userRepository.save(user);
                logger.info({ userId: user.id }, "User linked with GitHub account");
              }
            }

            // If no user exists, create a new one
            if (!user) {
              if (!email) {
                logger.error({ profileId: profile.id }, "No email provided from GitHub");
                return done(new Error("No email provided by GitHub"), false);
              }

              // GitHub profiles are structured differently than Google's
              const displayName = profile.displayName || profile.username || "User";
              const nameParts = displayName.split(" ");
              const firstName = nameParts[0] || "User";
              const lastName = nameParts.slice(1).join(" ") || "";
              const avatarUrl = profile.photos?.[0]?.value || undefined;

              // Determine user role
              const role = DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase()) ? UserRole.ADMIN : UserRole.USER;

              user = userRepository.create({
                email,
                githubId: profile.id,
                firstName,
                lastName,
                avatarUrl,
                role,
                authProvider: AuthProvider.GITHUB,
                defaultSystemPrompt: DEFAULT_PROMPT,
              });

              user = await userRepository.save(user);
              logger.info({ userId: user.id }, "New user created via GitHub OAuth");
            }

            // Update user role if they are in admin emails list
            if (DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== UserRole.ADMIN) {
              user.role = UserRole.ADMIN;
              user = await userRepository.save(user);
            }

            done(null, user);
          } catch (error) {
            logger.error(error, "Error during GitHub OAuth authentication");
            done(error, false);
          }
        }
      )
    );
  }

  return passport;
};
