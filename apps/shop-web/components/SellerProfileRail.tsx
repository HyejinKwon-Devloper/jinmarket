"use client";

import { type SellerCatalogSection } from "../lib/catalog";
import { cn } from "../lib/ui";
import { ProfileAvatar } from "./ProfileAvatar";

export function SellerProfileRail({
  sections,
  selectedSellerKey,
  onSelectSeller,
}: {
  sections: SellerCatalogSection[];
  selectedSellerKey: string | null;
  onSelectSeller: (sellerKey: string | null) => void;
}) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="scrollbar-none overflow-x-auto pb-1">
        <ul className="flex min-w-max gap-2.5">
          <li>
            <button
              aria-label="전체 판매자 상품 보기"
              aria-pressed={selectedSellerKey === null}
              className={cn(
                "flex w-[78px] flex-col items-center gap-2 rounded-[20px] border px-2.5 py-3 text-center shadow-sm transition hover:bg-[var(--buyer-softest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2",
                selectedSellerKey === null
                  ? "border-[var(--buyer-primary)] bg-[var(--buyer-softest)] shadow-[0_12px_24px_rgba(31,78,121,0.12)]"
                  : "border-[var(--buyer-border)] bg-white",
              )}
              type="button"
              onClick={() => onSelectSeller(null)}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] text-[11px] font-black tracking-[-0.03em] text-[var(--buyer-dark)]">
                전체
              </span>
              <span className="text-[11px] font-semibold leading-4 text-[var(--buyer-ink)]">
                전체 보기
              </span>
            </button>
          </li>
          {sections.map((section) => {
            const isSelected = section.key === selectedSellerKey;

            return (
              <li key={section.key}>
                <button
                  aria-label={`${section.label} 판매자 상품만 보기`}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-[78px] flex-col items-center gap-2 rounded-[20px] border px-2.5 py-3 text-center shadow-sm transition hover:bg-[var(--buyer-softest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2",
                    isSelected
                      ? "border-[var(--buyer-primary)] bg-[var(--buyer-softest)] shadow-[0_12px_24px_rgba(31,78,121,0.12)]"
                      : "border-[var(--buyer-border)] bg-white",
                  )}
                  type="button"
                  onClick={() => onSelectSeller(section.key)}
                >
                  <ProfileAvatar
                    displayName={section.label}
                    imageUrl={section.profileImageUrl}
                    size="xs"
                  />
                  <span className="line-clamp-2 text-[11px] font-semibold leading-4 text-[var(--buyer-ink)]">
                    {section.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
