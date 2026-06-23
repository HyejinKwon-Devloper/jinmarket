"use client";

import type { ProductCard } from "@jinmarket/shared";

import { type SellerCatalogSection } from "../lib/catalog";
import { ProfileAvatar } from "./ProfileAvatar";
import { Badge } from "./ui/Badge";
import { BuyerProductCard } from "./BuyerProductCard";

function sectionSummary(items: ProductCard[]) {
  return {
    instantBuy: items.filter((item) => item.purchaseType === "INSTANT_BUY")
      .length,
    gameChance: items.filter((item) => item.purchaseType === "GAME_CHANCE")
      .length,
    freeShare: items.filter((item) => item.isFreeShare).length,
  };
}

export function SellerProductSections({
  sections,
  emptyMessage,
}: {
  sections: SellerCatalogSection[];
  emptyMessage: string;
}) {
  if (sections.length === 0) {
    return (
      <section className="rounded-[24px] border border-dashed border-[var(--buyer-border)] bg-white/80 p-5 text-center shadow-sm sm:rounded-[28px] sm:p-6">
        <h2 className="text-base font-bold text-[var(--buyer-ink)] sm:text-lg">
          조건에 맞는 상품이 아직 없어요
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-[var(--buyer-muted)] sm:text-sm sm:leading-6">
          {emptyMessage}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {sections.map((section, sectionIndex) => {
        const summary = sectionSummary(section.items);
        const sectionId = `seller-section-${section.key.replace(/[^a-z0-9-]/gi, "-")}`;
        const isAnonymousSection = section.key === "anonymous";

        return (
          <section
            key={section.key}
            aria-labelledby={sectionId}
            className="rounded-[22px] border border-[var(--buyer-border)] bg-white/90 p-3 shadow-[0_16px_32px_rgba(15,23,42,0.05)] sm:rounded-[28px] sm:p-5"
          >
            <div className="flex flex-col gap-3 border-b border-[var(--buyer-border)] pb-3 sm:gap-4 sm:pb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <ProfileAvatar
                  className="shrink-0 shadow-[0_10px_22px_rgba(31,78,121,0.10)]"
                  displayName={section.label}
                  imageUrl={section.profileImageUrl}
                  size="md"
                />

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-bold tracking-[-0.02em] text-[var(--buyer-ink)] sm:text-xl">
                      {isAnonymousSection ? "익명 판매자" : section.label}
                    </p>
                    <Badge>{section.items.length}개 상품</Badge>
                  </div>
                  <p className="text-[12px] leading-5 text-[var(--buyer-muted)] sm:text-sm sm:leading-6">
                    {isAnonymousSection ? "익명 판매자" : `${section.label}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {summary.instantBuy > 0 ? (
                  <Badge variant="success">
                    즉시 구매 {summary.instantBuy}
                  </Badge>
                ) : null}
                {summary.gameChance > 0 ? (
                  <Badge>가위바위보 {summary.gameChance}</Badge>
                ) : null}
                {summary.freeShare > 0 ? (
                  <Badge variant="warning">무료 나눔 {summary.freeShare}</Badge>
                ) : null}
              </div>
            </div>

            <div
              aria-label={`${section.label} 상품 슬라이드`}
              className="scrollbar-none mt-3 overflow-x-auto pb-1"
            >
              <ul className="flex min-w-max snap-x snap-mandatory gap-2.5 sm:mt-1 sm:gap-3">
                {section.items.map((item, itemIndex) => (
                  <li
                    key={item.id}
                    className="w-[10.5rem] shrink-0 snap-start sm:w-[12.5rem] lg:w-[13rem]"
                  >
                    <BuyerProductCard
                      item={item}
                      priority={sectionIndex === 0 && itemIndex < 2}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
