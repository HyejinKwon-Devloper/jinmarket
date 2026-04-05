"use client";

import { useEffect, useState } from "react";
import type { OrderRecord } from "@jinmarket/shared";

import { fetchCurrentUser, requestJson } from "../../../lib/api";

function orderSourceLabel(source: OrderRecord["source"]) {
  switch (source) {
    case "PRICE_OFFER_ACCEPTED":
      return "가격 제안 수락";
    case "GAME_CHANCE_WIN":
      return "가위바위보 승리";
    default:
      return "즉시 구매";
  }
}

export function MyOrdersClient() {
  const [items, setItems] = useState<OrderRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

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
        const response = await requestJson<{ items: OrderRecord[] }>("/me/orders");
        if (!cancelled) {
          setItems(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "주문 목록을 불러오지 못했습니다.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <p className="eyebrow">My Orders</p>
      <h1>내 구매 내역</h1>
      {message ? <div className="message">{message}</div> : null}
      {items.length === 0 ? <p className="muted">아직 구매한 상품이 없습니다.</p> : null}
      {items.map((item) => (
        <article key={item.id} className="panel" style={{ marginTop: 16 }}>
          <h2>{item.productTitle}</h2>
          <p className="muted">
            출품자 {item.sellerDisplayName ?? "익명 등록"}
          </p>
          <p>구매 경로 {orderSourceLabel(item.source)}</p>
          <p>상태 {item.status}</p>
        </article>
      ))}
    </section>
  );
}
