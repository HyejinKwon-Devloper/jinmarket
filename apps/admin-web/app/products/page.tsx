"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SellerAccessOverview, SellerProductRecord, SessionUser } from "@jinmarket/shared";

import { ManagedSellerAccessStatusPanel } from "../../components/ManagedSellerAccessStatusPanel";
import {
  fetchCurrentUser,
  fetchSellerAccessOverview,
  formatPrice,
  hasSellerAccess,
  purchaseTypeLabel,
  requestJson,
  statusLabel,
} from "../../lib/api";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSaleWindow(item: SellerProductRecord) {
  const start = formatDate(item.saleStartsAt);
  if (!item.saleEndsAt) {
    return `${start}부터 무기한`;
  }

  return `${start} ~ ${formatDate(item.saleEndsAt)}`;
}

function exposureLabel(item: SellerProductRecord) {
  if (item.status !== "OPEN") {
    return statusLabel(item.status);
  }

  if (item.isSaleActive) {
    return "노출 중";
  }

  const now = Date.now();
  const saleStartsAt = new Date(item.saleStartsAt).getTime();
  const saleEndsAt = item.saleEndsAt ? new Date(item.saleEndsAt).getTime() : null;

  if (saleStartsAt > now) {
    return "시작 대기";
  }

  if (saleEndsAt !== null && saleEndsAt < now) {
    return "기간 종료";
  }

  return "중지";
}

function buyerLabel(item: SellerProductRecord) {
  if (!item.soldBuyerDisplayName && !item.soldBuyerThreadsUsername) {
    return null;
  }

  if (
    item.soldBuyerThreadsUsername &&
    item.soldBuyerDisplayName &&
    item.soldBuyerThreadsUsername !== item.soldBuyerDisplayName
  ) {
    return `${item.soldBuyerThreadsUsername} (${item.soldBuyerDisplayName})`;
  }

  return item.soldBuyerThreadsUsername ?? item.soldBuyerDisplayName;
}

export default function AdminProductsPage() {
  const [items, setItems] = useState<SellerProductRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [sellerAccessOverview, setSellerAccessOverview] = useState<SellerAccessOverview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestingApproval, setRequestingApproval] = useState(false);

  const load = useCallback(async (cancelledRef?: { current: boolean }) => {
    function isCancelled() {
      return cancelledRef?.current === true;
    }

    async function loadProducts() {
      const response = await requestJson<{ items: SellerProductRecord[] }>("/admin/products");
      if (!isCancelled()) {
        setItems(response.items);
      }
    }

    const user = await fetchCurrentUser();

    if (isCancelled()) {
      return;
    }

    setCurrentUser(user);

    if (!user) {
      setSellerAccessOverview(null);
      setItems([]);
      setMessage("로그인이 필요합니다.");
      return;
    }

    if (hasSellerAccess(user)) {
      await loadProducts();
      if (!isCancelled()) {
        setSellerAccessOverview({
          canSell: true,
          isAdmin: user.roles.includes("ADMIN"),
          latestRequest: null
        });
        setMessage(null);
      }
      return;
    }

    const overview = await fetchSellerAccessOverview();

    if (isCancelled()) {
      return;
    }

    setSellerAccessOverview(overview);
    setItems([]);
    setMessage(null);

    if (overview.canSell) {
      await loadProducts();
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };

    void load(cancelledRef).catch((error) => {
      if (!cancelledRef.current) {
        setMessage(
          error instanceof Error
            ? error.message
            : "상품 목록을 불러오지 못했습니다."
        );
      }
    });

    function handleRefresh() {
      void load().catch((error) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "상품 목록을 불러오지 못했습니다."
        );
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        handleRefresh();
      }
    }

    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelledRef.current = true;
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  const canManageProducts = hasSellerAccess(currentUser) || sellerAccessOverview?.canSell;

  const openCount = useMemo(
    () => items.filter((item) => item.status === "OPEN" && item.isSaleActive).length,
    [items],
  );
  const freeShareCount = useMemo(
    () => items.filter((item) => item.isFreeShare).length,
    [items],
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Products</p>
        <h1>등록한 상품을 빠르게 훑고 바로 관리하세요</h1>
        <p className="muted" style={{ marginTop: 12 }}>
          작은 썸네일과 핵심 정보 중심의 목록형 화면으로 여러 상품을 한 번에
          확인할 수 있습니다.
        </p>
        <div className="actionRow" style={{ marginTop: 16 }}>
          {canManageProducts ? (
            <Link className="primaryButton" href="/products/new">
              새 상품 등록
            </Link>
          ) : currentUser ? (
            <button className="primaryButton" disabled type="button">
              새 상품 등록
            </button>
          ) : (
            <>
              <button className="primaryButton" disabled type="button">
                새 상품 등록
              </button>
              <Link
                className="secondaryButton"
                href="/login?return_to=/products/new"
              >
                로그인
              </Link>
            </>
          )}
        </div>
        {message ? <div className="message">{message}</div> : null}
      </section>

      {currentUser && !canManageProducts ? (
        <ManagedSellerAccessStatusPanel
          overview={sellerAccessOverview}
          requesting={requestingApproval}
          onRequest={async () => {
            if (requestingApproval) {
              return;
            }

            try {
              setRequestingApproval(true);
              const response = await requestJson<{
                item: NonNullable<SellerAccessOverview["latestRequest"]>;
                message: string;
              }>("/admin/seller-access/me/request", { method: "POST" });
              setSellerAccessOverview((previous) => ({
                canSell: false,
                isAdmin: previous?.isAdmin ?? false,
                latestRequest: response.item
              }));
              setMessage(response.message);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "판매자 승인 신청에 실패했습니다.");
            } finally {
              setRequestingApproval(false);
            }
          }}
        />
      ) : null}

      <section className="panel adminListPanel">
        <div className="sectionHeader adminListHeader">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2>상품 목록</h2>
          </div>
          <p className="sectionMeta">
            전체 {items.length}개 · 노출중 {openCount}개 · 무료 나눔{" "}
            {freeShareCount}개
          </p>
        </div>

        {!canManageProducts ? (
          <p className="muted">판매자 승인이 완료되면 이곳에서 등록한 상품을 관리할 수 있습니다.</p>
        ) : items.length === 0 ? (
          <p className="muted">
            아직 등록한 상품이 없습니다. 첫 상품부터 바로 등록해보세요.
          </p>
        ) : (
          <div className="adminProductList">
            {items.map((item) => (
              <article className="adminProductRow" key={item.id}>
                <div className="adminProductSummary">
                  <img
                    className="adminProductThumb"
                    src={
                      item.primaryImageUrl ??
                      "https://placehold.co/240x240?text=No+Image"
                    }
                    alt={item.title}
                  />
                  <div className="adminProductInfo">
                    <div className="badgeRow adminTableBadges">
                      <span className="badge">{statusLabel(item.status)}</span>
                      <span className="badge">
                        {purchaseTypeLabel(item.purchaseType)}
                      </span>
                      {item.allowPriceOffer ? (
                        <span className="badge">가격 제안 가능</span>
                      ) : null}
                      {item.isFreeShare ? (
                        <span className="badge">무료 나눔</span>
                      ) : null}
                    </div>
                    <Link
                      className="adminListTitle"
                      href={`/products/${item.id}`}
                    >
                      {item.title}
                    </Link>
                    <strong className="adminTablePrice">
                      {formatPrice(item.priceKrw)}
                    </strong>
                    <p className="adminListDescription">
                      {item.description || "설명이 아직 등록되지 않았습니다."}
                    </p>
                  </div>
                </div>

                <div className="adminMetaGrid">
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">구매자</span>
                    <span>{buyerLabel(item) ?? "-"}</span>
                  </div>
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">등록일</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">판매 기간</span>
                    <span>{formatSaleWindow(item)}</span>
                  </div>
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">노출 상태</span>
                    <span>{exposureLabel(item)}</span>
                  </div>
                </div>

                <div className="adminTableActions adminMetaActions">
                  <Link
                    className="secondaryButton"
                    href={`/products/${item.id}`}
                  >
                    상세 관리
                  </Link>
                  <Link
                    className="ghostButton"
                    href={`/products/${item.id}/edit`}
                  >
                    수정
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
