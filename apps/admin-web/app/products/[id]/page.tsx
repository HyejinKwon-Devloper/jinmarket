"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  GameAttemptRecord,
  PriceOfferRecord,
  ProductDetail,
  PurchaseType,
} from "@jinmarket/shared";

import { AnonymousRegistrationField } from "../../../components/AnonymousRegistrationField";
import {
  fetchCurrentUser,
  formatPrice,
  purchaseTypeLabel,
  requestJson,
  statusLabel,
} from "../../../lib/api";

function accountLabel(
  displayName?: string | null,
  threadsUsername?: string | null,
) {
  if (threadsUsername && displayName && threadsUsername !== displayName) {
    return `${threadsUsername} (${displayName})`;
  }

  return threadsUsername ?? displayName ?? "-";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

function formatSaleWindow(item: ProductDetail) {
  const start = formatDateTime(item.saleStartsAt);
  if (!item.saleEndsAt) {
    return `${start}부터 무기한`;
  }

  return `${start} ~ ${formatDateTime(item.saleEndsAt)}`;
}

function saleExposureLabel(item: ProductDetail) {
  if (item.status !== "OPEN") {
    return statusLabel(item.status);
  }

  if (item.isSaleActive) {
    return "구매 사이트 노출 중";
  }

  const now = Date.now();
  const saleStartsAt = new Date(item.saleStartsAt).getTime();
  const saleEndsAt = item.saleEndsAt ? new Date(item.saleEndsAt).getTime() : null;

  if (saleStartsAt > now) {
    return "판매 시작 대기";
  }

  if (saleEndsAt !== null && saleEndsAt < now) {
    return "판매 기간 종료";
  }

  return "노출 중지";
}

export default function AdminProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [item, setItem] = useState<ProductDetail | null>(null);
  const [attempts, setAttempts] = useState<GameAttemptRecord[]>([]);
  const [priceOffers, setPriceOffers] = useState<PriceOfferRecord[]>([]);
  const [status, setStatus] = useState("OPEN");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowPriceOffer, setAllowPriceOffer] = useState(false);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("INSTANT_BUY");
  const [message, setMessage] = useState<string | null>(null);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  async function loadData() {
    const [detailResponse, attemptResponse, priceOfferResponse] =
      await Promise.all([
        requestJson<{ item: ProductDetail }>(`/admin/products/${productId}`),
        requestJson<{ items: GameAttemptRecord[] }>(
          `/admin/products/${productId}/game-attempts`,
        ),
        requestJson<{ items: PriceOfferRecord[] }>(
          `/admin/products/${productId}/price-offers`,
        ),
      ]);

    setItem(detailResponse.item);
    setAttempts(attemptResponse.items);
    setPriceOffers(priceOfferResponse.items);
    setStatus(detailResponse.item.status);
    setIsAnonymous(detailResponse.item.isAnonymous);
    setAllowPriceOffer(detailResponse.item.allowPriceOffer);
    setPurchaseType(detailResponse.item.purchaseType);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const user = await fetchCurrentUser();

      if (!user) {
        if (!cancelled) {
          setMessage("로그인이 필요합니다.");
        }
        return;
      }

      try {
        const [detailResponse, attemptResponse, priceOfferResponse] =
          await Promise.all([
            requestJson<{ item: ProductDetail }>(
              `/admin/products/${productId}`,
            ),
            requestJson<{ items: GameAttemptRecord[] }>(
              `/admin/products/${productId}/game-attempts`,
            ),
            requestJson<{ items: PriceOfferRecord[] }>(
              `/admin/products/${productId}/price-offers`,
            ),
          ]);

        if (!cancelled) {
          setItem(detailResponse.item);
          setAttempts(attemptResponse.items);
          setPriceOffers(priceOfferResponse.items);
          setStatus(detailResponse.item.status);
          setIsAnonymous(detailResponse.item.isAnonymous);
          setAllowPriceOffer(detailResponse.item.allowPriceOffer);
          setPurchaseType(detailResponse.item.purchaseType);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "상세 정보를 불러오지 못했습니다.",
          );
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

  if (!item) {
    return (
      <section className="panel">{message ?? "불러오는 중입니다..."}</section>
    );
  }

  const primaryImageUrl =
    item.images[0]?.imageUrl ?? "https://placehold.co/800x800?text=No+Image";

  return (
    <>
      <section className="detailGrid">
        <div className="panel gallery">
          <img className="heroImage" src={primaryImageUrl} alt={item.title} />
          {item.images.length > 1 ? (
            <div className="thumbRow">
              {item.images.map((image) => (
                <img
                  key={image.providerPublicId}
                  className="thumb"
                  src={image.imageUrl}
                  alt={item.title}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="panel adminDetailPanel">
          <div className="badgeRow">
            <span className="badge">{statusLabel(item.status)}</span>
            <span className="badge">
              {purchaseTypeLabel(item.purchaseType)}
            </span>
            {item.isFreeShare ? <span className="badge">무료 나눔</span> : null}
            {item.isAnonymous ? <span className="badge">익명 등록</span> : null}
            {item.allowPriceOffer ? (
              <span className="badge">가격 제안 가능</span>
            ) : null}
          </div>
          <h1>{item.title}</h1>
          <p className="adminDetailPrice">{formatPrice(item.priceKrw)}</p>
          <p className="muted adminDetailDescription">
            {item.description || "설명이 아직 등록되지 않았습니다."}
          </p>
          <div className="adminRecordGrid">
            <div className="adminRecordItem">
              <span className="adminMetaLabel">판매 기간</span>
              <span>{formatSaleWindow(item)}</span>
            </div>
            <div className="adminRecordItem">
              <span className="adminMetaLabel">구매 사이트 노출</span>
              <span>{saleExposureLabel(item)}</span>
            </div>
          </div>

          <div className="adminDetailControls">
            <div className="adminControlCard">
              <label>판매 방식</label>
              <select
                className="select"
                value={purchaseType}
                disabled={isSavingSettings}
                onChange={(event) =>
                  setPurchaseType(event.target.value as PurchaseType)
                }
              >
                <option value="INSTANT_BUY">즉시 구매로 판매하기</option>
                <option value="GAME_CHANCE">가위바위보로 판매하기</option>
              </select>
            </div>

            <div className="adminControlCard">
              <label>상태 변경</label>
              <select
                className="select"
                value={status}
                disabled={isSavingSettings}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="OPEN">판매중</option>
                <option value="SOLD_OUT">품절</option>
                <option value="CANCELLED">취소</option>
              </select>
            </div>

            <div className="adminControlCard adminControlCardWide">
              <label className="adminToggleLabel">
                <input
                  type="checkbox"
                  checked={allowPriceOffer}
                  disabled={item.isFreeShare || isSavingSettings}
                  onChange={(event) => setAllowPriceOffer(event.target.checked)}
                />
                네고 제안 받기
              </label>
              <p className="muted">
                {item.isFreeShare
                  ? "무료 나눔 상품의 전환 여부와 가격 수정은 상세 수정 화면에서 함께 변경해 주세요."
                  : "구매자가 가격을 제안할 수 있도록 열어둘지 바로 바꿀 수 있습니다."}
              </p>
            </div>

            <div className="adminControlCard adminControlCardWide">
              <AnonymousRegistrationField
                checked={isAnonymous}
                onChange={(nextValue) => {
                  if (isSavingSettings) {
                    return;
                  }

                  setIsAnonymous(nextValue);
                }}
                helperText="익명 등록을 켜면 구매자 사이트에서 판매자 이름이 보이지 않습니다."
              />
            </div>
          </div>

          <div className="actionRow adminDetailActions">
            <Link
              className="secondaryButton"
              href={`/products/${productId}/edit`}
            >
              상품 수정
            </Link>
            <button
              className="primaryButton"
              disabled={isSavingSettings}
              onClick={async () => {
                if (isSavingSettings) {
                  return;
                }

                setIsSavingSettings(true);
                try {
                  const response = await requestJson<{ item: ProductDetail }>(
                    `/admin/products/${productId}`,
                    {
                      method: "PATCH",
                      body: JSON.stringify({
                        status,
                        isAnonymous,
                        allowPriceOffer,
                        purchaseType,
                      }),
                    },
                  );
                  setItem(response.item);
                  setIsAnonymous(response.item.isAnonymous);
                  setAllowPriceOffer(response.item.allowPriceOffer);
                  setPurchaseType(response.item.purchaseType);
                  setMessage("상품 판매 설정을 업데이트했습니다.");
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "업데이트에 실패했습니다.",
                  );
                } finally {
                  setIsSavingSettings(false);
                }
              }}
            >
              {isSavingSettings ? "저장 중..." : "상태 저장"}
            </button>
          </div>

          {item.soldOrder ? (
            <div className="message">
              {item.isFreeShare ? "나눔 완료" : "구매 완료"}:{" "}
              {accountLabel(
                item.soldOrder.buyerDisplayName,
                item.soldOrder.buyerThreadsUsername,
              )}{" "}
              /{" "}
              {item.soldOrder.source === "PRICE_OFFER_ACCEPTED"
                ? "가격 제안 수락"
                : item.soldOrder.source === "INSTANT_BUY"
                  ? "즉시 구매"
                  : "가위바위보 승리"}
            </div>
          ) : null}
          {message ? <div className="message">{message}</div> : null}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <p className="eyebrow">Price Offers</p>
        <h2>가격 제안 목록</h2>
        {item.isFreeShare ? (
          <p className="muted">
            무료 나눔 상품은 가격 제안을 받을 수 없습니다.
          </p>
        ) : null}
        {!item.isFreeShare && priceOffers.length === 0 ? (
          <p className="muted">아직 들어온 가격 제안이 없습니다.</p>
        ) : null}
        {!item.isFreeShare && priceOffers.length > 0 ? (
          <div className="adminRecordList">
            {priceOffers.map((offer) => {
              const isAcceptedBuyer =
                item.soldOrder?.buyerId === offer.buyerId &&
                item.soldOrder?.source === "PRICE_OFFER_ACCEPTED";
              const canAccept = item.status === "OPEN" && !item.soldOrder;

              return (
                <article className="adminRecordCard" key={offer.id}>
                  <div className="adminRecordHeader">
                    <strong>
                      {accountLabel(
                        offer.buyerDisplayName,
                        offer.buyerThreadsUsername,
                      )}
                    </strong>
                    {isAcceptedBuyer ? (
                      <span className="badge">수락 완료</span>
                    ) : null}
                  </div>
                  <div className="adminRecordGrid">
                    <div className="adminRecordItem">
                      <span className="adminMetaLabel">제안 가격</span>
                      <strong>{formatPrice(offer.offeredPriceKrw)}</strong>
                    </div>
                    <div className="adminRecordItem">
                      <span className="adminMetaLabel">시간</span>
                      <span>{formatDateTime(offer.createdAt)}</span>
                    </div>
                    <div className="adminRecordItem adminRecordItemWide">
                      <span className="adminMetaLabel">메모</span>
                      <span>{offer.note || "-"}</span>
                    </div>
                  </div>
                  <div className="adminRecordActions">
                    {isAcceptedBuyer ? (
                      <span className="muted">이미 판매 처리된 제안입니다.</span>
                    ) : canAccept ? (
                      <button
                        className="primaryButton"
                        disabled={acceptingOfferId === offer.id}
                        onClick={async () => {
                          const confirmed = window.confirm(
                            `${offer.buyerDisplayName}님의 가격 제안을 수락하고 판매 처리할까요?`,
                          );
                          if (!confirmed) {
                            return;
                          }

                          try {
                            setAcceptingOfferId(offer.id);
                            const response = await requestJson<{
                              item: ProductDetail;
                              message: string;
                            }>(
                              `/admin/products/${productId}/price-offers/${offer.id}/accept`,
                              { method: "POST" },
                            );
                            setItem(response.item);
                            await loadData();
                            setMessage(response.message);
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "가격 제안 수락에 실패했습니다.",
                            );
                          } finally {
                            setAcceptingOfferId(null);
                          }
                        }}
                      >
                        {acceptingOfferId === offer.id ? "처리 중..." : "수락"}
                      </button>
                    ) : (
                      <span className="muted">처리 불가</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <p className="eyebrow">Game Attempts</p>
        <h2>가위바위보 도전 기록</h2>
        {attempts.length === 0 ? (
          <p className="muted">아직 도전 기록이 없습니다.</p>
        ) : null}
        {attempts.length > 0 ? (
          <div className="adminRecordList">
            {attempts.map((attempt) => (
              <article className="adminRecordCard" key={attempt.id}>
                <div className="adminRecordHeader">
                  <strong>{attempt.userDisplayName}</strong>
                  <span className="badge">{attempt.result}</span>
                </div>
                <div className="adminRecordGrid">
                  <div className="adminRecordItem">
                    <span className="adminMetaLabel">내 선택</span>
                    <span>{attempt.playerChoice}</span>
                  </div>
                  <div className="adminRecordItem">
                    <span className="adminMetaLabel">상대 선택</span>
                    <span>{attempt.systemChoice}</span>
                  </div>
                  <div className="adminRecordItem adminRecordItemWide">
                    <span className="adminMetaLabel">시간</span>
                    <span>{formatDateTime(attempt.playedAt)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
