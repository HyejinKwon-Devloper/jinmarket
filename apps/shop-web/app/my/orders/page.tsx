export const dynamic = "force-dynamic";

import Link from "next/link";
import type { OrderRecord } from "@jinmarket/shared";

import { formatPrice } from "../../../lib/api";
import { readCurrentUser, readMyOrders } from "../../../lib/server-api";

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

export default async function MyOrdersPage() {
  const user = await readCurrentUser();

  if (!user) {
    return (
      <section className="panel">
        <p className="eyebrow">My Orders</p>
        <h1>내 구매 내역</h1>
        <div className="message">
          구매 내역을 보려면 <Link href="/login">로그인</Link>해 주세요.
        </div>
      </section>
    );
  }

  const items = await readMyOrders();

  return (
    <section className="panel">
      <p className="eyebrow">My Orders</p>
      <h1>내 구매 내역</h1>
      {items.length === 0 ? (
        <p className="muted">아직 구매한 상품이 없습니다.</p>
      ) : (
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
                  <span className="detailMetaLabel">등록 금액</span>
                  <span>{formatPrice(item.productPriceKrw)}</span>
                </div>
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
      )}
    </section>
  );
}
