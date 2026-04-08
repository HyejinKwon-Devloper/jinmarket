import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import {
  type CreateEventInput,
  gameChoices,
  type CreatePriceOfferInput,
  type CreateProductInput,
  type UpdateProductInput
} from "../../shared/src/index.js";

import { AppError } from "./errors.js";
import { allowedOrigins, env } from "./env.js";
import {
  clearSellerApprovalAuthCookie,
  clearSessionCookie,
  getSessionUser,
  hasSellerApprovalAuthCookie,
  loginWithPassword,
  logout,
  registerBuyerAccount,
  requestLegacyAccountActivation,
  requestPasswordReset,
  requestSignupVerification,
  requestSellerEmailVerification,
  sellerApprovalAuthCookieName,
  setSessionCookie,
  setSellerApprovalAuthCookie,
  verifyLegacyAccountActivation,
  verifyPasswordReset,
  verifySellerEmailVerification,
  verifySignupCode,
  verifySellerApprovalAdminPassword
} from "./services/auth-service.js";
import {
  createEvent,
  createEventEntry,
  getEventDrawSource,
  getPublicEventDetail,
  getSellerEventDetail,
  listEventEntries,
  listPublicEvents,
  listSellerEvents,
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
  updateSellerProduct
} from "./services/product-service.js";
import { playGamePurchase, purchaseInstantProduct } from "./services/purchase-service.js";
import {
  approveSellerAccessRequest,
  createSellerAccessRequest,
  getSellerAccessOverview,
  listPendingSellerAccessRequests
} from "./services/seller-access-service.js";

type AuthedRequest = Request & {
  sessionUser?: Awaited<ReturnType<typeof getSessionUser>>;
};

const gamePlaySchema = z.object({
  playerChoice: z.enum(gameChoices)
});

const sellerApprovalPasswordSchema = z.object({
  password: z.string().min(1).max(200)
});

const loginSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  password: z.string().min(1).max(200)
});

const buyerSignupSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(60),
  password: z.string().min(8).max(200)
});

const signupRequestSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200)
});

const signupVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z.string().trim().regex(/^\d{6}$/)
});

const sellerEmailRequestSchema = z.object({
  email: z.string().trim().email().max(255)
});

const sellerEmailVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
});

const passwordResetPortalSchema = z.enum(["SHOP", "ADMIN"]).default("SHOP");

const passwordResetRequestSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  portal: passwordResetPortalSchema
});

const passwordResetVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(200),
  portal: passwordResetPortalSchema
});

const legacyAccountActivationSchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  token: z.string().trim().min(1).max(255).optional()
});

const legacyAccountActivationVerifySchema = z.object({
  loginId: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(200),
  token: z.string().trim().min(1).max(255).optional()
});

async function attachSessionUser(request: AuthedRequest, _response: Response, next: NextFunction) {
  try {
    request.sessionUser = await getSessionUser(request.cookies?.[env.SESSION_COOKIE_NAME]);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(request: AuthedRequest) {
  if (!request.sessionUser) {
    throw new AppError("로그인이 필요합니다.", 401);
  }

  return request.sessionUser;
}

function isApprovalAdmin(user: NonNullable<AuthedRequest["sessionUser"]>) {
  return user.roles.includes("ADMIN");
}

function requireSellerPortalVerified(request: AuthedRequest) {
  const user = requireAuth(request);

  if (!user.sellerEmailVerifiedAt) {
    throw new AppError(
      "판매자 사이트 이용 전 이메일 인증이 필요합니다.",
      403,
      "SELLER_EMAIL_VERIFICATION_REQUIRED"
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

function requireApprovalAdmin(request: AuthedRequest) {
  const user = requireSellerPortalVerified(request);

  if (isApprovalAdmin(user)) {
    const sessionToken = request.cookies?.[env.SESSION_COOKIE_NAME];
    const approvalCookie = request.cookies?.[sellerApprovalAuthCookieName];
    const isVerified = hasSellerApprovalAuthCookie({
      sessionToken,
      userId: user.id,
      cookieValue: approvalCookie
    });

    if (!isVerified) {
      throw new AppError("판매자 승인 관리자 비밀번호 확인이 필요합니다.", 401);
    }

    return user;
  }

  throw new AppError("관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.", 403);
}

function getRequiredString(value: unknown, name: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === "string" && item.length > 0);
    if (first) {
      return first;
    }
  }

  throw new AppError(`${name} parameter is required.`, 400);
}

function getOptionalString(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string" && item.length > 0);
  }

  return undefined;
}

function asyncHandler(
  handler: (request: AuthedRequest, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: AuthedRequest, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
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
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(attachSessionUser);

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/auth/threads/login", () => {
    throw new AppError("Threads OAuth 로그인은 더 이상 지원하지 않습니다.", 410);
  });

  app.get("/auth/callback", () => {
    throw new AppError("Threads OAuth 로그인은 더 이상 지원하지 않습니다.", 410);
  });

  app.post(
    "/auth/login",
    asyncHandler(async (request, response) => {
      const parsed = loginSchema.parse(request.body) as Parameters<typeof loginWithPassword>[0];
      const session = await loginWithPassword(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.json({
        user: session.user,
        message: "로그인되었습니다."
      });
    })
  );

  app.post(
    "/auth/register",
    asyncHandler(async (request, response) => {
      const parsed = buyerSignupSchema.parse(request.body) as Parameters<typeof registerBuyerAccount>[0];
      const session = await registerBuyerAccount(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "회원가입이 완료되었습니다."
      });
    })
  );

  app.post(
    "/auth/register/request-code",
    asyncHandler(async (request, response) => {
      const parsed = signupRequestSchema.parse(request.body) as Parameters<
        typeof requestSignupVerification
      >[0];
      await requestSignupVerification(parsed);
      response.status(201).json({
        ok: true,
        message: "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요."
      });
    })
  );

  app.post(
    "/auth/register/verify",
    asyncHandler(async (request, response) => {
      const parsed = signupVerifySchema.parse(request.body) as Parameters<typeof verifySignupCode>[0];
      const session = await verifySignupCode(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "이메일 인증이 완료되어 회원가입이 처리되었습니다."
      });
    })
  );

  app.post(
    "/auth/seller-email/request-code",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = sellerEmailRequestSchema.parse(request.body) as Parameters<
        typeof requestSellerEmailVerification
      >[1];
      await requestSellerEmailVerification(user.id, parsed);
      response.status(201).json({
        ok: true,
        message: "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요."
      });
    })
  );

  app.post(
    "/auth/seller-email/verify",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const parsed = sellerEmailVerifySchema.parse(request.body) as Parameters<
        typeof verifySellerEmailVerification
      >[1];
      const verifiedUser = await verifySellerEmailVerification(user.id, parsed);
      response.status(201).json({
        user: verifiedUser,
        message: "판매자 사이트 이메일 인증이 완료되었습니다."
      });
    })
  );

  app.post(
    "/auth/dev-login",
    asyncHandler(async (request, response) => {
      throw new AppError("개발용 로그인은 더 이상 사용할 수 없습니다.", 403, "DEV_LOGIN_DISABLED");
    })
  );

  app.post(
    "/auth/password/setup",
    asyncHandler(async () => {
      throw new AppError("비밀번호 설정 변경 기능은 아직 제공되지 않습니다.", 410);
    })
  );

  app.post(
    "/auth/password/reset/request-code",
    asyncHandler(async (request, response) => {
      const parsed = passwordResetRequestSchema.parse(request.body) as Parameters<
        typeof requestPasswordReset
      >[0];
      await requestPasswordReset(parsed);
      response.status(201).json({
        ok: true,
        message: "입력한 정보가 일치하면 인증번호를 이메일로 보냈습니다."
      });
    })
  );

  app.post(
    "/auth/password/reset/verify",
    asyncHandler(async (request, response) => {
      const parsed = passwordResetVerifySchema.parse(request.body) as Parameters<
        typeof verifyPasswordReset
      >[0];
      const session = await verifyPasswordReset(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "비밀번호가 재설정되었습니다."
      });
    })
  );

  app.post(
    "/auth/legacy-activate/request-code",
    asyncHandler(async (request, response) => {
      const parsed = legacyAccountActivationSchema.parse(request.body) as Parameters<
        typeof requestLegacyAccountActivation
      >[0];
      await requestLegacyAccountActivation(parsed);
      response.status(201).json({
        ok: true,
        message: "인증번호를 이메일로 보냈습니다. 메일함에서 6자리 코드를 확인해 주세요."
      });
    })
  );

  app.post(
    "/auth/legacy-activate/verify",
    asyncHandler(async (request, response) => {
      const parsed = legacyAccountActivationVerifySchema.parse(request.body) as Parameters<
        typeof verifyLegacyAccountActivation
      >[0];
      const session = await verifyLegacyAccountActivation(parsed);
      setSessionCookie(response, session.sessionToken, session.expiresAt);
      response.status(201).json({
        user: session.user,
        message: "기존 계정 전환이 완료되었습니다. 이제 아이디와 비밀번호로 로그인할 수 있습니다."
      });
    })
  );

  app.get(
    "/me",
    asyncHandler(async (request, response) => {
      response.json({ user: request.sessionUser ?? null });
    })
  );

  app.get(
    "/admin/seller-access/me",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);
      response.json(await getSellerAccessOverview(user));
    })
  );

  app.post(
    "/admin/seller-access/me/request",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);
      const item = await createSellerAccessRequest(user);
      response.status(201).json({
        item,
        message: "판매자 승인 신청이 접수되었습니다. 관리자 계정이 확인 후 승인하면 상품을 등록할 수 있습니다."
      });
    })
  );

  app.get(
    "/admin/seller-access/auth",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);

      if (!isApprovalAdmin(user)) {
        response.json({ eligible: false, verified: false });
        return;
      }

      response.json({
        eligible: true,
        verified: hasSellerApprovalAuthCookie({
          sessionToken: request.cookies?.[env.SESSION_COOKIE_NAME],
          userId: user.id,
          cookieValue: request.cookies?.[sellerApprovalAuthCookieName]
        })
      });
    })
  );

  app.post(
    "/admin/seller-access/auth",
    asyncHandler(async (request, response) => {
      const user = requireSellerPortalVerified(request);

      if (!isApprovalAdmin(user)) {
        throw new AppError("관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.", 403);
      }

      const sessionToken = request.cookies?.[env.SESSION_COOKIE_NAME];

      if (!sessionToken) {
        throw new AppError("로그인이 필요합니다.", 401);
      }

      const { password } = sellerApprovalPasswordSchema.parse(request.body);
      verifySellerApprovalAdminPassword(password);
      setSellerApprovalAuthCookie(response, sessionToken, user.id);
      response.json({ ok: true });
    })
  );

  app.get(
    "/admin/seller-access",
    asyncHandler(async (request, response) => {
      requireApprovalAdmin(request);
      response.json({ items: await listPendingSellerAccessRequests() });
    })
  );

  app.post(
    "/admin/seller-access/:requestId/approve",
    asyncHandler(async (request, response) => {
      const adminUser = requireApprovalAdmin(request);
      const requestId = getRequiredString(request.params.requestId, "requestId");
      const item = await approveSellerAccessRequest(requestId, adminUser.id);
      response.json({
        item,
        message: "판매자 승인 요청을 수락했고, 이제 해당 계정에서 상품을 등록할 수 있습니다."
      });
    })
  );

  app.post(
    "/auth/logout",
    asyncHandler(async (request, response) => {
      await logout(request.cookies?.[env.SESSION_COOKIE_NAME]);
      clearSellerApprovalAuthCookie(response);
      clearSessionCookie(response);
      response.json({ ok: true });
    })
  );

  app.get(
    "/events",
    asyncHandler(async (_request, response) => {
      response.json({ items: await listPublicEvents() });
    })
  );

  app.get(
    "/events/:eventId",
    asyncHandler(async (request, response) => {
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({
        item: await getPublicEventDetail(eventId, request.sessionUser?.id),
      });
    })
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
    })
  );

  app.get(
    "/products",
    asyncHandler(async (_request, response) => {
      response.json({ items: await listProducts() });
    })
  );

  app.get(
    "/products/:productId",
    asyncHandler(async (request, response) => {
      const productId = getRequiredString(request.params.productId, "productId");
      response.json({
        item: await getProductDetail(productId, request.sessionUser?.id)
      });
    })
  );

  app.post(
    "/products/:productId/purchase",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const productId = getRequiredString(request.params.productId, "productId");
      const result = await purchaseInstantProduct(user.id, productId);
      response.json({
        order: result.order,
        message: result.isFreeShare
          ? "무료 나눔 신청이 완료되었습니다. 판매자가 전달 방법 안내를 위해 직접 연락할 예정입니다."
          : "구매가 완료되었습니다. 판매자가 계좌이체 안내를 위해 직접 연락할 예정입니다."
      });
    })
  );

  app.post(
    "/products/:productId/game-purchase/play",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const productId = getRequiredString(request.params.productId, "productId");
      const parsed = gamePlaySchema.parse(request.body);
      response.json(await playGamePurchase(user.id, productId, parsed.playerChoice));
    })
  );

  app.post(
    "/products/:productId/price-offers",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      const productId = getRequiredString(request.params.productId, "productId");
      const item = await createPriceOffer(user.id, productId, request.body as CreatePriceOfferInput);
      response.status(201).json({
        item,
        message: "가격 제안이 등록되었습니다. 상품은 계속 판매 중이므로 다른 사용자는 그대로 구매할 수 있습니다."
      });
    })
  );

  app.get(
    "/me/orders",
    asyncHandler(async (request, response) => {
      const user = requireAuth(request);
      response.json({ items: await listMyOrders(user.id) });
    })
  );

  app.post(
    "/uploads/sign",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json(signCloudinaryUpload(user));
    })
  );

  app.get(
    "/admin/events",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json({ items: await listSellerEvents(user.id) });
    })
  );

  app.get(
    "/admin/events/:eventId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({ item: await getSellerEventDetail(user.id, eventId) });
    })
  );

  app.post(
    "/admin/events",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const item = await createEvent(user.id, request.body as CreateEventInput);
      response.status(201).json({ item });
    })
  );

  app.get(
    "/admin/events/:eventId/entries",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({ items: await listEventEntries(user.id, eventId) });
    })
  );

  app.get(
    "/admin/events/:eventId/draw-source",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const eventId = getRequiredString(request.params.eventId, "eventId");
      response.json({ item: await getEventDrawSource(user.id, eventId) });
    })
  );

  app.get(
    "/admin/products",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json({ items: await listSellerProducts(user.id) });
    })
  );

  app.get(
    "/admin/products/:productId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(request.params.productId, "productId");
      response.json({ item: await getSellerProductDetail(user.id, productId) });
    })
  );

  app.post(
    "/admin/products",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const item = await createProduct(user.id, request.body as CreateProductInput);
      response.status(201).json({ item });
    })
  );

  app.patch(
    "/admin/products/:productId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(request.params.productId, "productId");
      const item = await updateSellerProduct(user.id, productId, request.body as UpdateProductInput);
      response.json({ item });
    })
  );

  app.delete(
    "/admin/products/:productId",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(request.params.productId, "productId");
      await deleteProduct(user.id, productId);
      response.json({ ok: true });
    })
  );

  app.get(
    "/admin/products/:productId/game-attempts",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(request.params.productId, "productId");
      response.json({ items: await listProductGameAttempts(user.id, productId) });
    })
  );

  app.get(
    "/admin/products/:productId/price-offers",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(request.params.productId, "productId");
      response.json({ items: await listProductPriceOffers(user.id, productId) });
    })
  );

  app.post(
    "/admin/products/:productId/price-offers/:offerId/accept",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      const productId = getRequiredString(request.params.productId, "productId");
      const offerId = getRequiredString(request.params.offerId, "offerId");
      const result = await acceptPriceOffer(user.id, productId, offerId);
      response.json({
        ...result,
        message: "가격 제안을 수락했고 상품을 품절 처리했습니다. 판매자가 계좌이체 안내를 위해 직접 연락할 예정입니다."
      });
    })
  );

  app.get(
    "/admin/orders",
    asyncHandler(async (request, response) => {
      const user = requireSellerAccess(request);
      response.json({ items: await listSellerOrders(user.id) });
    })
  );

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: "입력값이 올바르지 않습니다.",
        issues: error.flatten()
      });
      return;
    }

    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        message: error.message,
        ...(error.code ? { code: error.code } : {})
      });
      return;
    }

    console.error(error);
    response.status(500).json({ message: "서버 오류가 발생했습니다." });
  });

  return app;
}

const app = createApp();

export default app;
