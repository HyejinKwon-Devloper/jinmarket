import { query, runWithSystemDbContext, withTransaction } from "@jinmarket/db";
import type {
  GameAttemptRecord,
  GamePlayResult,
  OrderRecord
} from "@jinmarket/shared";

import { AppError, isPgUniqueError } from "../errors.js";
import { decryptOptionalEmail } from "../utils/pii.js";
import {
  decideRpsResult,
  randomChoice,
  summarizeGamePurchaseSeries
} from "../utils/rps.js";

import { safeUserLoginIdSql } from "./account-sql.js";
import { sendSellerOrderNotification } from "./mail-service.js";
import { sendPushNotificationToUser } from "./push-service.js";
import { loadUserIdentityMap } from "./user-identity-service.js";

type LockedProductRow = {
  id: string;
  title: string;
  price_krw: number;
  seller_id: string;
  status: "DRAFT" | "OPEN" | "SOLD_OUT" | "CANCELLED";
  purchase_type: "INSTANT_BUY" | "GAME_CHANCE";
  is_free_share: boolean;
  sale_started_at: Date;
  sale_ends_at: Date | null;
};

type OrderRow = {
  id: string;
  product_id: string;
  product_title: string;
  product_price_krw: number;
  seller_id: string;
  seller_display_name: string;
  seller_threads_username: string | null;
  buyer_id: string;
  buyer_display_name: string;
  buyer_threads_username: string | null;
  source: "INSTANT_BUY" | "GAME_CHANCE_WIN";
  status: "PENDING_CONTACT" | "CONTACTED" | "TRANSFER_PENDING" | "COMPLETED" | "CANCELLED";
  ordered_at: Date;
};

type OrderQueryRow = Omit<OrderRow, "seller_display_name" | "buyer_display_name">;

type AttemptRow = {
  id: string;
  product_id: string;
  user_id: string;
  player_choice: "ROCK" | "PAPER" | "SCISSORS";
  system_choice: "ROCK" | "PAPER" | "SCISSORS";
  result: "WIN" | "LOSE" | "DRAW";
  played_at: Date;
};

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    productPriceKrw: row.product_price_krw,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name,
    sellerThreadsUsername: row.seller_threads_username,
    buyerId: row.buyer_id,
    buyerDisplayName: row.buyer_display_name,
    buyerThreadsUsername: row.buyer_threads_username,
    source: row.source,
    status: row.status,
    orderedAt: row.ordered_at.toISOString()
  };
}

function mapAttempt(row: AttemptRow): GameAttemptRecord {
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    playerChoice: row.player_choice,
    systemChoice: row.system_choice,
    result: row.result,
    playedAt: row.played_at.toISOString()
  };
}

function formatProgressLabel(wins: number, losses: number, draws: number) {
  const parts = [`${wins}승`, `${losses}패`];

  if (draws > 0) {
    parts.push(`무승부 ${draws}회`);
  }

  return parts.join(" ");
}

function buildGamePurchaseMessage(args: {
  wins: number;
  losses: number;
  draws: number;
  targetWins: number;
  latestResult: GameAttemptRecord["result"];
  isFreeShare: boolean;
}) {
  const progressLabel = formatProgressLabel(args.wins, args.losses, args.draws);
  const completionLabel = args.isFreeShare ? "나눔 신청" : "구매";

  if (args.wins >= args.targetWins) {
    return args.isFreeShare
      ? `${args.targetWins}승을 먼저 채워 무료 나눔 신청이 완료되었습니다. 판매자가 전달 방법을 위해 직접 연락할 예정입니다.`
      : `${args.targetWins}승을 먼저 채워 구매가 완료되었습니다. 판매자가 계좌이체 안내를 위해 직접 연락할 예정입니다.`;
  }

  if (args.losses >= args.targetWins) {
    return `졌습니다. 현재 ${progressLabel}입니다. ${args.targetWins}패가 되어 이번 도전은 종료되었습니다.`;
  }

  if (args.latestResult === "DRAW") {
    return `비겼습니다. 현재 ${progressLabel}입니다. 비긴 판은 제외되니 다시 진행해 주세요.`;
  }

  if (args.latestResult === "WIN") {
    return `이겼습니다. 현재 ${progressLabel}입니다. ${args.targetWins}승을 먼저 채우면 ${completionLabel}이 확정됩니다.`;
  }

  return `졌습니다. 현재 ${progressLabel}입니다. ${args.targetWins}패가 되기 전까지 다시 도전할 수 있습니다.`;
}

function assertProductOnSale(product: LockedProductRow) {
  const now = Date.now();
  const saleStartsAt = product.sale_started_at.getTime();
  const saleEndsAt = product.sale_ends_at?.getTime() ?? null;

  if (saleStartsAt > now) {
    throw new AppError("아직 판매 시작 전인 상품입니다.", 409);
  }

  if (saleEndsAt !== null && saleEndsAt < now) {
    throw new AppError("판매 기간이 종료된 상품입니다.", 409);
  }
}

function orderSourceLabel(source: OrderRow["source"]) {
  return source === "GAME_CHANCE_WIN" ? "가위바위보 승리" : "즉시 구매";
}

async function loadVerifiedSellerEmail(userId: string) {
  return runWithSystemDbContext(async () => {
    const result = await query<{
      email_encrypted: string | null;
      email_iv: string | null;
      email_auth_tag: string | null;
      seller_email_verified_at: Date | null;
    }>(
      `
        SELECT
          email_encrypted,
          email_iv,
          email_auth_tag,
          seller_email_verified_at
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    const row = result.rows[0];

    if (!row?.seller_email_verified_at) {
      return null;
    }

    return decryptOptionalEmail(row);
  });
}

async function hydrateOrderRow(row: OrderQueryRow): Promise<OrderRow> {
  const identities = await runWithSystemDbContext(() =>
    loadUserIdentityMap([row.seller_id, row.buyer_id])
  );
  const seller = identities.get(row.seller_id);
  const buyer = identities.get(row.buyer_id);

  if (!seller || !buyer) {
    throw new Error("Failed to load order user identities.");
  }

  return {
    ...row,
    seller_display_name: seller.displayName,
    buyer_display_name: buyer.displayName
  };
}

async function notifySellerOrder(row: OrderRow, isFreeShare: boolean) {
  const sellerEmail = await loadVerifiedSellerEmail(row.seller_id);

  try {
    await sendSellerOrderNotification({
      sellerEmail,
      sellerDisplayName: row.seller_display_name,
      sellerLoginId: row.seller_threads_username,
      buyerDisplayName: row.buyer_display_name,
      buyerLoginId: row.buyer_threads_username,
      productTitle: row.product_title,
      productPriceKrw: row.product_price_krw,
      orderTypeLabel: orderSourceLabel(row.source),
      orderedAt: row.ordered_at.toISOString(),
      isFreeShare
    });
  } catch (error) {
    console.error("Failed to send seller order notification", error);
  }

  try {
    await runWithSystemDbContext(() => sendPushNotificationToUser({
      userId: row.seller_id,
      app: "ADMIN",
      title: isFreeShare ? "무료 나눔 요청이 도착했어요" : "새 주문이 들어왔어요",
      body: `${row.buyer_display_name}님이 ${row.product_title}에 ${orderSourceLabel(row.source)} 요청을 보냈어요.`,
      url: "/orders",
      tag: `seller-order:${row.id}`
    }));
  } catch (error) {
    console.error("Failed to send seller push notification", error);
  }
}

export async function purchaseInstantProduct(userId: string, productId: string) {
  const result = await runWithSystemDbContext(() => withTransaction(async (client) => {
    const productResult = await client.query<LockedProductRow>(
      `
        SELECT
          id,
          title,
          price_krw,
          seller_id,
          status,
          purchase_type,
          is_free_share,
          COALESCE(published_at, created_at) AS sale_started_at,
          sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [productId]
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new AppError("상품을 찾을 수 없습니다.", 404);
    }

    if (product.status !== "OPEN") {
      throw new AppError("이미 판매가 종료된 상품입니다.", 409);
    }

    assertProductOnSale(product);

    if (product.purchase_type !== "INSTANT_BUY") {
      throw new AppError("즉시 구매 상품이 아닙니다.", 400);
    }

    if (product.seller_id === userId) {
      throw new AppError("본인이 등록한 상품은 구매할 수 없습니다.", 400);
    }

    try {
      const orderResult = await client.query<OrderQueryRow>(
        `
          WITH inserted AS (
            INSERT INTO orders (product_id, seller_id, buyer_id, source)
            VALUES ($1, $2, $3, 'INSTANT_BUY')
            RETURNING id, product_id, seller_id, buyer_id, source, status, ordered_at
          )
          SELECT
            inserted.id,
            inserted.product_id,
            $4::text AS product_title,
            $5::integer AS product_price_krw,
            inserted.seller_id,
            ${safeUserLoginIdSql("inserted.seller_id")} AS seller_threads_username,
            inserted.buyer_id,
            ${safeUserLoginIdSql("inserted.buyer_id")} AS buyer_threads_username,
            inserted.source,
            inserted.status,
            inserted.ordered_at
          FROM inserted
        `,
        [product.id, product.seller_id, userId, product.title, product.price_krw]
      );

      await client.query(
        `
          UPDATE products
          SET status = 'SOLD_OUT',
              sold_out_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [product.id]
      );

      return {
        orderRow: orderResult.rows[0],
        isFreeShare: product.is_free_share
      };
    } catch (error) {
      if (isPgUniqueError(error)) {
        throw new AppError("이미 다른 사용자가 구매를 완료했습니다.", 409);
      }

      throw error;
    }
  }));

  const hydratedOrder = await hydrateOrderRow(result.orderRow);
  await notifySellerOrder(hydratedOrder, result.isFreeShare);

  return {
    order: mapOrder(hydratedOrder),
    isFreeShare: result.isFreeShare
  };
}

export async function playGamePurchase(
  userId: string,
  productId: string,
  playerChoice: "ROCK" | "PAPER" | "SCISSORS"
): Promise<GamePlayResult> {
  const result = await runWithSystemDbContext(() => withTransaction(async (client) => {
    const productResult = await client.query<LockedProductRow>(
      `
        SELECT
          id,
          title,
          price_krw,
          seller_id,
          status,
          purchase_type,
          is_free_share,
          COALESCE(published_at, created_at) AS sale_started_at,
          sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [productId]
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new AppError("상품을 찾을 수 없습니다.", 404);
    }

    if (product.status !== "OPEN") {
      throw new AppError("이미 판매가 종료된 상품입니다.", 409);
    }

    assertProductOnSale(product);

    if (product.purchase_type !== "GAME_CHANCE") {
      throw new AppError("가위바위보 판매 상품이 아닙니다.", 400);
    }

    if (product.seller_id === userId) {
      throw new AppError("본인이 등록한 상품에는 참여할 수 없습니다.", 400);
    }

    const existingAttempts = await client.query<AttemptRow>(
      `
        SELECT id, product_id, user_id, player_choice, system_choice, result, played_at
        FROM game_purchase_attempts
        WHERE product_id = $1 AND user_id = $2
        ORDER BY played_at ASC, created_at ASC
      `,
      [productId, userId]
    );

    const attemptsBeforePlay = existingAttempts.rows.map(mapAttempt);
    const progressBeforePlay = summarizeGamePurchaseSeries(attemptsBeforePlay);

    if (!progressBeforePlay.canContinue) {
      throw new AppError("이 상품의 가위바위보 도전은 이미 종료되었습니다.", 409);
    }

    const systemChoice = randomChoice();
    const roundResult = decideRpsResult(playerChoice, systemChoice);

    const attemptResult = await client.query<AttemptRow>(
      `
        INSERT INTO game_purchase_attempts (
          product_id,
          user_id,
          game_type,
          player_choice,
          system_choice,
          result
        )
        VALUES ($1, $2, 'ROCK_PAPER_SCISSORS', $3, $4, $5)
        RETURNING id, product_id, user_id, player_choice, system_choice, result, played_at
      `,
      [productId, userId, playerChoice, systemChoice, roundResult]
    );

    const mappedAttempt = mapAttempt(attemptResult.rows[0]);
    const progress = summarizeGamePurchaseSeries([...attemptsBeforePlay, mappedAttempt]);

    if (progress.wins < progress.targetWins) {
      return {
        attempt: mappedAttempt,
        purchased: false as const,
        progress,
        message: buildGamePurchaseMessage({
          wins: progress.wins,
          losses: progress.losses,
          draws: progress.draws,
          targetWins: progress.targetWins,
          latestResult: mappedAttempt.result,
          isFreeShare: product.is_free_share
        })
      };
    }

    try {
      const orderResult = await client.query<OrderQueryRow>(
        `
          WITH inserted AS (
            INSERT INTO orders (product_id, seller_id, buyer_id, source, game_attempt_id)
            VALUES ($1, $2, $3, 'GAME_CHANCE_WIN', $4)
            RETURNING id, product_id, seller_id, buyer_id, source, status, ordered_at
          )
          SELECT
            inserted.id,
            inserted.product_id,
            $5::text AS product_title,
            $6::integer AS product_price_krw,
            inserted.seller_id,
            ${safeUserLoginIdSql("inserted.seller_id")} AS seller_threads_username,
            inserted.buyer_id,
            ${safeUserLoginIdSql("inserted.buyer_id")} AS buyer_threads_username,
            inserted.source,
            inserted.status,
            inserted.ordered_at
          FROM inserted
        `,
        [product.id, product.seller_id, userId, attemptResult.rows[0].id, product.title, product.price_krw]
      );

      await client.query(
        `
          UPDATE products
          SET status = 'SOLD_OUT',
              sold_out_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [product.id]
      );

      return {
        attempt: mappedAttempt,
        purchased: true as const,
        orderRow: orderResult.rows[0],
        isFreeShare: product.is_free_share,
        progress,
        message: buildGamePurchaseMessage({
          wins: progress.wins,
          losses: progress.losses,
          draws: progress.draws,
          targetWins: progress.targetWins,
          latestResult: mappedAttempt.result,
          isFreeShare: product.is_free_share
        })
      };
    } catch (error) {
      if (isPgUniqueError(error)) {
        throw new AppError("이미 다른 사용자가 구매를 완료했습니다.", 409);
      }

      throw error;
    }
  }));

  if (!result.purchased) {
    return result;
  }

  const hydratedOrder = await hydrateOrderRow(result.orderRow);
  await notifySellerOrder(hydratedOrder, result.isFreeShare);

  return {
    attempt: result.attempt,
    purchased: true,
    order: mapOrder(hydratedOrder),
    progress: result.progress,
    message: result.message
  };
}
