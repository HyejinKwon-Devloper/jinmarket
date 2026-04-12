"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { GameChoice, GamePlayResult, ProductDetail, SessionUser } from "@jinmarket/shared";

import { GamePurchaseModal } from "../../../components/GamePurchaseModal";
import { ProductImageCarousel } from "../../../components/ProductImageCarousel";
import { fetchCurrentUser, formatPrice, purchaseTypeLabel, requestJson, statusLabel } from "../../../lib/api";

const gameChoiceLabels: Record<GameChoice, string> = {
  ROCK: "바위",
  PAPER: "보",
  SCISSORS: "가위"
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

function formatSaleWindow(item: ProductDetail) {
  const start = formatDateTime(item.saleStartsAt);
  if (!item.saleEndsAt) {
    return `${start}부터 무기한 판매`;
  }

  return `${start} ~ ${formatDateTime(item.saleEndsAt)}`;
}

function formatGameResult(result: GamePlayResult["attempt"]["result"]) {
  switch (result) {
    case "WIN":
      return "승리";
    case "LOSE":
      return "패배";
    default:
      return "무승부";
  }
}

function formatGameProgress(progress: NonNullable<ProductDetail["myGameProgress"]>) {
  const parts = [`${progress.wins}승`, `${progress.losses}패`];

  if (progress.draws > 0) {
    parts.push(`무승부 ${progress.draws}회`);
  }

  return parts.join(" · ");
}

function buildGameProgressMessage(item: ProductDetail) {
  if (!item.myGameProgress) {
    return null;
  }

  const summary = formatGameProgress(item.myGameProgress);

  if (item.myGameProgress.isComplete) {
    if (item.myGameProgress.wins >= item.myGameProgress.targetWins) {
      return `가위바위보 전적: ${summary}. ${item.isFreeShare ? "나눔 신청" : "구매"}이 확정되었습니다.`;
    }

    return `가위바위보 전적: ${summary}. ${item.myGameProgress.targetWins}패로 도전이 종료되었습니다.`;
  }

  if (!item.myGameAttempt) {
    return `가위바위보 전적: ${summary}.`;
  }

  return `가위바위보 전적: ${summary}. 최근 결과는 ${formatGameResult(item.myGameAttempt.result)}입니다.`;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [item, setItem] = useState<ProductDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGameModal, setShowGameModal] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offeredPriceKrw, setOfferedPriceKrw] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [loginHref, setLoginHref] = useState("/login");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);

  async function refreshProductDetail() {
    const refreshed = await requestJson<{ item: ProductDetail }>(`/products/${productId}`);
    setItem(refreshed.item);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLoginHref(`/login?return_to=${encodeURIComponent(window.location.href)}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [currentUser, detailResponse] = await Promise.all([
          fetchCurrentUser(),
          requestJson<{ item: ProductDetail }>(`/products/${productId}`)
        ]);

        if (!cancelled) {
          setUser(currentUser);
          setItem(detailResponse.item);
          setOfferedPriceKrw(String(detailResponse.item.priceKrw));
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "상품 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (productId) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return <section className="panel">불러오는 중입니다...</section>;
  }

  if (!item) {
    return <section className="panel">{message ?? "상품을 찾을 수 없습니다."}</section>;
  }

  const isOpen = item.status === "OPEN";
  const now = Date.now();
  const saleStartsAt = new Date(item.saleStartsAt).getTime();
  const saleEndsAt = item.saleEndsAt ? new Date(item.saleEndsAt).getTime() : null;
  const isSaleNotStarted = saleStartsAt > now;
  const isSaleEndedByPeriod = saleEndsAt !== null && saleEndsAt < now;
  const isWithinSalePeriod = !isSaleNotStarted && !isSaleEndedByPeriod;
  const isPurchaseCompleted = Boolean(item.soldOrder);
  const isActionLocked = !isOpen || !isWithinSalePeriod || isPurchaseCompleted;
  const isSeller = user?.id === item.sellerId;
  const gameProgress = item.myGameProgress ?? null;
  const gameProgressMessage = buildGameProgressMessage(item);
  const canInstantBuy = Boolean(user) && !isActionLocked && item.purchaseType === "INSTANT_BUY" && !isSeller;
  const canPlayGame =
    Boolean(user) &&
    !isActionLocked &&
    item.purchaseType === "GAME_CHANCE" &&
    !isSeller &&
    !(gameProgress?.isComplete ?? false);
  const canOfferPrice = Boolean(user) && !isActionLocked && item.allowPriceOffer && !isSeller;
  const saleLabel = item.isFreeShare ? "무료 나눔" : "구매";
  const contactMessage = item.isFreeShare
    ? "무료 나눔 신청이 완료되면 판매자가 전달 방법을 위해 직접 연락합니다."
    : "구매가 성사되면 판매자가 계좌이체 안내를 위해 직접 연락합니다.";
  const lockedPurchaseLabel = isPurchaseCompleted
    ? item.isFreeShare
      ? "나눔 완료"
      : "구매 완료"
    : isSaleNotStarted
      ? "판매 시작 전"
      : isSaleEndedByPeriod
        ? "판매 기간 종료"
        : "판매 종료";
  const lockedGameLabel = isPurchaseCompleted
    ? item.isFreeShare
      ? "도전 종료"
      : "구매 종료"
    : isSaleNotStarted
      ? "판매 시작 전"
      : isSaleEndedByPeriod
        ? "판매 기간 종료"
        : "판매 종료";

  return (
    <section className="detailGrid">
      <div className="gallery">
        <ProductImageCarousel title={item.title} images={item.images} fallbackUrl={item.primaryImageUrl} />
      </div>

      <div className="panel detailInfoPanel">
        <div className="badgeRow">
          <span className={`badge ${isOpen ? "success" : ""}`}>{statusLabel(item.status)}</span>
          <span className="badge">{purchaseTypeLabel(item.purchaseType)}</span>
          {item.isFreeShare ? <span className="badge">무료 나눔</span> : null}
          {item.isAnonymous ? <span className="badge">익명 등록</span> : null}
          {item.allowPriceOffer ? <span className="badge">가격 제안 가능</span> : null}
        </div>

        <div className="detailTextStack">
          <h1>{item.title}</h1>
          {item.sellerDisplayName ? (
            <p className="muted">출품자 {item.sellerDisplayName}</p>
          ) : (
            <p className="muted">익명 등록 상품입니다.</p>
          )}
          <p className="priceText">{formatPrice(item.priceKrw)}</p>
          <p>{item.description || "상품 설명이 아직 등록되지 않았습니다."}</p>
        </div>

        <div className="detailMetaCards">
          <div className="detailMetaCard">
            <span className="detailMetaLabel">판매 기간</span>
            <span>{formatSaleWindow(item)}</span>
          </div>
          <div className="detailMetaCard">
            <span className="detailMetaLabel">거래 안내</span>
            <span>{contactMessage}</span>
          </div>
        </div>

        {!user ? <div className="message">로그인하면 바로 신청하거나 가위바위보 도전을 진행할 수 있습니다.</div> : null}

        {isSeller ? <div className="message">내가 등록한 상품입니다. 신청이나 가격 제안은 다른 계정으로만 가능합니다.</div> : null}
        {isOpen && isSaleNotStarted ? (
          <div className="message">아직 판매 시작 전인 상품입니다. 판매 시작 일시 이후에 다시 확인해 주세요.</div>
        ) : null}
        {isOpen && isSaleEndedByPeriod ? (
          <div className="message">판매 기간이 종료된 상품입니다. 더 이상 구매나 가격 제안을 진행할 수 없습니다.</div>
        ) : null}

        {item.purchaseType === "INSTANT_BUY" && !isSeller ? (
          <div className="actionRow" style={{ marginTop: 16 }}>
            {isActionLocked ? (
              <button className="primaryButton" disabled type="button">
                {lockedPurchaseLabel}
              </button>
            ) : !user ? (
              <Link className="primaryButton" href={loginHref}>
                로그인 후 바로 {item.isFreeShare ? "신청" : "구매"}
              </Link>
            ) : canInstantBuy ? (
              <button
                className="primaryButton"
                disabled={isPurchasing}
                onClick={async () => {
                  if (isPurchasing) {
                    return;
                  }

                  setIsPurchasing(true);
                  try {
                    const result = await requestJson<{ message: string }>(`/products/${productId}/purchase`, {
                      method: "POST"
                    });
                    setMessage(result.message);
                    await refreshProductDetail();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : `${saleLabel}에 실패했습니다.`);
                  } finally {
                    setIsPurchasing(false);
                  }
                }}
              >
                {isPurchasing ? `${item.isFreeShare ? "신청" : "구매"} 처리 중...` : `바로 ${item.isFreeShare ? "신청" : "구매"}`}
              </button>
            ) : null}
          </div>
        ) : null}

        {item.purchaseType === "GAME_CHANCE" && !isSeller ? (
          <div style={{ marginTop: 16 }}>
            {gameProgressMessage ? <div className="message">{gameProgressMessage}</div> : null}
            {isActionLocked ? (
              <div className="actionRow">
                <button className="secondaryButton" disabled type="button">
                  {lockedGameLabel}
                </button>
              </div>
            ) : !user ? (
              <div className="actionRow">
                <Link className="secondaryButton" href={loginHref}>
                  로그인 후 가위바위보 도전
                </Link>
              </div>
            ) : canPlayGame ? (
              <>
                <button className="secondaryButton" disabled={showGameModal} onClick={() => setShowGameModal(true)}>
                  {gameProgress?.totalRounds
                    ? item.isFreeShare
                      ? `가위바위보 이어서 도전하기 (${gameProgress.wins}승 ${gameProgress.losses}패)`
                      : `가위바위보 이어서 구매 도전 (${gameProgress.wins}승 ${gameProgress.losses}패)`
                    : item.isFreeShare
                      ? "가위바위보로 무료 나눔 도전"
                      : "가위바위보로 구매 도전"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {item.allowPriceOffer && !isSeller ? (
          <div style={{ marginTop: 16 }}>
            {isActionLocked ? (
              <div className="actionRow">
                <button className="ghostButton" disabled type="button">
                  가격 제안 마감
                </button>
              </div>
            ) : !user ? (
              <div className="actionRow">
                <Link className="ghostButton" href={loginHref}>
                  로그인 후 가격 제안하기
                </Link>
              </div>
            ) : canOfferPrice ? (
              <>
                <button className="ghostButton" disabled={isSubmittingOffer} onClick={() => setShowOfferForm((value) => !value)}>
                  {isSubmittingOffer ? "제안 전송 중..." : "가격 제안하기"}
                </button>
                {showOfferForm ? (
                  <div className="panel detailInlinePanel">
                    <div className="field">
                      <label>제안 가격</label>
                        <input
                          className="input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={isSubmittingOffer}
                          value={offeredPriceKrw}
                          onChange={(event) => setOfferedPriceKrw(event.target.value.replace(/\D/g, ""))}
                        />
                    </div>
                    <div className="field">
                      <label>메모</label>
                        <textarea
                          className="textarea"
                          disabled={isSubmittingOffer}
                          value={offerNote}
                          onChange={(event) => setOfferNote(event.target.value)}
                          placeholder="원하는 가격이나 간단한 메모를 남겨 주세요."
                      />
                    </div>
                    <div className="actionRow" style={{ marginTop: 14 }}>
                      <button
                        className="primaryButton"
                        disabled={isSubmittingOffer}
                        onClick={async () => {
                          if (isSubmittingOffer) {
                            return;
                          }

                          setIsSubmittingOffer(true);
                          try {
                            const result = await requestJson<{ message: string }>(`/products/${productId}/price-offers`, {
                              method: "POST",
                              body: JSON.stringify({
                                offeredPriceKrw: Number(offeredPriceKrw),
                                note: offerNote
                              })
                            });
                            setMessage(result.message);
                            await refreshProductDetail();
                            setShowOfferForm(false);
                          } catch (error) {
                            setMessage(error instanceof Error ? error.message : "가격 제안 등록에 실패했습니다.");
                          } finally {
                            setIsSubmittingOffer(false);
                          }
                        }}
                      >
                        {isSubmittingOffer ? "제안 보내는 중..." : "제안 보내기"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {item.myGameAttempt && !gameProgressMessage ? (
          <div className="message">
            최근 가위바위보 결과: {gameChoiceLabels[item.myGameAttempt.playerChoice]} / 상대{" "}
            {gameChoiceLabels[item.myGameAttempt.systemChoice]} / {formatGameResult(item.myGameAttempt.result)}
          </div>
        ) : null}

        {item.soldOrder ? (
          <div className="message">
            {item.isFreeShare
              ? "이미 나눔 완료된 상품이라 더 이상 신청하거나 도전할 수 없습니다."
              : "이미 구매가 완료된 상품이라 더 이상 구매, 도전, 가격 제안을 할 수 없습니다."}
          </div>
        ) : null}

        {message ? <div className="message">{message}</div> : null}
      </div>

      <GamePurchaseModal
        isOpen={showGameModal}
        seed={productId}
        productTitle={item.title}
        isFreeShare={item.isFreeShare}
        currentProgress={gameProgress}
        onClose={() => setShowGameModal(false)}
        onPlay={async (choice: GameChoice) => {
          const result = await requestJson<GamePlayResult>(`/products/${productId}/game-purchase/play`, {
            method: "POST",
            body: JSON.stringify({ playerChoice: choice })
          });

          setMessage(result.message);
          await refreshProductDetail();
          return result;
        }}
      />
    </section>
  );
}
