process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const apiBaseUrl = "https://localhost:4000";
const runId = `cycle-${Date.now()}`;

class ApiSession {
  constructor(name) {
    this.name = name;
    this.cookieJar = new Map();
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

  async request(path, init = {}) {
    const headers = new Headers(init.headers ?? {});
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    this.applyCookies(headers);

    const response = await fetch(`${apiBaseUrl}${path}`, {
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

  async login(displayName, threadsUsername, email) {
    await this.request("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ displayName, threadsUsername, email })
    });

    return { displayName, threadsUsername, email };
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

function buildImages(label, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    imageUrl: `https://example.com/${runId}/${label}-${index + 1}.jpg`,
    providerPublicId: `${runId}/${label}-${index + 1}`,
    width: 600,
    height: 600,
    bytes: 2048,
    sortOrder: index + 1,
    isPrimary: index === 0
  }));
}

async function getPublicProduct(productId) {
  const anonymous = new ApiSession("anonymous");
  return anonymous.request(`/products/${productId}`);
}

async function main() {
  const seller = new ApiSession("seller");
  const buyerInstant = new ApiSession("buyerInstant");
  const buyerOffer = new ApiSession("buyerOffer");
  const gameBuyerEntries = Array.from({ length: 12 }, (_, index) => ({
    session: new ApiSession(`gameBuyer${index + 1}`),
    identity: {
      displayName: `가위바위보 표시명 ${index + 1} ${runId}`,
      threadsUsername: `buyer_game_${index + 1}_${runId}`,
      email: `${runId}-buyer-game-${index + 1}@example.com`
    }
  }));

  const sellerIdentity = await seller.login(`판매자 표시명 ${runId}`, `seller_${runId}`, `${runId}-seller@example.com`);
  const buyerInstantIdentity = await buyerInstant.login(
    `즉시구매 표시명 ${runId}`,
    `buyer_instant_${runId}`,
    `${runId}-buyer-instant@example.com`
  );
  const buyerOfferIdentity = await buyerOffer.login(
    `제안구매 표시명 ${runId}`,
    `buyer_offer_${runId}`,
    `${runId}-buyer-offer@example.com`
  );

  for (const entry of gameBuyerEntries) {
    await entry.session.login(entry.identity.displayName, entry.identity.threadsUsername, entry.identity.email);
  }

  logStep("테스트 계정 준비 완료");

  const optionProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[TEST] 옵션 검증 ${runId}`,
      description: "옵션이 구매자 목록과 상세에 반영되는지 확인합니다.",
      priceKrw: 33000,
      isFreeShare: false,
      allowPriceOffer: true,
      purchaseType: "INSTANT_BUY",
      images: buildImages("option", 3)
    })
  });

  const optionProductId = optionProduct.item.id;
  logStep("옵션 검증용 상품 등록", optionProductId);

  const publicListBeforeUpdate = await buyerInstant.request("/products");
  const publicOptionBeforeUpdate = publicListBeforeUpdate.items.find((item) => item.id === optionProductId);
  expect(Boolean(publicOptionBeforeUpdate), "구매자 목록에서 옵션 검증용 상품을 찾지 못했습니다.");
  expect(publicOptionBeforeUpdate.allowPriceOffer === true, "구매자 목록에 가격 제안 가능 옵션이 반영되지 않았습니다.");
  expect(publicOptionBeforeUpdate.purchaseType === "INSTANT_BUY", "구매자 목록에 즉시 구매 옵션이 반영되지 않았습니다.");

  await seller.request(`/admin/products/${optionProductId}`, {
    method: "PATCH",
    body: JSON.stringify({
      purchaseType: "GAME_CHANCE",
      allowPriceOffer: true,
      status: "OPEN"
    })
  });

  const publicOptionAfterUpdate = await getPublicProduct(optionProductId);
  expect(publicOptionAfterUpdate.item.purchaseType === "GAME_CHANCE", "구매자 상세에 가위바위보 옵션 변경이 반영되지 않았습니다.");
  expect(publicOptionAfterUpdate.item.allowPriceOffer === true, "구매자 상세에 가격 제안 옵션이 유지되지 않았습니다.");
  expect(publicOptionAfterUpdate.item.images.length === 3, "구매자 상세 이미지 개수가 기대와 다릅니다.");
  logStep("옵션 변경 후 구매자 상세 반영 확인");

  const deleteProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[TEST] 삭제 검증 ${runId}`,
      description: "삭제 기능을 확인합니다.",
      priceKrw: 7000,
      isFreeShare: false,
      allowPriceOffer: false,
      purchaseType: "INSTANT_BUY",
      images: buildImages("delete", 1)
    })
  });

  const deleteProductId = deleteProduct.item.id;
  await seller.request(`/admin/products/${deleteProductId}`, { method: "DELETE" });
  let deletedConfirmed = false;
  try {
    await seller.request(`/admin/products/${deleteProductId}`);
  } catch (error) {
    deletedConfirmed = String(error.message).includes("404");
  }
  expect(deletedConfirmed, "상품 삭제 후에도 판매자 상세 조회가 가능합니다.");
  logStep("상품 삭제 확인");

  const instantProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[TEST] 즉시 구매 ${runId}`,
      description: "즉시 구매 플로우 검증",
      priceKrw: 41000,
      isFreeShare: false,
      allowPriceOffer: false,
      purchaseType: "INSTANT_BUY",
      images: buildImages("instant", 1)
    })
  });

  const instantProductId = instantProduct.item.id;
  const instantPurchase = await buyerInstant.request(`/products/${instantProductId}/purchase`, { method: "POST" });
  expect(instantPurchase.order.source === "INSTANT_BUY", "즉시 구매 주문 소스가 올바르지 않습니다.");

  const instantSellerDetail = await seller.request(`/admin/products/${instantProductId}`);
  expect(instantSellerDetail.item.status === "SOLD_OUT", "즉시 구매 후 상품이 품절로 바뀌지 않았습니다.");
  expect(Boolean(instantSellerDetail.item.soldOrder), "즉시 구매 후 판매자 상세에 주문 정보가 없습니다.");
  logStep("즉시 구매 후 품절 처리 확인");

  const offerProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[TEST] 가격 제안 ${runId}`,
      description: "가격 제안 수락 플로우 검증",
      priceKrw: 52000,
      isFreeShare: false,
      allowPriceOffer: true,
      purchaseType: "INSTANT_BUY",
      images: buildImages("offer", 2)
    })
  });

  const offerProductId = offerProduct.item.id;
  await buyerOffer.request(`/products/${offerProductId}/price-offers`, {
    method: "POST",
    body: JSON.stringify({
      offeredPriceKrw: 47000,
      note: `테스트 제안 ${runId}`
    })
  });

  const sellerOffers = await seller.request(`/admin/products/${offerProductId}/price-offers`);
  expect(sellerOffers.items.length > 0, "판매자 페이지에서 가격 제안 목록을 확인할 수 없습니다.");

  const acceptedOffer = await seller.request(
    `/admin/products/${offerProductId}/price-offers/${sellerOffers.items[0].id}/accept`,
    { method: "POST" }
  );
  expect(acceptedOffer.item.status === "SOLD_OUT", "가격 제안 수락 후 상품이 품절로 바뀌지 않았습니다.");
  expect(acceptedOffer.order.source === "PRICE_OFFER_ACCEPTED", "가격 제안 수락 주문 소스가 올바르지 않습니다.");
  logStep("가격 제안 수락 후 판매 처리 확인");

  const gameProduct = await seller.request("/admin/products", {
    method: "POST",
    body: JSON.stringify({
      title: `[TEST] 가위바위보 ${runId}`,
      description: "가위바위보 구매 플로우 검증",
      priceKrw: 61000,
      isFreeShare: false,
      allowPriceOffer: false,
      purchaseType: "GAME_CHANCE",
      images: buildImages("game", 2)
    })
  });

  const gameProductId = gameProduct.item.id;
  let winningBuyer = null;
  let sawFailedAttempt = false;

  for (const entry of gameBuyerEntries) {
    const playResult = await entry.session.request(`/products/${gameProductId}/game-purchase/play`, {
      method: "POST",
      body: JSON.stringify({ playerChoice: "ROCK" })
    });

    if (playResult.purchased) {
      winningBuyer = { ...entry, playResult };
      break;
    }

    sawFailedAttempt = true;
    const currentSellerDetail = await seller.request(`/admin/products/${gameProductId}`);
    expect(currentSellerDetail.item.status === "OPEN", "가위바위보 실패 후 상품이 열림 상태를 유지하지 못했습니다.");
    expect(!currentSellerDetail.item.soldOrder, "가위바위보 실패 후에도 주문이 생성되었습니다.");
  }

  expect(Boolean(winningBuyer), "여러 구매자를 시도했지만 가위바위보 승리 구매자를 만들지 못했습니다.");
  expect(sawFailedAttempt, "가위바위보 실패 케이스를 재현하지 못했습니다.");

  const winningSellerDetail = await seller.request(`/admin/products/${gameProductId}`);
  expect(winningSellerDetail.item.status === "SOLD_OUT", "가위바위보 승리 후 상품이 품절로 바뀌지 않았습니다.");
  expect(winningSellerDetail.item.soldOrder?.source === "GAME_CHANCE_WIN", "가위바위보 승리 주문 소스가 올바르지 않습니다.");
  logStep("가위바위보 승리 시에만 구매 성공 확인");

  const sellerOrders = await seller.request("/admin/orders");
  expect(sellerOrders.items.length >= 3, "판매자 주문 목록에 완료 주문이 누적되지 않았습니다.");

  const instantOrder = sellerOrders.items.find((item) => item.productId === instantProductId);
  const offerOrder = sellerOrders.items.find((item) => item.productId === offerProductId);
  const gameOrder = sellerOrders.items.find((item) => item.productId === gameProductId);

  expect(Boolean(instantOrder && offerOrder && gameOrder), "판매자 주문 목록에 모든 테스트 주문이 보이지 않습니다.");

  logStep("가위바위보 당첨 구매자", {
    displayName: winningBuyer.identity.displayName,
    threadsUsername: winningBuyer.identity.threadsUsername
  });

  const buyerIdentityMap = new Map([
    [instantProductId, buyerInstantIdentity],
    [offerProductId, buyerOfferIdentity],
    [gameProductId, winningBuyer.identity]
  ]);

  for (const [productId, identity] of buyerIdentityMap.entries()) {
    const detail = await seller.request(`/admin/products/${productId}`);
    expect(Boolean(detail.item.soldOrder), `판매자 상세에 주문 정보가 없습니다: ${productId}`);
    if (detail.item.soldOrder.buyerThreadsUsername !== identity.threadsUsername) {
      throw new Error(
        `판매자 화면에 구매자 username이 보이지 않습니다. product=${productId}, expected=${identity.threadsUsername}, actual=${detail.item.soldOrder.buyerThreadsUsername}`
      );
    }
  }

  console.log(`SUCCESS ${runId}`);
}

main().catch((error) => {
  console.error(`FAIL ${runId}`);
  console.error(error);
  process.exit(1);
});
