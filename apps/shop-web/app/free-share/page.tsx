"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductCard, SessionUser } from "@jinmarket/shared";

import { ProductCardGrid } from "../../components/ProductCardGrid";
import { fetchCurrentUser, requestJson } from "../../lib/api";

export default function FreeSharePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          setItems(productsResponse.items.filter((item) => item.isFreeShare));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "무료 나눔 상품을 불러오지 못했습니다.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="hero heroSplit">
        <div>
          <p className="eyebrow">Free Share Zone</p>
          <h1>무료로 나눔받을 수 있는 상품만 따로 둘러보세요</h1>
          <p className="muted heroBody">
            무료 나눔 상품은 즉시 신청하거나 가위바위보 도전 방식으로 진행됩니다.
            신청이 완료되면 판매자가 전달 방법을 직접 안내합니다.
          </p>
          <div className="actionRow" style={{ marginTop: 16 }}>
            <Link className="ghostButton" href="/">
              전체 상품으로 돌아가기
            </Link>
          </div>
          {!user ? (
            <div className="message">
              로그인 전에는 목록만 확인할 수 있습니다. 무료 나눔을 신청하려면{" "}
              <Link href="/login">로그인</Link>해 주세요.
            </div>
          ) : null}
          {error ? <div className="message">{error}</div> : null}
        </div>

        <aside className="heroAside">
          <div className="heroStatGrid">
            <div className="heroStat">
              <strong>{items.length}</strong>
              <span>무료 나눔 상품</span>
            </div>
            <div className="heroStat">
              <strong>{items.filter((item) => item.purchaseType === "INSTANT_BUY").length}</strong>
              <span>즉시 신청 가능</span>
            </div>
            <div className="heroStat">
              <strong>{items.filter((item) => item.purchaseType === "GAME_CHANCE").length}</strong>
              <span>가위바위보 도전</span>
            </div>
            <div className="heroStat">
              <strong>{items.filter((item) => item.status === "OPEN").length}</strong>
              <span>현재 신청 가능</span>
            </div>
          </div>
        </aside>
      </section>

      <section>
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Free Share</p>
            <h2>무료 나눔 존</h2>
          </div>
          <div className="sectionMeta">
            무료 나눔 상품만 모아 보여줍니다. 모바일에서는 2열, 큰 화면에서는 3열 카드로
            빠르게 둘러볼 수 있습니다.
          </div>
        </div>

        <ProductCardGrid
          items={items}
          emptyMessage="지금은 등록된 무료 나눔 상품이 없습니다. 잠시 후 다시 확인해 주세요."
        />
      </section>
    </>
  );
}
