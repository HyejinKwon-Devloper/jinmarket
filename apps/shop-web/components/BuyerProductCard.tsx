"use client";

import { useRouter } from "next/navigation";
import type { ProductCard } from "@jinmarket/shared";

import { formatPrice, purchaseTypeLabel, statusLabel } from "../lib/api";
import { getProductCardImageProps } from "../lib/image";
import { Badge } from "./ui/Badge";

export function BuyerProductCard({
  item,
  priority = false,
  variant = "compact",
}: {
  item: ProductCard;
  priority?: boolean;
  variant?: "compact" | "catalog";
}) {
  const router = useRouter();
  const image = getProductCardImageProps(item.primaryImageUrl);
  const handleImageError = (
    event: React.SyntheticEvent<HTMLImageElement>,
  ) => {
    const target = event.currentTarget;

    // 깨진/만료된 이미지 URL이면 플레이스홀더로 대체한다. 이미 폴백이면 무한 루프를 막는다.
    if (target.src === image.fallbackSrc) {
      return;
    }

    target.srcset = "";
    target.src = image.fallbackSrc;
  };
  const sellerLabel = item.isAnonymous
    ? "익명 셀렉션"
    : `${item.sellerDisplayName ?? item.catalogGroupLabel}`;

  if (variant === "catalog") {
    return (
      <article className="group flex h-full flex-col rounded-[24px] border border-[var(--buyer-border)] bg-white p-2.5 shadow-[0_14px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(31,78,121,0.12)] sm:rounded-[28px] sm:p-3">
        <div
          className="rounded-[20px] bg-[var(--buyer-softest)] p-2 sm:rounded-[24px] sm:p-2.5"
          onClick={() => router.push(`/products/${item.id}`)}
        >
          <div className="relative overflow-hidden rounded-[18px] bg-[var(--buyer-soft)] sm:rounded-[22px]">
            <img
              alt={item.title}
              className="aspect-square w-full object-cover"
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              height={720}
              loading={priority ? "eager" : "lazy"}
              sizes={image.sizes}
              src={image.src}
              srcSet={image.srcSet}
              width={720}
              onError={handleImageError}
            />
            <div className="absolute left-2 top-2 flex flex-wrap gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
              <Badge variant={item.status === "OPEN" ? "success" : "default"}>
                {statusLabel(item.status)}
              </Badge>
              <Badge>{purchaseTypeLabel(item.purchaseType)}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-1 pb-1 pt-3 sm:gap-3 sm:px-1.5 sm:pt-4">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--buyer-primary)] sm:text-[11px]">
              {sellerLabel}
            </p>
            <h3 className="text-[13px] font-bold leading-5 text-[var(--buyer-ink)] sm:text-[15px]">
              {item.title}
            </h3>
            {item.description ? (
              <p className="line-clamp-2 text-[11px] leading-5 text-[var(--buyer-muted)] sm:text-[12px]">
                {item.description}
              </p>
            ) : null}
          </div>

          <div className="mt-auto space-y-2.5">
            <div className="flex flex-wrap gap-1">
              {item.isFreeShare ? (
                <Badge variant="success">무료 나눔</Badge>
              ) : null}
              {item.allowPriceOffer ? (
                <Badge variant="warning">가격 제안 가능</Badge>
              ) : null}
            </div>
            <div className="border border-[var(--buyer-border)]"></div>
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[13px] font-extrabold tracking-[-0.03em] text-[var(--buyer-dark)] sm:text-[15px]">
                  {formatPrice(item.priceKrw)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[18px] border border-[var(--buyer-border)] bg-white shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(31,78,121,0.12)] sm:rounded-[22px]">
      <div
        className="relative overflow-hidden bg-[var(--buyer-soft)]"
        onClick={() => router.push(`/products/${item.id}`)}
      >
        <img
          alt={item.title}
          className="aspect-square w-full object-cover"
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          height={720}
          loading={priority ? "eager" : "lazy"}
          sizes={image.sizes}
          src={image.src}
          srcSet={image.srcSet}
          width={720}
          onError={handleImageError}
        />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
          <Badge variant={item.status === "OPEN" ? "success" : "default"}>
            {statusLabel(item.status)}
          </Badge>
          <Badge>{purchaseTypeLabel(item.purchaseType)}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5 sm:gap-3 sm:p-3.5">
        <div className="space-y-1.5 sm:space-y-2">
          <p className="text-[10px] font-semibold tracking-[0.01em] text-[var(--buyer-muted)] sm:text-[11px]">
            {sellerLabel}
          </p>
          <h3 className="text-[12px] font-bold leading-[1.35] text-[var(--buyer-ink)] sm:text-sm sm:leading-5">
            {item.title}
          </h3>
          {item.description ? (
            <p className="line-clamp-2 text-[10px] leading-4 text-[var(--buyer-muted)] sm:text-xs sm:leading-5">
              {item.description}
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-extrabold text-[var(--buyer-dark)] sm:text-sm">
              {formatPrice(item.priceKrw)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
