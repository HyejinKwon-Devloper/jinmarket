import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import {
  type CreateEventInput,
  gameChoices,
  pushApps,
  pushAudienceRoles,
  type CreatePriceOfferInput,
  type CreateProductInput,
  type UpdateEventInput,
  type UpdateProductInput,
  type WebPushSubscriptionPayload,
} from "../../shared/src/index.js";

import { AppError } from "./errors.js";
import { allowedOrigins, env, isSellerApprovalAdminLoginId } from "./env.js";
import {
  clearSellerApprovalAuthCookie,
  clearSessionCookie,
  changePassword,
  getSellerApprovalAdminAuthStatus,
  getSessionUser,
  loginWithPassword,
  logout,
  requestBuyerAccountActivation,
  registerBuyerAccount,
  requestBuyerEmailVerification,
  requestLegacyAccountActivation,
  requestPasswordReset,
  requestSignupVerification,
  requestSellerEmailVerification,
  sellerApprovalAuthCookieName,
  setSessionCookie,
  setSellerApprovalAuthCookie,
  updateProfile,
  updateProfileImage,
  verifyBuyerAccountActivation,
  verifyBuyerEmailVerification,
  verifyLegacyAccountActivation,
  verifyPasswordReset,
  verifySellerEmailVerification,
  verifySignupCode,
  verifySellerApprovalTotp,
} from "./services/auth-service.js";
import { consumeRateLimit } from "./utils/rate-limit.js";
import {
  createEvent,
  createEventEntry,
  getEventDrawSource,
  getPublicEventDetail,
  getSellerEventDetail,
  listEventEntries,
  listPublicEvents,
  listSellerEvents,
  updateSellerEvent,
} from "./services/event-service.js";
import {
  acceptPriceOffer,
  createPriceOffer,
  createProduct,
  deleteProduct,
  getProductDetail,
  getSellerProductDetail,
  listMyOrders,
  listProductGameAttempts,
  listProductPriceOffers,
  listProducts,
  listSellerOrders,
  listSellerProducts,
  signCloudinaryUpload,
  signProfileImageUpload,
  updateSellerProduct,
} from "./services/product-service.js";
import {
  playGamePurchase,
  purchaseInstantProduct,
} from "./services/purchase-service.js";
import {
  getLuckyRpsStatus,
  playLuckyRpsRound,
} from "./services/mini-game-service.js";
import {
  getPublicWebPushKey,
  isWebPushConfigured,
  listPushAudienceSummaries,
  listPushRecipients,
  removeWebPushSubscription,
  saveWebPushSubscription,
  sendPushNotificationToUsers,
  sendTestPushNotification,
  type PushNotificationInput,
} from "./services/push-service.js";
import {
  approveSellerAccessRequest,
  createSellerAccessRequest,
  getSellerAccessOverview,
  listPendingSellerAccessRequests,
} from "./services/seller-access-service.js";
import { runWithDbContext } from "@jinmarket/db";

type AuthedRequest = Request & {
  sessionUser?: Awaited<ReturnType<typeof getSessionUser>>;
};

const csrfHeaderName = "x-jinmarket-csrf";
const csrfHeaderValue = "1";
const minuteMs = 60 * 1000;

const gamePlaySchema = z.object({
  playerChoice: z.enum(gameChoices),
});

const sellerApprovalTotpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

const loginSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  password: z.string().min(1).max(200),
});

const buyerSignupSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
});

const signupRequestSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
});

const signupVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

const sellerEmailRequestSchema = z.object({
  email: z.string().trim().email().max(255),
});

const sellerEmailVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

const profileImageUpdateSchema = z.object({
  profileImageUrl: z.string().trim().url().max(2048).nullable(),
});

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  profileImageUrl: z.string().trim().url().max(2048).nullable(),
});

const passwordSetupSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200),
});

const pushAppSchema = z.enum(pushApps);
const pushAudienceRoleSchema = z.enum(pushAudienceRoles);

const webPushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(3000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

const pushSubscriptionUpsertSchema = z.object({
  app: pushAppSchema,
  subscription: webPushSubscriptionSchema,
});

const pushSubscriptionDeleteSchema = z.object({
  endpoint: z.string().trim().url().max(3000),
});

const pushSubscriptionTestSchema = z.object({
  app: pushAppSchema,
});

const adminPushRecipientsQuerySchema = z.object({
  app: pushAppSchema,
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const adminPushSendSchema = z.object({
  app: pushAppSchema,
  userIds: z.array(z.string().uuid()).min(1).max(200),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(240),
  url: z.string().trim().min(1).max(500),
  tag: z.string().trim().max(120).optional(),
  requireInteraction: z.boolean().optional(),
});

const buyerAccountActivationSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  token: z.string().trim().min(1).max(255).optional(),
});

const buyerAccountActivationVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(200),
  token: z.string().trim().min(1).max(255).optional(),
});

const passwordResetPortalSchema = z.enum(["SHOP", "ADMIN"]).default("SHOP");

const passwordResetRequestSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  portal: passwordResetPortalSchema,
});

const passwordResetVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(200),
  portal: passwordResetPortalSchema,
});

const legacyAccountActivationSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  token: z.string().trim().min(1).max(255).optional(),
});

const legacyAccountActivationVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(200),
  token: z.string().trim().min(1).max(255).optional(),
});

async function attachSessionUser(
  request: AuthedRequest,
  _response: Response,
  next: NextFunction,
) {
  try {
    request.sessionUser = await getSessionUser(
      request.cookies?.[env.SESSION_COOKIE_NAME],
    );
    next();
  } catch (error) {
    next(error);
  }
}

function attachDbContext(
  request: AuthedRequest,
  _response: Response,
  next: NextFunction,
) {
  runWithDbContext(
    {
      userId: request.sessionUser?.id ?? null,
      roles: request.sessionUser?.roles ?? [],
    },
    () => next(),
  );
}

function requireAuth(request: AuthedRequest) {
  if (!request.sessionUser) {
    throw new AppError("로그인이 필요합니다.", 401);
  }

  return request.sessionUser;
}

function isApprovalAdmin(user: NonNullable<AuthedRequest["sessionUser"]>) {
  return (
    user.roles.includes("ADMIN") &&
    isSellerApprovalAdminLoginId(user.threadsUsername)
  );
}

function requireSellerPortalVerified(request: AuthedRequest) {
  const user = requireAuth(request);

  if (!user.sellerEmailVerifiedAt) {
    throw new AppError(
      "판매자 사이트 이용 전 이메일 인증이 필요합니다.",
      403,
      "SELLER_EMAIL_VERIFICATION_REQUIRED",
    );
  }

  return user;
}

function requireSellerAccess(request: AuthedRequest) {
  const user = requireSellerPortalVerified(request);

  if (user.roles.includes("SELLER") || isApprovalAdmin(user)) {
    return user;
  }

  throw new AppError("판매자 승인 후 사용할 수 있습니다.", 403);
}

async function requireApprovalAdmin(request: AuthedRequest) {
  const user = requireSellerPortalVerified(request);

  if (isApprovalAdmin(user)) {
    const authStatus = await getSellerApprovalAdminAuthStatus({
      user,
      sessionToken: request.cookies?.[env.SESSION_COOKIE_NAME],
      cookieValue: request.cookies?.[sellerApprovalAuthCookieName],
    });

    if (!authStatus.totpEnabled) {
      throw new AppError(
        "판매자 승인용 Google OTP를 먼저 설정해 주세요.",
        403,
        "SELLER_APPROVAL_TOTP_SETUP_REQUIRED",
      );
    }

    if (!authStatus.verified) {
      throw new AppError(
        "판매자 승인 관리자 OTP 확인이 필요합니다.",
        401,
        "SELLER_APPROVAL_TOTP_REQUIRED",
      );
    }

    return user;
  }

  throw new AppError(
    "관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.",
    403,
  );
}

function getRequiredString(value: unknown, name: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (first) {
      return first;
    }
  }

  throw new AppError(`${name} parameter is required.`, 400);
}

function normalizeRateLimitValue(value?: string | null) {
  return value?.trim().toLowerCase() || "unknown";
}

function getOptionalString(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }

  return undefined;
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function getClientIp(request: Request) {
  const forwardedFor = request.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  if (forwardedIp) {
    return forwardedIp;
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}

function hasTrustedCsrfContext(request: Request) {
  if (request.get(csrfHeaderName) === csrfHeaderValue) {
    return true;
  }

  return [request.get("origin"), request.get("referer")]
    .map((value) => normalizeOrigin(value))
    .filter((origin): origin is string => Boolean(origin))
    .some((origin) => allowedOrigins.includes(origin));
}

function requireTrustedMutationRequest(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  if (!isUnsafeMethod(request.method) || hasTrustedCsrfContext(request)) {
    next();
    return;
  }

  next(
    new AppError(
      "잘못된 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
      403,
      "CSRF_VALIDATION_FAILED",
    ),
  );
}

function assertRateLimit(
  response: Response,
  input: {
    scope: string;
    key: string;
    max: number;
    windowMs: number;
    message: string;
    code: string;
  },
) {
  const result = consumeRateLimit({
    key: `${input.scope}:${input.key}`,
    max: input.max,
    windowMs: input.windowMs,
  });

  if (result.allowed) {
    return;
  }

  response.setHeader(
    "Retry-After",
    String(Math.max(Math.ceil(result.retryAfterMs / 1000), 1)),
  );
  throw new AppError(input.message, 429, input.code);
}

function getStringValues(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }

  return [];
}

function parsePushAudienceRoleFilters(value: unknown) {
  const uniqueRoles = new Set<z.infer<typeof pushAudienceRoleSchema>>();

  for (const rawValue of getStringValues(value)) {
    for (const token of rawValue.split(",")) {
      const normalized = token.trim();

      if (normalized) {
        uniqueRoles.add(pushAudienceRoleSchema.parse(normalized));
      }
    }
  }

  return [...uniqueRoles];
}

function isValidPushUrl(value: string) {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function asyncHandler(
  handler: (
    request: AuthedRequest,
    response: Response,
    next: NextFunction,
  ) => Promise<void>,
) {
  return (request: AuthedRequest, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

const adminAppOrigin =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "https://management.jinmarket.shop";
const shopAppOrigin =
  process.env.NEXT_PUBLIC_SHOP_APP_URL ?? "https://web.jinmarket.shop";
const deprecatedThreadsLoginMessage =
  "Threads 로그인은 종료되었습니다. 일반 로그인 또는 계정 전환을 이용해 주세요.";

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const knownAppOrigins = [
  adminAppOrigin,
  shopAppOrigin,
  "https://management.jinmarket.shop",
  "https://web.jinmarket.shop",
]
  .map((value) => normalizeOrigin(value))
  .filter(
    (value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index,
  );

function getFallbackReturnPath(origin: string) {
  return origin === normalizeOrigin(adminAppOrigin) ||
    origin === "https://management.jinmarket.shop"
    ? "/products"
    : "/";
}

function resolveDeprecatedThreadsTarget(request: Request) {
  const rawReturnTo =
    typeof request.query.return_to === "string"
      ? request.query.return_to
      : null;
  const resolvedOrigin =
    [rawReturnTo, request.get("origin"), request.get("referer")]
      .map((value) => normalizeOrigin(value))
      .find(
        (value) => typeof value === "string" && knownAppOrigins.includes(value),
      ) ??
    knownAppOrigins[0] ??
    "https://management.jinmarket.shop";
  const fallbackReturnTo = new URL(
    getFallbackReturnPath(resolvedOrigin),
    resolvedOrigin,
  );
  let resolvedReturnTo = fallbackReturnTo.toString();

  if (rawReturnTo) {
    try {
      const parsedReturnTo = new URL(rawReturnTo, resolvedOrigin);

      if (parsedReturnTo.origin === resolvedOrigin) {
        resolvedReturnTo = parsedReturnTo.toString();
      }
    } catch {
      resolvedReturnTo = fallbackReturnTo.toString();
    }
  }

  const loginUrl = new URL("/login", resolvedOrigin);
  loginUrl.searchParams.set("return_to", resolvedReturnTo);
  loginUrl.searchParams.set("error", deprecatedThreadsLoginMessage);

  return loginUrl.toString();
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        console.warn(`Blocked CORS origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    }),
  );
  app.use(requireTrustedMutationRequest);
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(attachSessionUser);
  app.use(attachDbContext);

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/push/config", (_request, response) => {
    response.json({
      configured: isWebPushConfigured(),
      publicKey: getPublicWebPushKey(),
    });
  });

  app.get("/auth/threads/login", (request, response) => {
    response.redirect(302, resolveDeprecatedThreadsTarget(request));
  });

  app.get("/auth/callback", (request, response) => {
    response.redirect(302, resolveDeprecatedThreadsTarget(request));
  });

  app.post(
    "/auth/login",
    asyncHandler(async (request, response) => {
      const parsed = loginSchema.parse(request.body) as Parameters<
        typeof loginWithPassword
      >[0];
      const clientIp = getClientIp(request);
      const normalizedLoginId = normalizeRateLimitValue(parsed.loginId);

      assertRateLimit(response, {
        scope: "auth-login-ip",
        key: clientIp,
        max: 30,
        windowMs: 10 * minuteMs,
        message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "LOGIN_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "auth-login-account",
        key: `${clientIp}:${normalizedLoginId}`,
        max: 10,
        windowMs: 10 * minuteMs,
        message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "LOGIN_RATE_LIMITED",
      });

      const session = await loginWithPassword(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.json({
        user: session.user,
        message: "로그인되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/register",
    asyncHandler(async (request, response) => {
      const parsed = buyerSignupSchema.parse(request.body) as Parameters<
        typeof registerBuyerAccount
      >[0];
      const clientIp = getClientIp(request);
      const signupTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "auth-register-ip",
        key: clientIp,
        max: 8,
        windowMs: 15 * minuteMs,
        message: "회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "REGISTER_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "auth-register-target",
        key: `${clientIp}:${signupTargetKey}`,
        max: 3,
        windowMs: 15 * minuteMs,
        message: "회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "REGISTER_RATE_LIMITED",
      });

      const session = await registerBuyerAccount(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "회원가입이 완료되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/register/request-code",
    asyncHandler(async (request, response) => {
      const parsed = signupRequestSchema.parse(request.body) as Parameters<
        typeof requestSignupVerification
      >[0];
      const clientIp = getClientIp(request);
      const signupTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "auth-signup-request-ip",
        key: clientIp,
        max: 12,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SIGNUP_REQUEST_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "auth-signup-request-target",
        key: `${clientIp}:${signupTargetKey}`,
        max: 4,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SIGNUP_REQUEST_RATE_LIMITED",
      });

      await requestSignupVerification(parsed);
      response.status(201).json({
        ok: true,
        message:
          "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요.",
      });
    }),
  );

  app.post(
    "/auth/register/verify",
    asyncHandler(async (request, response) => {
      const parsed = signupVerifySchema.parse(request.body) as Parameters<
        typeof verifySignupCode
      >[0];
      const clientIp = getClientIp(request);
      const signupTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "auth-signup-verify-ip",
        key: clientIp,
        max: 20,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SIGNUP_VERIFY_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "auth-signup-verify-target",
        key: `${clientIp}:${signupTargetKey}`,
        max: 8,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SIGNUP_VERIFY_RATE_LIMITED",
      });

      const session = await verifySignupCode(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "이메일 인증이 완료되어 회원가입이 처리되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/seller-email/request-code",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = sellerEmailRequestSchema.parse(request.body) as Parameters<
        typeof requestSellerEmailVerification
      >[1];

      assertRateLimit(response, {
        scope: "seller-email-request-user",
        key: `${getClientIp(request)}:${user.id}`,
        max: 6,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SELLER_EMAIL_REQUEST_RATE_LIMITED",
      });

      await requestSellerEmailVerification(user.id, parsed);
      response.status(201).json({
        ok: true,
        message:
          "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요.",
      });
    }),
  );

  app.post(
    "/auth/seller-email/verify",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = sellerEmailVerifySchema.parse(request.body) as Parameters<
        typeof verifySellerEmailVerification
      >[1];

      assertRateLimit(response, {
        scope: "seller-email-verify-user",
        key: `${getClientIp(request)}:${user.id}`,
        max: 10,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SELLER_EMAIL_VERIFY_RATE_LIMITED",
      });

      const verifiedUser = await verifySellerEmailVerification(user.id, parsed);
      response.status(201).json({
        user: verifiedUser,
        message: "판매자 사이트 이메일 인증이 완료되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/buyer-email/request-code",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = sellerEmailRequestSchema.parse(request.body) as Parameters<
        typeof requestBuyerEmailVerification
      >[1];

      assertRateLimit(response, {
        scope: "buyer-email-request-user",
        key: `${getClientIp(request)}:${user.id}`,
        max: 6,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "BUYER_EMAIL_REQUEST_RATE_LIMITED",
      });

      await requestBuyerEmailVerification(user.id, parsed);
      response.status(201).json({
        ok: true,
        message:
          "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요.",
      });
    }),
  );

  app.post(
    "/auth/buyer-email/verify",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = sellerEmailVerifySchema.parse(request.body) as Parameters<
        typeof verifyBuyerEmailVerification
      >[1];

      assertRateLimit(response, {
        scope: "buyer-email-verify-user",
        key: `${getClientIp(request)}:${user.id}`,
        max: 10,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "BUYER_EMAIL_VERIFY_RATE_LIMITED",
      });

      const verifiedUser = await verifyBuyerEmailVerification(user.id, parsed);
      response.status(201).json({
        user: verifiedUser,
        message: "복구 이메일 등록이 완료되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/buyer-activate/request-code",
    asyncHandler(async (request, response) => {
      const parsed = buyerAccountActivationSchema.parse(
        request.body,
      ) as Parameters<typeof requestBuyerAccountActivation>[0];
      const clientIp = getClientIp(request);
      const activationTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "buyer-activation-request-ip",
        key: clientIp,
        max: 12,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "BUYER_ACTIVATION_REQUEST_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "buyer-activation-request-target",
        key: `${clientIp}:${activationTargetKey}`,
        max: 4,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "BUYER_ACTIVATION_REQUEST_RATE_LIMITED",
      });

      await requestBuyerAccountActivation(parsed);
      response.status(201).json({
        ok: true,
        message:
          "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요.",
      });
    }),
  );

  app.post(
    "/auth/buyer-activate/verify",
    asyncHandler(async (request, response) => {
      const parsed = buyerAccountActivationVerifySchema.parse(
        request.body,
      ) as Parameters<typeof verifyBuyerAccountActivation>[0];
      const clientIp = getClientIp(request);
      const activationTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "buyer-activation-verify-ip",
        key: clientIp,
        max: 20,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "BUYER_ACTIVATION_VERIFY_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "buyer-activation-verify-target",
        key: `${clientIp}:${activationTargetKey}`,
        max: 8,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "BUYER_ACTIVATION_VERIFY_RATE_LIMITED",
      });

      const session = await verifyBuyerAccountActivation(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "기존 구매자 계정 활성화가 완료되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/dev-login",
    asyncHandler(async (request, response) => {
      throw new AppError(
        "개발용 로그인은 더 이상 사용할 수 없습니다.",
        403,
        "DEV_LOGIN_DISABLED",
      );
    }),
  );

  app.post(
    "/auth/password/setup",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = passwordSetupSchema.parse(request.body) as Omit<
        Parameters<typeof changePassword>[0],
        "userId"
      >;

      assertRateLimit(response, {
        scope: "password-setup-user",
        key: `${getClientIp(request)}:${user.id}`,
        max: 10,
        windowMs: 10 * minuteMs,
        message: "비밀번호 변경 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "PASSWORD_SETUP_RATE_LIMITED",
      });

      const session = await changePassword({
        userId: user.id,
        ...parsed,
      });

      clearSellerApprovalAuthCookie(response);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: user.hasLocalPassword
          ? "비밀번호가 변경되었습니다."
          : "비밀번호가 설정되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/password/reset/request-code",
    asyncHandler(async (request, response) => {
      const parsed = passwordResetRequestSchema.parse(
        request.body,
      ) as Parameters<typeof requestPasswordReset>[0];
      const clientIp = getClientIp(request);
      const resetTargetKey = `${normalizeRateLimitValue(parsed.portal)}:${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "password-reset-request-ip",
        key: clientIp,
        max: 12,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "PASSWORD_RESET_REQUEST_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "password-reset-request-target",
        key: `${clientIp}:${resetTargetKey}`,
        max: 4,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "PASSWORD_RESET_REQUEST_RATE_LIMITED",
      });

      await requestPasswordReset(parsed);
      response.status(201).json({
        ok: true,
        message: "입력한 정보가 일치하면 인증번호를 이메일로 보냈습니다.",
      });
    }),
  );

  app.post(
    "/auth/password/reset/verify",
    asyncHandler(async (request, response) => {
      const parsed = passwordResetVerifySchema.parse(
        request.body,
      ) as Parameters<typeof verifyPasswordReset>[0];
      const clientIp = getClientIp(request);
      const resetTargetKey = `${normalizeRateLimitValue(parsed.portal)}:${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "password-reset-verify-ip",
        key: clientIp,
        max: 20,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "PASSWORD_RESET_VERIFY_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "password-reset-verify-target",
        key: `${clientIp}:${resetTargetKey}`,
        max: 8,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "PASSWORD_RESET_VERIFY_RATE_LIMITED",
      });

      const session = await verifyPasswordReset(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "비밀번호가 재설정되었습니다.",
      });
    }),
  );

  app.post(
    "/auth/legacy-activate/request-code",
    asyncHandler(async (request, response) => {
      const parsed = legacyAccountActivationSchema.parse(
        request.body,
      ) as Parameters<typeof requestLegacyAccountActivation>[0];
      const clientIp = getClientIp(request);
      const activationTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "legacy-activation-request-ip",
        key: clientIp,
        max: 12,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "LEGACY_ACTIVATION_REQUEST_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "legacy-activation-request-target",
        key: `${clientIp}:${activationTargetKey}`,
        max: 4,
        windowMs: 15 * minuteMs,
        message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "LEGACY_ACTIVATION_REQUEST_RATE_LIMITED",
      });

      await requestLegacyAccountActivation(parsed);
      response.status(201).json({
        ok: true,
        message:
          "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요.",
      });
    }),
  );

  app.post(
    "/auth/legacy-activate/verify",
    asyncHandler(async (request, response) => {
      const parsed = legacyAccountActivationVerifySchema.parse(
        request.body,
      ) as Parameters<typeof verifyLegacyAccountActivation>[0];
      const clientIp = getClientIp(request);
      const activationTargetKey = `${normalizeRateLimitValue(parsed.loginId)}:${normalizeRateLimitValue(parsed.email)}`;

      assertRateLimit(response, {
        scope: "legacy-activation-verify-ip",
        key: clientIp,
        max: 20,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "LEGACY_ACTIVATION_VERIFY_RATE_LIMITED",
      });
      assertRateLimit(response, {
        scope: "legacy-activation-verify-target",
        key: `${clientIp}:${activationTargetKey}`,
        max: 8,
        windowMs: 15 * minuteMs,
        message: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "LEGACY_ACTIVATION_VERIFY_RATE_LIMITED",
      });

      const session = await verifyLegacyAccountActivation(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message:
          "기존 계정 전환이 완료되었습니다. 이제 아이디와 비밀번호로 로그인할 수 있습니다.",
      });
    }),
  );

  app.get(
    "/me",
    asyncHandler(async (request, response) => {
      response.json({ user: request.sessionUser ?? null });
    }),
  );

  app.get(
    "/me/minigames/lucky-rps",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      response.json(await getLuckyRpsStatus(user.id));
    }),
  );

  app.post(
    "/me/minigames/lucky-rps/play",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = gamePlaySchema.parse(request.body);
      response.json(await playLuckyRpsRound(user.id, parsed.playerChoice));
    }),
  );

  app.post(
    "/me/push-subscriptions",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = pushSubscriptionUpsertSchema.parse(request.body);
      await saveWebPushSubscription({
        userId: user.id,
        app: parsed.app,
        subscription: parsed.subscription as WebPushSubscriptionPayload,
        userAgent: request.get("user-agent"),
      });
      response.status(201).json({
        ok: true,
        message: "푸시 알림이 활성화되었습니다.",
      });
    }),
  );

  app.delete(
    "/me/push-subscriptions",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = pushSubscriptionDeleteSchema.parse(request.body);
      await removeWebPushSubscription(user.id, parsed.endpoint);
      response.json({
        ok: true,
        message: "푸시 알림이 해제되었습니다.",
      });
    }),
  );

  app.post(
    "/me/push-subscriptions/test",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = pushSubscriptionTestSchema.parse(request.body);
      const result = await sendTestPushNotification(user.id, parsed.app);
      const message =
        result.delivered > 0
          ? "테스트 알림을 전송했습니다."
          : result.skipped === "vapid-not-configured"
            ? "웹 푸시 VAPID 키가 아직 설정되지 않았습니다."
            : "활성화된 푸시 구독이 없습니다.";

      response.json({
        ok: true,
        result,
        message,
      });
    }),
  );

  app.post(
    "/me/profile-image/sign",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      response.json(signProfileImageUpload(user));
    }),
  );

  app.patch(
    "/me/profile",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const payload = profileUpdateSchema.parse(request.body);
      const updatedUser = await updateProfile(user.id, payload);
      response.json({
        user: updatedUser,
        message: "프로필이 저장되었습니다.",
      });
    }),
  );

  app.patch(
    "/me/profile-image",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const { profileImageUrl } = profileImageUpdateSchema.parse(request.body);
      const updatedUser = await updateProfileImage(user.id, profileImageUrl);
      response.json({
        user: updatedUser,
        message: "프로필 사진이 저장되었습니다.",
      });
    }),
  );

  app.get(
    "/admin/seller-access/me",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);
      response.json(await getSellerAccessOverview(user));
    }),
  );

  app.post(
    "/admin/seller-access/me/request",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);
      const item = await createSellerAccessRequest(user);
      response.status(201).json({
        item,
        message:
          "판매자 승인 신청이 접수되었습니다. 관리자 계정이 확인 후 승인하면 상품을 등록할 수 있습니다.",
      });
    }),
  );

  app.get(
    "/admin/seller-access/auth",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);

      response.json(
        await getSellerApprovalAdminAuthStatus({
          user,
          sessionToken: request.cookies?.[env.SESSION_COOKIE_NAME],
          cookieValue: request.cookies?.[sellerApprovalAuthCookieName],
        }),
      );
    }),
  );

  app.post(
    "/admin/seller-access/auth/setup",
    asyncHandler(async (request, _response) => {
      const user = requireSellerPortalVerified(request);

      if (!isApprovalAdmin(user)) {
        throw new AppError(
          "관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.",
          403,
        );
      }

      throw new AppError(
        "판매자 승인용 Google OTP는 운영자가 미리 고정 등록해야 합니다.",
        403,
        "SELLER_APPROVAL_TOTP_SELF_SERVICE_DISABLED",
      );
    }),
  );

  app.post(
    "/admin/seller-access/auth/setup/verify",
    asyncHandler(async (request, _response) => {
      const user = requireSellerPortalVerified(request);

      if (!isApprovalAdmin(user)) {
        throw new AppError(
          "관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.",
          403,
        );
      }

      throw new AppError(
        "판매자 승인용 Google OTP는 운영자가 미리 고정 등록해야 합니다.",
        403,
        "SELLER_APPROVAL_TOTP_SELF_SERVICE_DISABLED",
      );
    }),
  );

  app.post(
    "/admin/seller-access/auth",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);

      if (!isApprovalAdmin(user)) {
        throw new AppError(
          "관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.",
          403,
        );
      }

      const sessionToken = request.cookies?.[env.SESSION_COOKIE_NAME];

      if (!sessionToken) {
        throw new AppError("로그인이 필요합니다.", 401);
      }

      const { code } = sellerApprovalTotpCodeSchema.parse(request.body);

      assertRateLimit(response, {
        scope: "seller-approval-otp-user",
        key: `${getClientIp(request)}:${user.id}`,
        max: 6,
        windowMs: 10 * minuteMs,
        message: "OTP 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "SELLER_APPROVAL_TOTP_RATE_LIMITED",
      });

      const credential = await verifySellerApprovalTotp(user.id, code);
      setSellerApprovalAuthCookie(
        response,
        sessionToken,
        user.id,
        credential.updated_at.toISOString(),
      );
      response.json({ ok: true, message: "Google OTP 확인이 완료되었습니다." });
    }),
  );

  app.get(
    "/admin/seller-access",
    asyncHandler(async (request, response) => {
      await requireApprovalAdmin(request);
      response.json({ items: await listPendingSellerAccessRequests() });
    }),
  );

  app.get(
    "/admin/push/audiences",
    asyncHandler(async (request, response) => {
      await requireApprovalAdmin(request);
      const { app } = adminPushRecipientsQuerySchema.parse(request.query);
      response.json({
        app,
        items: await listPushAudienceSummaries(app),
      });
    }),
  );

  app.get(
    "/admin/push/recipients",
    asyncHandler(async (request, response) => {
      await requireApprovalAdmin(request);
      const parsed = adminPushRecipientsQuerySchema.parse(request.query);
      const roles = parsePushAudienceRoleFilters(request.query.roles);
      response.json({
        app: parsed.app,
        roles,
        items: await listPushRecipients({
          app: parsed.app,
          roles,
          search: parsed.search,
          limit: parsed.limit,
        }),
      });
    }),
  );

  app.post(
    "/admin/push/send",
    asyncHandler(async (request, response) => {
      await requireApprovalAdmin(request);
      const parsed = adminPushSendSchema.parse(request.body);

      if (!isValidPushUrl(parsed.url)) {
        throw new AppError(
          "알림을 눌렀을 때 이동할 경로를 올바르게 입력해 주세요.",
          400,
        );
      }

      const result = await sendPushNotificationToUsers(parsed as Omit<PushNotificationInput, "userId"> & { userIds: string[] });
      const message =
        result.delivered > 0
          ? `${result.usersWithDelivery}명에게 푸시를 전송했습니다.`
          : result.usersSkippedDueToConfig > 0
            ? "웹 푸시 VAPID 키가 아직 설정되지 않았습니다."
            : "선택한 사용자 중 활성화된 푸시 구독이 없습니다.";

      response.status(201).json({
        ok: true,
        result,
        message,
      });
    }),
  );

  app.post(
    "/admin/seller-access/:requestId/approve",
    asyncHandler(async (request, response) => {
      const adminUser = await requireApprovalAdmin(request);
      const requestId = getRequiredString(
        request.params.requestId,
        "requestId",
      );
      const item = await approveSellerAccessRequest(requestId, adminUser.id);
      response.json({
        item,
        message:
          "판매자 승인 요청을 수락했고, 이제 해당 계정에서 상품을 등록할 수 있습니다.",
      });
    }),
  );

  app.post(
    "/auth/logout",
    asyncHandler(async (request, response) => {
      await logout(request.cookies?.[env.SESSION_COOKIE_NAME]);
      clearSellerApprovalAuthCookie(response);
      clearSessionCookie(response);
      response.json({ ok: true });
    }),
  );

  app.get(
    "/events",
    asyncHandler(async (_request, response) => {
      response.json({ items: await listPublicEvents() });
    }),
  );

  app.get(
    "/events/:eventId",
    asyncHandler(async (request, response) => {
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({
        item: await getPublicEventDetail(eventId, request.sessionUser?.id),
      });
    }),
  );

  app.post(
    "/events/:eventId/entries",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      const item = await createEventEntry(user.id, eventId);
      response.status(201).json({
        item,
        message: "이벤트 응모가 완료되었습니다. 당첨 발표를 기다려 주세요.",
      });
    }),
  );

  app.get(
    "/products",
    asyncHandler(async (_request, response) => {
      response.json({ items: await listProducts() });
    }),
  );

  app.get(
    "/products/:productId",
    asyncHandler(async (request, response) => {
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      response.json({
        item: await getProductDetail(productId, request.sessionUser?.id),
      });
    }),
  );

  app.post(
    "/products/:productId/purchase",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      const result = await purchaseInstantProduct(user.id, productId);
      response.json({
        order: result.order,
        message: result.isFreeShare
          ? "무료 나눔 신청이 완료되었습니다. 판매자가 전달 방법 안내를 위해 직접 연락할 예정입니다."
          : "구매가 완료되었습니다. 판매자가 계좌이체 안내를 위해 직접 연락할 예정입니다.",
      });
    }),
  );

  app.post(
    "/products/:productId/game-purchase/play",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      const parsed = gamePlaySchema.parse(request.body);
      response.json(
        await playGamePurchase(user.id, productId, parsed.playerChoice),
      );
    }),
  );

  app.post(
    "/products/:productId/price-offers",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      const item = await createPriceOffer(
        user.id,
        productId,
        request.body as CreatePriceOfferInput,
      );
      response.status(201).json({
        item,
        message:
          "가격 제안이 등록되었습니다. 상품은 계속 판매 중이므로 다른 사용자는 그대로 구매할 수 있습니다.",
      });
    }),
  );

  app.get(
    "/me/orders",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      response.json({ items: await listMyOrders(user.id) });
    }),
  );

  app.post(
    "/uploads/sign",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json(signCloudinaryUpload(user));
    }),
  );

  app.get(
    "/admin/events",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json({ items: await listSellerEvents(user.id) });
    }),
  );

  app.get(
    "/admin/events/:eventId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({ item: await getSellerEventDetail(user.id, eventId) });
    }),
  );

  app.post(
    "/admin/events",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const item = await createEvent(user.id, request.body as CreateEventInput);
      response.status(201).json({ item });
    }),
  );

  app.patch(
    "/admin/events/:eventId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      const item = await updateSellerEvent(
        user.id,
        eventId,
        request.body as UpdateEventInput,
      );
      response.json({ item });
    }),
  );

  app.get(
    "/admin/events/:eventId/entries",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({ items: await listEventEntries(user.id, eventId) });
    }),
  );

  app.get(
    "/admin/events/:eventId/draw-source",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({ item: await getEventDrawSource(user.id, eventId) });
    }),
  );

  app.get(
    "/admin/products",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json({ items: await listSellerProducts(user.id) });
    }),
  );

  app.get(
    "/admin/products/:productId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      response.json({ item: await getSellerProductDetail(user.id, productId) });
    }),
  );

  app.post(
    "/admin/products",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const item = await createProduct(
        user.id,
        request.body as CreateProductInput,
      );
      response.status(201).json({ item });
    }),
  );

  app.patch(
    "/admin/products/:productId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      const item = await updateSellerProduct(
        user.id,
        productId,
        request.body as UpdateProductInput,
      );
      response.json({ item });
    }),
  );

  app.delete(
    "/admin/products/:productId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      await deleteProduct(user.id, productId);
      response.json({ ok: true });
    }),
  );

  app.get(
    "/admin/products/:productId/game-attempts",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      response.json({
        items: await listProductGameAttempts(user.id, productId),
      });
    }),
  );

  app.get(
    "/admin/products/:productId/price-offers",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      response.json({
        items: await listProductPriceOffers(user.id, productId),
      });
    }),
  );

  app.post(
    "/admin/products/:productId/price-offers/:offerId/accept",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(
        request.params.productId,
        "productId",
      );
      const offerId = getRequiredString(request.params.offerId, "offerId");
      const result = await acceptPriceOffer(user.id, productId, offerId);
      response.json({
        ...result,
        message:
          "가격 제안을 수락했고 상품을 품절 처리했습니다. 판매자가 계좌이체 안내를 위해 직접 연락할 예정입니다.",
      });
    }),
  );

  app.get(
    "/admin/orders",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json({ items: await listSellerOrders(user.id) });
    }),
  );

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        response.status(400).json({
          message: "입력값이 올바르지 않습니다.",
          issues: error.flatten(),
        });
        return;
      }

      if (error instanceof AppError) {
        response.status(error.statusCode).json({
          message: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
        return;
      }

      console.error(error);
      response.status(500).json({ message: "서버 오류가 발생했습니다." });
    },
  );

  return app;
}

const app = createApp();

export default app;
