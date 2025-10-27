import passport, { use } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { Repository } from "typeorm";
import { fetch } from "undici";
import { User, AuthProvider, UserRole } from "../entities/User";
import { getRepository } from "./database";
import { DEFAULT_CHAT_PROMPT } from "./ai/prompts";
import { logger } from "../utils/logger";
import {
  CALLBACK_URL_BASE,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_TENANT_ID,
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
            const avatarUrl = profile.photos?.[0]?.value || undefined;

            // If user doesn't exist, check if there's a user with the same email
            if (!user && email) {
              user = await userRepository.findOne({ where: { email } });

              // If user exists with the email, update with googleId
              if (user) {
                user.googleId = profile.id;
                user.authProvider = AuthProvider.GOOGLE;
                user.password = ""; // No password for OAuth users
                user.avatarUrl = user.avatarUrl || avatarUrl;
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
                defaultSystemPrompt: DEFAULT_CHAT_PROMPT,
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
            const avatarUrl = profile.photos?.[0]?.value || undefined;

            // If user doesn't exist, check if there's a user with the same email
            if (!user && email) {
              user = await userRepository.findOne({ where: { email } });

              // If user exists with the email, update with githubId
              if (user) {
                user.githubId = profile.id;
                user.authProvider = AuthProvider.GITHUB;
                user.password = ""; // No password for OAuth users
                user.avatarUrl = user.avatarUrl || avatarUrl;
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
                defaultSystemPrompt: DEFAULT_CHAT_PROMPT,
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

  // Configure Microsoft OAuth Strategy
  if (MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET) {
    passport.use(
      "microsoft",
      new OAuth2Strategy(
        {
          authorizationURL: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`,
          tokenURL: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
          clientID: MICROSOFT_CLIENT_ID,
          clientSecret: MICROSOFT_CLIENT_SECRET,
          callbackURL: `${CALLBACK_URL_BASE}/auth/microsoft/callback`,
          scope: ["User.Read"],
          customHeaders: {
            "User-Agent": "KateChat OAuth Client",
          },
        },
        async (accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) => {
          try {
            // Fetch user info from Microsoft Graph API
            const response = await fetch("https://graph.microsoft.com/v1.0/me", {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!response.ok) {
              const res = await response.json();

              logger.error({ res, status: response.status }, "Failed to fetch user info from Microsoft Graph");
              return done(new Error("Failed to fetch user info from Microsoft"), false);
            }

            const userInfo = (await response.json()) as {
              id: string;
              mail?: string;
              userPrincipalName?: string;
              givenName?: string;
              surname?: string;
            };

            const microsoftId = userInfo.id;
            const email = userInfo.mail || userInfo.userPrincipalName;

            if (!email) {
              logger.error({ userId: microsoftId }, "No email provided from Microsoft");
              return done(new Error("No email provided by Microsoft"), false);
            }

            // Check if user exists by microsoftId
            let user = await userRepository.findOne({
              where: { microsoftId },
            });

            // If user doesn't exist, check if there's a user with the same email
            if (!user) {
              user = await userRepository.findOne({ where: { email } });

              // If user exists with the email, update with microsoftId
              if (user) {
                user.microsoftId = microsoftId;
                user.authProvider = AuthProvider.MICROSOFT;
                user.password = ""; // No password for OAuth users
                user = await userRepository.save(user);
                logger.info({ userId: user.id }, "User linked with Microsoft account");
              }
            }

            // If no user exists, create a new one
            if (!user) {
              const firstName = userInfo.givenName || "User";
              const lastName = userInfo.surname || "";
              // const avatarUrl = undefined;
              // Microsoft Graph doesn't provide photo URL directly
              // TODO: Fetch photo from /me/photo/$value endpoint if needed
              // https://graph.microsoft.com/v1.0/me/photo/$value

              // Determine user role
              const role = DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase()) ? UserRole.ADMIN : UserRole.USER;

              user = userRepository.create({
                email,
                microsoftId,
                firstName,
                lastName,
                role,
                authProvider: AuthProvider.MICROSOFT,
                defaultSystemPrompt: DEFAULT_CHAT_PROMPT,
              });

              user = await userRepository.save(user);
              logger.info({ userId: user.id }, "New user created via Microsoft OAuth");
            }

            // Update user role if they are in admin emails list
            if (DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== UserRole.ADMIN) {
              user.role = UserRole.ADMIN;
              user = await userRepository.save(user);
            }

            done(null, user);
          } catch (error) {
            logger.error(error, "Error during Microsoft OAuth authentication");
            done(error, false);
          }
        }
      )
    );
  }

  return passport;
};
