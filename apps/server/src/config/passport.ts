import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "./env.js";
import type { GoogleProfileInput } from "../services/oauth.service.js";

/**
 * Google OAuth2 strategy (Phase 6.6).
 *
 * The strategy only *shapes* the profile — every authorisation decision (staff
 * rejection, linking, account creation) lives in `oauth.service`, so it is
 * covered by service tests rather than buried in middleware.
 *
 * Sessions are disabled: this app is JWT-based, and the callback exchanges the
 * Google identity for our own token pair immediately.
 */

export const isGoogleOAuthConfigured = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL,
);

if (isGoogleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        callbackURL: env.GOOGLE_CALLBACK_URL!,
        scope: ["profile", "email"],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const primary = profile.emails?.[0];
        const shaped: GoogleProfileInput = {
          providerUserId: profile.id,
          email: primary?.value ?? "",
          // passport-google-oauth20 surfaces Google's `email_verified` as a
          // string or boolean depending on version; treat anything else as
          // unverified rather than assuming.
          emailVerified:
            (primary as { verified?: boolean | string } | undefined)?.verified === true ||
            (primary as { verified?: boolean | string } | undefined)?.verified === "true",
          fullName: profile.displayName,
        };
        done(null, shaped);
      },
    ),
  );
}

export default passport;
