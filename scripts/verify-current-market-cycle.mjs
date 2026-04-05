const apiBaseUrl = process.env.API_BASE_URL ?? "https://localhost:4000";

if (apiBaseUrl.includes("localhost")) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const runId = `qa-${Date.now()}`;
const now = Date.now();

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const envText = fs.readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

class ApiSession {
  constructor(name) {
    this.name = name;
    this.cookieJar = new Map();
    this.identity = null;
  }

  applyCookies(headers) {
    const cookieHeader = [...this.cookieJar.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }
  }

  storeCookies(response) {
    const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(";", 1);
      const [name, value] = pair.split("=");
      if (name && value) {
        this.cookieJar.set(name.trim(), value.trim());
      }
    }
  }

  async request(pathname, init = {}) {
    const headers = new Headers(init.headers ?? {});
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    this.applyCookies(headers);

    const response = await fetch(`${apiBaseUrl}${pathname}`, {
      ...init,
      headers
    });

    this.storeCookies(response);

    const rawText = await response.text();
    let payload = null;

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload ? payload.message : response.statusText;
      throw new Error(`[${this.name}] ${response.status} ${message}`);
    }

    return payload;
  }

  async login(threadsUsername) {
    const response = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ threadsUsername })
    });

    this.identity = {
      threadsUsername,
      displayName: response.user?.displayName ?? threadsUsername,
      id: response.user?.id ?? null
    };

    return response.user;
  }
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(message, detail) {
  if (detail === undefined) {
    console.log(`- ${message}`);
    return;
  }

  console.log(`- ${message}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

function isoOffset(offsetMs) {
  return new Date(now + offsetMs).toISOString();
}

function buildImages(label, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    imageUrl: `https://example.com/${runId}/${label}-${index + 1}.jpg`,
    providerPublicId: `${runId}/${label}-${index + 1}`,
    width: 800,
    height: 800,
    bytes: 2048,
    sortOrder: index + 1,
    isPrimary: index === 0
  }));
}

async function expectNotFound(session, pathname, message) {
  let notFound = false;

  try {
    await session.request(pathname);
  } catch (error) {
    notFound = String(error.message).includes("404");
  }

  expect(notFound, message);
}

async function cleanupUsersByPrefix(prefix) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    const usersResult = await client.query(
      `
        SELECT DISTINCT u.id
        FROM users u
        JOIN auth_accounts aa ON aa.user_id = u.id
        WHERE aa.provider = 'THREADS'
          AND aa.provider_username LIKE $1
      `,
      [`${prefix}%`]
    );

    const userIds = usersResult.rows.map((row) => row.id);

    if (userIds.length === 0) {
      await client.query("ROLLBACK");
      return { deletedUsers: 0 };
    }

    await client.query(
      `
        DELETE FROM orders
        WHERE seller_id = ANY($1::uuid[])
           OR buyer_id = ANY($1::uuid[])
      `,
      [userIds]
    );

    await client.query(
      `
        DELETE FROM price_offers
        WHERE buyer_id = ANY($1::uuid[])
           OR product_id IN (SELECT id FROM products WHERE seller_id = ANY($1::uuid[]))
      `,
      [userIds]
    );

    await client.query(
      `
        DELETE FROM game_purchase_attempts
        WHERE user_id = ANY($1::uuid[])
           OR product_id IN (SELECT id FROM products WHERE seller_id = ANY($1::uuid[]))
      `,
      [userIds]
    );

    await client.query(
      `
        DELETE FROM product_images
        WHERE product_id IN (SELECT id FROM products WHERE seller_id = ANY($1::uuid[]))
      `,
      [userIds]
    );

    await client.query(
      `
        DELETE FROM seller_access_requests
        WHERE user_id = ANY($1::uuid[])
      `,
      [userIds]
    );

    await client.query("DELETE FROM seller_profiles WHERE user_id = ANY($1::uuid[])", [userIds]);
    await client.query("DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])", [userIds]);
    await client.query("DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])", [userIds]);
    await client.query("DELETE FROM auth_accounts WHERE user_id = ANY($1::uuid[])", [userIds]);
    await client.query("DELETE FROM products WHERE seller_id = ANY($1::uuid[])", [userIds]);
    await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);

    await client.query("COMMIT");
    return { deletedUsers: userIds.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const admin = new ApiSession("approvalAdmin");
  const seller = new ApiSession("seller");
  const buyerInstant = new ApiSession("buyerInstant");
  const buyerRelist = new ApiSession("buyerRelist");
  const buyerOffer = new ApiSession("buyerOffer");
  const buyerFreeShare = new ApiSession("buyerFreeShare");
  const buyerView = new ApiSession("buyerView");

  await admin.login("_nav.jin");
  await seller.login(`${runId}-seller`);
  await buyerInstant.login(`${runId}-buyer-instant`);
  await buyerRelist.login(`${runId}-buyer-relist`);
  await buyerOffer.login(`${runId}-buyer-offer`);
  await buyerFreeShare.login(`${runId}-buyer-free`);
  await buyerView.login(`${runId}-buyer-view`);

  logStep("임시 계정 로그인 완료", runId);

  const sellerProductsDenied = await seller.request("/admin/seller-access/me");
  expect(sellerProductsDenied.canSell === false, "신규 판매자 계정이 처음부터 판매 권한을 가지면 안 됩니다.");

  let sellerProductAccessBlocked = false;
  try {
    await seller.request("/admin/products");
  } catch (error) {
    sellerProductAccessBlocked = String(error.message).includes("403");
  }
  expect(sellerProductAccessBlocked, "승인 전 판매자에게 상품 관리 API가 열려 있습니다.");

  const approvalRequest = await seller.request("/admin/seller-access/me/request", {
    method: "POST"
  });
  expect(approvalRequest.item.status === "PENDING", "판매자 승인 신청이 PENDING으로 저장되지 않았습니다.");

  const pendingRequests = await admin.request("/admin/seller-access");
  const pendingRequest = pendingRequests.items.find(
    (item) => item.applicantThreadsUsername === `${runId}-seller`
  );
  expect(Boolean(pendingRequest), "승인 관리자 화면에 신규 판매자 신청이 보이지 않습니다.");

  await admin.request(`/admin/seller-access/${pendingRequest.id}/approve`, {
    method: "POST"
  });

  const sellerAccessAfterApproval = await seller.request("/admin/seller-access/me");
  expect(sellerAccessAfterApproval.canSell === true, "승인 후에도 판매자 권한이 열리지 않았습니다.");
  logStep("판매자 승인 흐름 확인");

  const optionProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 옵션 반영 ${runId}`,
      description: "익명, 가격, 판매방식, 이미지 반영 확인용",
      priceKrw: 7000,
      isFreeShare: false,
      isAnonymous: true,
      allowPriceOffer: true,
      purchaseType: "INSTANT_BUY",
      saleStartsAt: isoOffset(-10 * 60 * 1000),
      images: buildImages("option", 3)
    })
  });

  expect(optionProduct.item.priceKrw === 7000, "7000원으로 등록한 상품 가격이 그대로 저장되지 않았습니다.");

  const publicListWithOptions = await buyerView.request("/products");
  const publicOptionCard = publicListWithOptions.items.find((item) => item.id === optionProduct.item.id);
  expect(Boolean(publicOptionCard), "옵션 검증 상품이 구매자 목록에 보이지 않습니다.");
  expect(publicOptionCard.priceKrw === 7000, "구매자 목록에 상품 가격이 7000원으로 노출되지 않습니다.");
  expect(publicOptionCard.sellerDisplayName === null, "익명 등록 상품인데 구매자 목록에 판매자 이름이 보입니다.");
  expect(publicOptionCard.allowPriceOffer === true, "가격 제안 가능 옵션이 구매자 목록에 반영되지 않았습니다.");
  expect(publicOptionCard.purchaseType === "INSTANT_BUY", "초기 즉시 구매 옵션이 구매자 목록에 반영되지 않았습니다.");

  await seller.request(`/admin/products/${optionProduct.item.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      purchaseType: "GAME_CHANCE",
      allowPriceOffer: true,
      isAnonymous: true,
      priceKrw: 7000
    })
  });

  const publicOptionDetail = await buyerView.request(`/products/${optionProduct.item.id}`);
  expect(publicOptionDetail.item.purchaseType === "GAME_CHANCE", "수정 후 구매자 상세에 가위바위보 판매가 반영되지 않았습니다.");
  expect(publicOptionDetail.item.allowPriceOffer === true, "수정 후 가격 제안 가능 옵션이 유지되지 않았습니다.");
  expect(publicOptionDetail.item.sellerDisplayName === null, "익명 등록 상품인데 구매자 상세에 판매자 이름이 보입니다.");
  expect(publicOptionDetail.item.images.length === 3, "등록한 이미지 수가 구매자 상세에 그대로 노출되지 않습니다.");
  logStep("상품 옵션 등록/수정 반영 확인");

  const futureProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 미래 판매기간 ${runId}`,
      description: "미래 판매 시작 상품",
      priceKrw: 11000,
      isFreeShare: false,
      isAnonymous: false,
      allowPriceOffer: false,
      purchaseType: "INSTANT_BUY",
      saleStartsAt: isoOffset(24 * 60 * 60 * 1000),
      saleEndsAt: isoOffset(48 * 60 * 60 * 1000),
      images: buildImages("future")
    })
  });

  const publicListWithoutFuture = await buyerView.request("/products");
  expect(
    !publicListWithoutFuture.items.some((item) => item.id === futureProduct.item.id),
    "판매 시작 전 상품이 구매자 목록에 노출되고 있습니다."
  );
  logStep("판매기간 노출 조건 확인");

  const deleteProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 삭제 테스트 ${runId}`,
      description: "삭제 기능 확인",
      priceKrw: 9000,
      isFreeShare: false,
      isAnonymous: false,
      allowPriceOffer: false,
      purchaseType: "INSTANT_BUY",
      saleStartsAt: isoOffset(-5 * 60 * 1000),
      images: buildImages("delete")
    })
  });

  await seller.request(`/admin/products/${deleteProduct.item.id}`, { method: "DELETE" });
  await expectNotFound(
    seller,
    `/admin/products/${deleteProduct.item.id}`,
    "삭제한 상품이 판매자 상세에서 여전히 조회됩니다."
  );
  logStep("상품 삭제 확인");

  const instantProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 즉시 구매 ${runId}`,
      description: "즉시 구매 및 재판매 확인",
      priceKrw: 41000,
      isFreeShare: false,
      isAnonymous: false,
      allowPriceOffer: false,
      purchaseType: "INSTANT_BUY",
      saleStartsAt: isoOffset(-5 * 60 * 1000),
      images: buildImages("instant")
    })
  });

  const instantPurchase = await buyerInstant.request(`/products/${instantProduct.item.id}/purchase`, {
    method: "POST"
  });
  expect(instantPurchase.order.source === "INSTANT_BUY", "즉시 구매 주문 소스가 올바르지 않습니다.");

  const sellerInstantDetail = await seller.request(`/admin/products/${instantProduct.item.id}`);
  expect(sellerInstantDetail.item.status === "SOLD_OUT", "즉시 구매 후 상품이 품절 처리되지 않았습니다.");
  expect(
    sellerInstantDetail.item.soldOrder?.buyerThreadsUsername === `${runId}-buyer-instant`,
    "판매자 상세에서 즉시 구매자의 username을 확인할 수 없습니다."
  );

  const publicListAfterInstantPurchase = await buyerView.request("/products");
  expect(
    !publicListAfterInstantPurchase.items.some((item) => item.id === instantProduct.item.id),
    "품절된 즉시 구매 상품이 구매자 목록에 남아 있습니다."
  );

  await seller.request(`/admin/products/${instantProduct.item.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "OPEN"
    })
  });

  const relistedSellerDetail = await seller.request(`/admin/products/${instantProduct.item.id}`);
  expect(relistedSellerDetail.item.status === "OPEN", "재판매로 변경한 상품 상태가 OPEN이 아닙니다.");
  expect(!relistedSellerDetail.item.soldOrder, "재판매 전환 후 이전 구매자 정보가 판매자 상세에 남아 있습니다.");

  const relistedBuyerDetail = await buyerView.request(`/products/${instantProduct.item.id}`);
  expect(relistedBuyerDetail.item.status === "OPEN", "재판매 전환 후 구매자 상세 상태가 OPEN으로 보이지 않습니다.");
  expect(!relistedBuyerDetail.item.soldOrder, "재판매 전환 후 구매자 상세에 이전 주문 정보가 남아 있습니다.");

  const publicListAfterRelist = await buyerView.request("/products");
  expect(
    publicListAfterRelist.items.some((item) => item.id === instantProduct.item.id),
    "재판매 전환한 상품이 구매자 목록에 다시 노출되지 않습니다."
  );

  await buyerRelist.request(`/products/${instantProduct.item.id}/purchase`, {
    method: "POST"
  });

  const sellerDetailAfterRepurchase = await seller.request(`/admin/products/${instantProduct.item.id}`);
  expect(
    sellerDetailAfterRepurchase.item.soldOrder?.buyerThreadsUsername === `${runId}-buyer-relist`,
    "재판매 후 새 구매자의 username이 판매자 상세에 반영되지 않았습니다."
  );

  const sellerOrdersAfterRelist = await seller.request("/admin/orders");
  const relistOrders = sellerOrdersAfterRelist.items.filter((item) => item.productId === instantProduct.item.id);
  expect(relistOrders.length >= 2, "재판매 상품의 이전 주문 로그와 새 주문이 함께 남아 있지 않습니다.");
  expect(relistOrders.some((item) => item.status === "CANCELLED"), "재판매 시 이전 주문이 CANCELLED 로그로 남지 않았습니다.");
  expect(relistOrders.some((item) => item.status !== "CANCELLED"), "재판매 후 새 활성 주문이 생성되지 않았습니다.");
  logStep("즉시 구매 후 재판매 흐름 확인");

  const offerProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 가격 제안 ${runId}`,
      description: "가격 제안 수락 확인",
      priceKrw: 52000,
      isFreeShare: false,
      isAnonymous: false,
      allowPriceOffer: true,
      purchaseType: "INSTANT_BUY",
      saleStartsAt: isoOffset(-5 * 60 * 1000),
      images: buildImages("offer", 2)
    })
  });

  await buyerOffer.request(`/products/${offerProduct.item.id}/price-offers`, {
    method: "POST",
    body: JSON.stringify({
      offeredPriceKrw: 47000,
      note: `제안 ${runId}`
    })
  });

  const offerListForSeller = await seller.request(`/admin/products/${offerProduct.item.id}/price-offers`);
  expect(offerListForSeller.items.length > 0, "판매자 화면에서 가격 제안 목록을 확인할 수 없습니다.");

  const offerAccepted = await seller.request(
    `/admin/products/${offerProduct.item.id}/price-offers/${offerListForSeller.items[0].id}/accept`,
    { method: "POST" }
  );
  expect(offerAccepted.order.source === "PRICE_OFFER_ACCEPTED", "가격 제안 수락 주문 소스가 올바르지 않습니다.");
  expect(offerAccepted.item.status === "SOLD_OUT", "가격 제안 수락 후 상품이 품절 처리되지 않았습니다.");

  const offerSellerDetail = await seller.request(`/admin/products/${offerProduct.item.id}`);
  expect(
    offerSellerDetail.item.soldOrder?.buyerThreadsUsername === `${runId}-buyer-offer`,
    "가격 제안 수락 후 판매자 상세에서 구매자 username을 확인할 수 없습니다."
  );

  const publicListAfterOffer = await buyerView.request("/products");
  expect(
    !publicListAfterOffer.items.some((item) => item.id === offerProduct.item.id),
    "가격 제안 수락으로 판매 완료된 상품이 구매자 목록에 남아 있습니다."
  );
  logStep("가격 제안 수락 흐름 확인");

  const freeShareProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 무료 나눔 ${runId}`,
      description: "무료 나눔 흐름 확인",
      priceKrw: 9999,
      isFreeShare: true,
      isAnonymous: false,
      allowPriceOffer: true,
      purchaseType: "INSTANT_BUY",
      saleStartsAt: isoOffset(-5 * 60 * 1000),
      images: buildImages("free-share")
    })
  });

  expect(freeShareProduct.item.priceKrw === 0, "무료 나눔 상품 가격이 0원으로 정규화되지 않았습니다.");
  expect(freeShareProduct.item.allowPriceOffer === false, "무료 나눔 상품에서 가격 제안 옵션이 꺼지지 않았습니다.");

  const publicListWithFreeShare = await buyerView.request("/products");
  const freeShareCard = publicListWithFreeShare.items.find((item) => item.id === freeShareProduct.item.id);
  expect(Boolean(freeShareCard?.isFreeShare), "무료 나눔 상품이 구매자 목록에 무료 나눔으로 노출되지 않습니다.");
  expect(freeShareCard.priceKrw === 0, "무료 나눔 상품 가격이 구매자 목록에 0원으로 보이지 않습니다.");
  expect(freeShareCard.allowPriceOffer === false, "무료 나눔 상품에 가격 제안 가능이 남아 있습니다.");

  const freeSharePurchase = await buyerFreeShare.request(`/products/${freeShareProduct.item.id}/purchase`, {
    method: "POST"
  });
  expect(
    String(freeSharePurchase.message).includes("무료 나눔"),
    "무료 나눔 구매 완료 메시지가 무료 나눔 안내 문구를 포함하지 않습니다."
  );

  const freeShareSellerDetail = await seller.request(`/admin/products/${freeShareProduct.item.id}`);
  expect(
    freeShareSellerDetail.item.soldOrder?.buyerThreadsUsername === `${runId}-buyer-free`,
    "무료 나눔 완료 후 판매자 상세에서 구매자 username을 확인할 수 없습니다."
  );
  logStep("무료 나눔 흐름 확인");

  let sawFailedAttempt = false;

  for (let index = 1; index <= 12; index += 1) {
    const gameFailProduct = await seller.request("/admin/products", {
      method: "POST",
      body: JSON.stringify({
        title: `[VERIFY] 가위바위보 실패 ${runId}-${index}`,
        description: "가위바위보 실패 케이스 확인",
        priceKrw: 61000,
        isFreeShare: false,
        isAnonymous: false,
        allowPriceOffer: false,
        purchaseType: "GAME_CHANCE",
        saleStartsAt: isoOffset(-5 * 60 * 1000),
        images: buildImages(`game-fail-${index}`, 2)
      })
    });

    const gameBuyer = new ApiSession(`gameFailBuyer${index}`);
    const username = `${runId}-buyer-game-fail-${index}`;
    await gameBuyer.login(username);

    const playResult = await gameBuyer.request(`/products/${gameFailProduct.item.id}/game-purchase/play`, {
      method: "POST",
      body: JSON.stringify({ playerChoice: "ROCK" })
    });

    if (playResult.purchased) {
      continue;
    }

    sawFailedAttempt = true;
    const gameDetailAfterFail = await seller.request(`/admin/products/${gameFailProduct.item.id}`);
    expect(gameDetailAfterFail.item.status === "OPEN", "가위바위보 실패 후 상품이 판매중 상태를 유지하지 못했습니다.");
    expect(!gameDetailAfterFail.item.soldOrder, "가위바위보 실패 후에도 주문이 생성되었습니다.");
    break;
  }

  expect(sawFailedAttempt, "가위바위보 실패 케이스를 재현하지 못했습니다.");

  const gameProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[VERIFY] 가위바위보 승리 ${runId}`,
      description: "가위바위보 승리 구매 확인",
      priceKrw: 61500,
      isFreeShare: false,
      isAnonymous: false,
      allowPriceOffer: false,
      purchaseType: "GAME_CHANCE",
      saleStartsAt: isoOffset(-5 * 60 * 1000),
      images: buildImages("game-win", 2)
    })
  });

  let winningGameBuyer = null;

  for (let index = 1; index <= 40; index += 1) {
    const gameBuyer = new ApiSession(`gameBuyer${index}`);
    const username = `${runId}-buyer-game-win-${index}`;
    await gameBuyer.login(username);

    const playResult = await gameBuyer.request(`/products/${gameProduct.item.id}/game-purchase/play`, {
      method: "POST",
      body: JSON.stringify({ playerChoice: "ROCK" })
    });

    if (!playResult.purchased) {
      const currentGameDetail = await seller.request(`/admin/products/${gameProduct.item.id}`);
      expect(currentGameDetail.item.status === "OPEN", "가위바위보 실패 후 승리 검증 상품이 판매중 상태를 유지하지 못했습니다.");
      expect(!currentGameDetail.item.soldOrder, "가위바위보 실패 후 승리 검증 상품에 주문이 생성되었습니다.");
      continue;
    }

    winningGameBuyer = username;
    break;
  }

  expect(Boolean(winningGameBuyer), "가위바위보 승리 구매자를 만들지 못했습니다.");

  const gameSellerDetail = await seller.request(`/admin/products/${gameProduct.item.id}`);
  expect(gameSellerDetail.item.status === "SOLD_OUT", "가위바위보 승리 후 상품이 품절 처리되지 않았습니다.");
  expect(
    gameSellerDetail.item.soldOrder?.source === "GAME_CHANCE_WIN",
    "가위바위보 승리 주문 소스가 GAME_CHANCE_WIN이 아닙니다."
  );
  expect(
    gameSellerDetail.item.soldOrder?.buyerThreadsUsername === winningGameBuyer,
    "가위바위보 승리 구매자의 username이 판매자 상세에 반영되지 않았습니다."
  );

  const publicListAfterGame = await buyerView.request("/products");
  expect(
    !publicListAfterGame.items.some((item) => item.id === gameProduct.item.id),
    "가위바위보 승리로 판매 완료된 상품이 구매자 목록에 남아 있습니다."
  );
  logStep("가위바위보 구매 흐름 확인", { winningGameBuyer });

  console.log(`SUCCESS ${runId}`);
}

async function run() {
  try {
    await main();
  } finally {
    const cleanup = await cleanupUsersByPrefix(runId);
    logStep("테스트 계정 정리", cleanup);
  }
}

run().catch((error) => {
  console.error(`FAIL ${runId}`);
  console.error(error);
  process.exit(1);
});
