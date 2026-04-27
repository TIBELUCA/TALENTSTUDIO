import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import {
  Strategy as GoogleStrategy,
  type Profile,
  type VerifyCallback,
  type AuthenticateOptionsGoogle,
} from "passport-google-oauth20";

// passport-oauth2 accepts `state: true` at runtime to enable session-backed
// CSRF state protection, but @types/passport only types `state` as `string`.
// Override here so we can opt into state protection without unsafe casts.
type GoogleAuthOptions = Omit<AuthenticateOptionsGoogle, "state"> & {
  state?: boolean | string;
};
import { userRepository } from "../repositories";

// Optional Google Workspace domain restriction. Leave the env var unset to
// allow any verified Google account that already has a matching salesman_user
// row in the database (the per-user check happens later in the callback).
const ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN?.trim() || null;

interface GoogleAuthUser {
  email: string | null;
  name: string;
  surname: string;
}

const router = Router();

let strategyConfigured = false;

function configureStrategy() {
  if (strategyConfigured) return;
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL;

  if (!clientID || !clientSecret || !callbackURL) {
    console.warn("[google-oauth] Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL — Google login disabled");
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        // state: true uses the express-session store to persist a CSRF token
        // between the redirect to Google and the callback (passport-oauth2 SessionStore).
        state: true,
      },
      (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
      ) => {
        const user: GoogleAuthUser = {
          email: profile.emails?.[0]?.value?.toLowerCase() ?? null,
          name: profile.name?.givenName ?? "",
          surname: profile.name?.familyName ?? "",
        };
        done(null, user);
      },
    ),
  );
  strategyConfigured = true;
}

configureStrategy();

router.use(passport.initialize());

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const oldSession = req.session;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.cookie = oldSession.cookie;
      resolve();
    });
  });
}

router.get("/api/auth/google", (req, res, next) => {
  if (!strategyConfigured) {
    return res.redirect("/?error=oauth_not_configured");
  }
  const options: GoogleAuthOptions = {
    scope: ["profile", "email"],
    session: false,
    state: true,
    prompt: "select_account",
    ...(ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : {}),
  };
  return passport.authenticate("google", options as AuthenticateOptionsGoogle)(req, res, next);
});

router.get("/api/auth/google/callback", (req: Request, res: Response, next: NextFunction) => {
  if (!strategyConfigured) {
    return res.redirect("/?error=oauth_not_configured");
  }
  const options: GoogleAuthOptions = { session: false, state: true };
  passport.authenticate(
    "google",
    options as AuthenticateOptionsGoogle,
    async (err: Error | null, user: GoogleAuthUser | false | undefined) => {
      try {
        if (err || !user || !user.email) {
          if (err) console.error("[google-oauth] authenticate error", err);
          const reason = err
            ? `${(err as any)?.name || "err"}:${err.message || "unknown"}`
            : !user
              ? "no_user"
              : "no_email";
          return res.redirect(`/?error=oauth_failed&reason=${encodeURIComponent(reason)}`);
        }
        const email = user.email.toLowerCase();
        if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          return res.redirect("/?error=domain_not_allowed");
        }
        const salesman = await userRepository.getByEmail(email);
        if (!salesman) {
          return res.redirect("/?error=user_not_found");
        }
        if (!salesman.isActive) {
          return res.redirect("/?error=user_disabled");
        }

        await regenerateSession(req);
        const dbRole = salesman.role;
        const effectiveRole = salesman.isMasterSalesman
          ? "master"
          : dbRole && dbRole !== "salesman"
            ? dbRole
            : "salesman";
        req.session.salesmanId = salesman.id;
        req.session.salesmanIsMaster = salesman.isMasterSalesman ?? false;
        req.session.salesmanRole = effectiveRole;
        const sessionParentIds: number[] = Array.isArray((salesman as any).parentSalesmanIds) && (salesman as any).parentSalesmanIds.length > 0
          ? ((salesman as any).parentSalesmanIds as number[])
          : (salesman.parentSalesmanId != null ? [salesman.parentSalesmanId] : []);
        req.session.parentSalesmanId = sessionParentIds.length > 0 ? sessionParentIds[0] : null;
        req.session.parentSalesmanIds = sessionParentIds;

        const deviceInfo =
          typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
        const xff = req.headers["x-forwarded-for"];
        const ipAddress =
          (typeof xff === "string" ? xff.split(",")[0]?.trim() : undefined) ||
          req.socket?.remoteAddress ||
          undefined;
        try {
          await userRepository.recordLogin(salesman.id, deviceInfo, ipAddress);
        } catch (recordErr) {
          console.error("[google-oauth] failed to record login", recordErr);
        }

        return res.redirect("/");
      } catch (e) {
        console.error("[google-oauth] callback error", e);
        const reason = `${(e as any)?.name || "exception"}:${(e as any)?.message || "unknown"}`;
        return res.redirect(`/?error=oauth_failed&reason=${encodeURIComponent(reason)}`);
      }
    },
  )(req, res, next);
});

export default router;
