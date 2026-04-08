"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductCard, SessionUser } from "@jinmarket/shared";

import { ProductCardGrid } from "../components/ProductCardGrid";
import { fetchCurrentUser, requestJson } from "../lib/api";

type ProductFilter = "ALL" | "INSTANT_BUY" | "GAME_CHANCE" | "PRICE_OFFER" | "FREE_SHARE";

export default function ShopHomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProductFilter>("ALL");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [currentUser, productsResponse] = await Promise.all([
          fetchCurrentUser(),
          requestJson<{ items: ProductCard[] }>("/products")
        ]);

        if (!cancelled) {
          setUser(currentUser);
          setItems(productsResponse.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "상품을 불러오지 못했습니다.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const instantBuyCount = items.filter((item) => item.purchaseType === "INSTANT_BUY").length;
  const gameChanceCount = items.filter((item) => item.purchaseType === "GAME_CHANCE").length;
  const offerCount = items.filter((item) => item.allowPriceOffer).length;
  const freeShareCount = items.filter((item) => item.isFreeShare).length;
  const filteredItems = items.filter((item) => {
    if (activeFilter === "INSTANT_BUY") {
      return item.purchaseType === "INSTANT_BUY";
    }

    if (activeFilter === "GAME_CHANCE") {
      return item.purchaseType === "GAME_CHANCE";
    }

    if (activeFilter === "PRICE_OFFER") {
      return item.allowPriceOffer;
    }

    if (activeFilter === "FREE_SHARE") {
      return item.isFreeShare;
    }

    return true;
  });
  const activeFilterLabel =
    activeFilter === "INSTANT_BUY"
      ? "즉시 구매"
      : activeFilter === "GAME_CHANCE"
        ? "가위바위보 도전"
        : activeFilter === "PRICE_OFFER"
          ? "가격 제안 가능"
          : activeFilter === "FREE_SHARE"
            ? "무료 나눔"
          : "전체 상품";

  return (
    <>
      <section className="hero heroBanner heroSplit">
        <div>
          <p className="eyebrow">Market Flow</p>
          <h1 className="heroLead">여러 사람의 물건을 카드처럼 빠르게 둘러보고, 즉시 구매하거나 가위바위보로 도전해 보세요.</h1>
          <p className="muted heroBody">
            모든 구매는 로그인 후 진행됩니다. 구매가 성사되면 판매자가 계좌이체 안내를 위해 직접 연락해 드립니다.
          </p>
          <div className="actionRow" style={{ marginTop: 16 }}>
            <Link className="secondaryButton" href="/events">
              이벤트 존 바로가기
            </Link>
            <Link className="ghostButton" href="/free-share">
              무료 나눔 존 바로가기
            </Link>
          </div>
          {!user ? (
            <div className="message">
              로그인 전에는 목록만 확인할 수 있습니다. 구매하려면 <Link href="/login">로그인 페이지</Link>로 이동해 주세요.
            </div>
          ) : null}
          {error ? <div className="message">{error}</div> : null}
        </div>

        <aside className="heroAside">
          <div className="heroStatGrid">
            <button
              type="button"
              className={`heroStat heroStatButton ${activeFilter === "ALL" ? "active" : ""}`}
              onClick={() => setActiveFilter("ALL")}
            >
              <strong>{items.length}</strong>
              <span>전체 상품</span>
            </button>
            <button
              type="button"
              className={`heroStat heroStatButton ${activeFilter === "INSTANT_BUY" ? "active" : ""}`}
              onClick={() => setActiveFilter("INSTANT_BUY")}
            >
              <strong>{instantBuyCount}</strong>
              <span>즉시 구매</span>
            </button>
            <button
              type="button"
              className={`heroStat heroStatButton ${activeFilter === "GAME_CHANCE" ? "active" : ""}`}
              onClick={() => setActiveFilter("GAME_CHANCE")}
            >
              <strong>{gameChanceCount}</strong>
              <span>가위바위보 도전</span>
            </button>
            <button
              type="button"
              className={`heroStat heroStatButton ${activeFilter === "PRICE_OFFER" ? "active" : ""}`}
              onClick={() => setActiveFilter("PRICE_OFFER")}
            >
              <strong>{offerCount}</strong>
              <span>가격 제안 가능</span>
            </button>
            <button
              type="button"
              className={`heroStat heroStatButton ${activeFilter === "FREE_SHARE" ? "active" : ""}`}
              onClick={() => setActiveFilter("FREE_SHARE")}
            >
              <strong>{freeShareCount}</strong>
              <span>무료 나눔</span>
            </button>
          </div>
        </aside>
      </section>

      <section>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>상품 목록</h2>
          </div>
          <div className="sectionMeta">
            현재 <strong>{activeFilterLabel}</strong> 상품만 보고 있습니다. 모바일은 기본 2열, 큰 화면에서는 3열 카드 레이아웃으로 한눈에 빠르게 둘러볼 수 있게 구성했습니다.
          </div>
        </div>

        {items.length === 0 ? (
          <div className="panel">
            <p className="muted">현재 등록된 상품이 없습니다. 잠시 후 다시 확인해 주세요.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="panel">
            <p className="muted">{activeFilterLabel} 조건에 맞는 상품이 아직 없습니다. 다른 분류도 확인해 보세요.</p>
          </div>
        ) : (
          <ProductCardGrid items={filteredItems} emptyMessage="" />
        )}
      </section>
    </>
  );
}
