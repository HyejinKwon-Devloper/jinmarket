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

function orderStatusLabel(status: OrderRecord["status"]) {
  switch (status) {
    case "PENDING_CONTACT":
      return "연락 대기";
    case "CONTACTED":
      return "연락 완료";
    case "TRANSFER_PENDING":
      return "입금 대기";
    case "COMPLETED":
      return "구매 완료";
    case "CANCELLED":
      return "취소됨";
    default:
      return status;
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
          setMessage(error instanceof Error ? error.message : "구매 내역을 불러오지 못했습니다.");
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
      {items.length > 0 ? (
        <div className="stackList">
          {items.map((item) => (
            <article key={item.id} className="orderCard">
              <div>
                <h2>{item.productTitle}</h2>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  판매자 {item.sellerDisplayName ?? "익명 등록"}
                </p>
              </div>
              <div className="orderMetaGrid">
                <div className="orderMetaItem">
                  <span className="detailMetaLabel">구매 경로</span>
                  <span>{orderSourceLabel(item.source)}</span>
                </div>
                <div className="orderMetaItem">
                  <span className="detailMetaLabel">상태</span>
                  <span>{orderStatusLabel(item.status)}</span>
                </div>
                <div className="orderMetaItem">
                  <span className="detailMetaLabel">주문 시각</span>
                  <span>{new Date(item.orderedAt).toLocaleString("ko-KR")}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
