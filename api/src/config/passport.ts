import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { VerifyCallback } from "passport-oauth2";
import { Repository } from "typeorm";
import { fetch } from "undici";
import { User, AuthProvider, UserRole } from "../entities/User";
import { getRepository } from "./database";
import { logger } from "../utils/logger";
import { globalConfig } from "@/global-config";
import { ensureInitialUserAssets } from "@/utils/initial-data";

const userDefaults = {
  defaultSystemPrompt: globalConfig.ai.defaultSystemPrompt,
  defaultTemperature: globalConfig.ai.defaultTemperature,
  defaultMaxTokens: globalConfig.ai.defaultMaxTokens,
  defaultTopP: globalConfig.ai.defaultTopP,
  defaultImagesCount: 1,
};

export const configurePassport = () => {
  const userRepository: Repository<User> = getRepository(User);
  const { oauth, runtime } = globalConfig;

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
  if (oauth.google.enabled) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: oauth.google.clientId,
          clientSecret: oauth.google.clientSecret,
          callbackURL: `${runtime.callbackUrlBase}/auth/google/callback`,
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
              const role = globalConfig.app.defaultAdminEmails.includes(email.toLowerCase())
                ? UserRole.ADMIN
                : UserRole.USER;
              user = userRepository.create({
                email,
                googleId: profile.id,
                firstName,
                lastName,
                avatarUrl,
                role,
                authProvider: AuthProvider.GOOGLE,
                ...userDefaults,
              });

              user = await userRepository.save(user);
              logger.info({ userId: user.id }, "New user created via Google OAuth");
              await ensureInitialUserAssets(user);
            }

            // Update user role if they are in admin emails list
            if (
              globalConfig.app.defaultAdminEmails.includes(user.email.toLowerCase()) &&
              user.role !== UserRole.ADMIN
            ) {
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
  if (oauth.github.enabled) {
    const githubStrategy = new GitHubStrategy(
      {
        clientID: oauth.github.clientId,
        clientSecret: oauth.github.clientSecret,
        callbackURL: `${runtime.callbackUrlBase}/auth/github/callback`,
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
            const role = globalConfig.app.defaultAdminEmails.includes(email.toLowerCase())
              ? UserRole.ADMIN
              : UserRole.USER;

            user = userRepository.create({
              email,
              githubId: profile.id,
              firstName,
              lastName,
              avatarUrl,
              role,
              authProvider: AuthProvider.GITHUB,
              ...userDefaults,
            });

            user = await userRepository.save(user);
            logger.info({ userId: user.id }, "New user created via GitHub OAuth");
            await ensureInitialUserAssets(user);
          }

          // Update user role if they are in admin emails list
          if (globalConfig.app.defaultAdminEmails.includes(user.email.toLowerCase()) && user.role !== UserRole.ADMIN) {
            user.role = UserRole.ADMIN;
            user = await userRepository.save(user);
          }

          done(null, user);
        } catch (error) {
          logger.error(error, "Error during GitHub OAuth authentication");
          done(error, false);
        }
      }
    );

    // Override userProfile to use modern fetch (oauth@0.10.2 has issues with Node 22)
    githubStrategy.userProfile = function (accessToken: string, done: (err: Error | null, profile?: any) => void) {
      const userProfileURL = "https://api.github.com/user";
      const userEmailURL = "https://api.github.com/user/emails";
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": globalConfig.app.userAgent,
        Accept: "application/json",
      };

      fetch(userProfileURL, { headers })
        .then(async res => {
          if (!res.ok) {
            const text = await res.text();
            logger.error({ status: res.status, body: text }, "GitHub profile fetch failed");
            return done(new Error(`Failed to fetch user profile: ${res.status}`));
          }
          const json: any = await res.json();
          const profile: any = {
            provider: "github",
            id: String(json.id),
            username: json.login,
            displayName: json.name || json.login,
            profileUrl: json.html_url,
            photos: json.avatar_url ? [{ value: json.avatar_url }] : [],
            emails: [],
            _raw: JSON.stringify(json),
            _json: json,
          };

          // Fetch emails
          return fetch(userEmailURL, { headers }).then(async emailRes => {
            if (emailRes.ok) {
              const emails: any[] = (await emailRes.json()) as any[];
              const primary = emails.find((e: any) => e.primary);
              if (primary) {
                profile.emails = [{ value: primary.email }];
              }
            }
            done(null, profile);
          });
        })
        .catch(err => {
          logger.error(err, "GitHub profile fetch error");
          done(new Error("Failed to fetch user profile"));
        });
    };

    passport.use(githubStrategy);
  }

  // Configure Microsoft OAuth Strategy
  if (oauth.microsoft.enabled) {
    passport.use(
      "microsoft",
      new OAuth2Strategy(
        {
          authorizationURL: `https://login.microsoftonline.com/${oauth.microsoft.tenantId}/oauth2/v2.0/authorize`,
          tokenURL: `https://login.microsoftonline.com/${oauth.microsoft.tenantId}/oauth2/v2.0/token`,
          clientID: oauth.microsoft.clientId,
          clientSecret: oauth.microsoft.clientSecret,
          callbackURL: `${runtime.callbackUrlBase}/auth/microsoft/callback`,
          scope: ["User.Read"],
          customHeaders: {
            "User-Agent": globalConfig.app.userAgent,
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

            // Fetch profile photo from Microsoft Graph
            let avatarUrl: string | undefined;
            try {
              const photoResponse = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (photoResponse.ok) {
                const contentType = photoResponse.headers.get("content-type") || "image/jpeg";
                const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
                avatarUrl = `data:${contentType};base64,${photoBuffer.toString("base64")}`;
              } else {
                logger.warn(photoResponse, "Failed to fetch Microsoft profile photo, skipping");
              }
            } catch (photoError) {
              logger.warn(photoError, "Failed to fetch Microsoft profile photo, skipping");
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
                user.avatarUrl = user.avatarUrl || avatarUrl;
                user = await userRepository.save(user);
                logger.info({ userId: user.id }, "User linked with Microsoft account");
              }
            }

            // If no user exists, create a new one
            if (!user) {
              const firstName = userInfo.givenName || "User";
              const lastName = userInfo.surname || "";

              // Determine user role
              const role = globalConfig.app.defaultAdminEmails.includes(email.toLowerCase())
                ? UserRole.ADMIN
                : UserRole.USER;

              user = userRepository.create({
                email,
                microsoftId,
                firstName,
                lastName,
                role,
                authProvider: AuthProvider.MICROSOFT,
                avatarUrl,
                ...userDefaults,
              });

              user = await userRepository.save(user);
              logger.info({ userId: user.id }, "New user created via Microsoft OAuth");
              await ensureInitialUserAssets(user);
            }

            // Update user role if they are in admin emails list
            const isAdmin = globalConfig.app.defaultAdminEmails.includes(user.email.toLowerCase());
            if (
              (isAdmin && user.role !== UserRole.ADMIN) ||
              user.authProvider !== AuthProvider.MICROSOFT ||
              (!user.avatarUrl && avatarUrl)
            ) {
              if (isAdmin) {
                user.role = UserRole.ADMIN;
              }
              user.authProvider = AuthProvider.MICROSOFT;
              if (avatarUrl) {
                user.avatarUrl = avatarUrl;
              }

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
