"use client";

import { useEffect, useState } from "react";
import type { OrderRecord, SellerAccessOverview, SessionUser } from "@jinmarket/shared";

import { ManagedSellerAccessStatusPanel } from "../../components/ManagedSellerAccessStatusPanel";
import { fetchCurrentUser, fetchSellerAccessOverview, hasSellerAccess, requestJson } from "../../lib/api";

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

function buyerLabel(item: OrderRecord) {
  if (item.buyerThreadsUsername && item.buyerDisplayName && item.buyerThreadsUsername !== item.buyerDisplayName) {
    return `${item.buyerThreadsUsername} (${item.buyerDisplayName})`;
  }

  return item.buyerThreadsUsername ?? item.buyerDisplayName ?? "-";
}

export default function AdminOrdersPage() {
  const [items, setItems] = useState<OrderRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sellerAccessOverview, setSellerAccessOverview] = useState<SellerAccessOverview | null>(null);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const canViewOrders = Boolean(currentUser) && (!sellerAccessOverview || sellerAccessOverview.canSell);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const user = await fetchCurrentUser();
      if (!cancelled) {
        setCurrentUser(user);
      }

      if (!user) {
        if (!cancelled) {
          setMessage("로그인이 필요합니다.");
        }
        return;
      }

      if (!hasSellerAccess(user)) {
        try {
          const overview = await fetchSellerAccessOverview();
          if (!cancelled) {
            setSellerAccessOverview(overview);
            setItems([]);
          }
        } catch (error) {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : "판매자 승인 상태를 불러오지 못했습니다.");
          }
        }
        return;
      }

      try {
        const response = await requestJson<{ items: OrderRecord[] }>("/admin/orders");
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
      <p className="eyebrow">Orders</p>
      <h1>구매 완료 주문 목록</h1>
      {message ? <div className="message">{message}</div> : null}
      {sellerAccessOverview && !sellerAccessOverview.canSell ? (
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
      {canViewOrders && items.length === 0 ? <p className="muted">아직 구매 완료된 주문이 없습니다.</p> : null}
      {canViewOrders && items.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>상품</th>
              <th>구매자</th>
              <th>구매 방식</th>
              <th>상태</th>
              <th>주문 시간</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.productTitle}</td>
                <td>{buyerLabel(item)}</td>
                <td>{orderSourceLabel(item.source)}</td>
                <td>{item.status}</td>
                <td>{new Date(item.orderedAt).toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
