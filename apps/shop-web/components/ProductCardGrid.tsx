"use client";

import Link from "next/link";
import type { ProductCard } from "@jinmarket/shared";

import { formatPrice, purchaseTypeLabel, statusLabel } from "../lib/api";

export function ProductCardGrid({
  items,
  emptyMessage
}: {
  items: ProductCard[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="panel">
        <p className="muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="cardGrid">
      {items.map((item) => (
        <article className="card" key={item.id}>
          <img
            className="cardImage"
            src={item.primaryImageUrl ?? "https://placehold.co/600x600?text=No+Image"}
            alt={item.title}
          />
          <div className="cardBody">
            <div className="badgeRow">
              <span className={`badge ${item.status === "OPEN" ? "success" : ""}`}>{statusLabel(item.status)}</span>
              <span className="badge">{purchaseTypeLabel(item.purchaseType)}</span>
              {item.isFreeShare ? <span className="badge">무료 나눔</span> : null}
              {item.allowPriceOffer ? <span className="badge">가격 제안 가능</span> : null}
            </div>

            <div className="cardMeta">
              <h2 className="cardTitle">{item.title}</h2>
              {item.sellerDisplayName ? <p className="muted">{item.sellerDisplayName}</p> : null}
            </div>

            <p className="priceText">{formatPrice(item.priceKrw)}</p>

            <div className="cardFooter">
              <Link className="primaryButton" href={`/products/${item.id}`}>
                상세 보기
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
