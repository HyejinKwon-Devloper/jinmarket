"use client";

import Link from "next/link";
import type { ProductCard } from "@jinmarket/shared";

import { formatPrice, purchaseTypeLabel, statusLabel } from "../lib/api";
import { getProductCardImageProps } from "../lib/image";

function sellerLabel(item: ProductCard) {
  if (item.sellerDisplayName) {
    return item.sellerDisplayName;
  }

  return "익명 등록";
}

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
      {items.map((item, index) => {
        const image = getProductCardImageProps(item.primaryImageUrl);

        return (
          <article className="card" key={item.id}>
            <img
              alt={item.title}
              className="cardImage"
              decoding="async"
              fetchPriority={index < 3 ? "high" : "auto"}
              height={720}
              loading={index < 6 ? "eager" : "lazy"}
              sizes={image.sizes}
              src={image.src}
              srcSet={image.srcSet}
              width={720}
            />
            <div className="cardBody">
              <div className="badgeRow">
                <span className={`badge ${item.status === "OPEN" ? "success" : ""}`}>
                  {statusLabel(item.status)}
                </span>
                <span className="badge">{purchaseTypeLabel(item.purchaseType)}</span>
                {item.isFreeShare ? <span className="badge">무료 나눔</span> : null}
                {item.allowPriceOffer ? <span className="badge">가격 제안 가능</span> : null}
              </div>

              <div className="cardSummary">
                <h2 className="cardTitle">{item.title}</h2>
                <p className="cardSellerLabel">판매자 {sellerLabel(item)}</p>
              </div>

              <div className="cardPriceRow">
                <p className="priceText">{formatPrice(item.priceKrw)}</p>
              </div>

              <div className="cardFooter">
                <Link className="primaryButton" href={`/products/${item.id}`}>
                  상세 보기
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
