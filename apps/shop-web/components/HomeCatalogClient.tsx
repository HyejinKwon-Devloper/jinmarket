"use client";

import { useDeferredValue, useEffect, useState } from "react";
import type { ProductCard, SessionUser } from "@jinmarket/shared";

import { SellerProductSections } from "./SellerProductSections";
import { SellerProfileRail } from "./SellerProfileRail";
import { Badge } from "./ui/Badge";
import { Input } from "./ui/Input";
import { groupProductsByCatalogSection } from "../lib/catalog";
import {
  matchesProductFilter,
  matchesProductSearch,
  type ProductFilter,
} from "../lib/product-catalog";

export function HomeCatalogClient({
  initialItems,
}: {
  initialItems: ProductCard[];
  initialUser: SessionUser | null;
}) {
  const [activeFilter, setActiveFilter] = useState<ProductFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSellerKey, setSelectedSellerKey] = useState<string | null>(
    null,
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const filteredItems = initialItems.filter(
    (item) =>
      matchesProductFilter(item, activeFilter) &&
      matchesProductSearch(item, normalizedQuery),
  );
  const sections = groupProductsByCatalogSection(filteredItems);
  const visibleSections = selectedSellerKey
    ? sections.filter((section) => section.key === selectedSellerKey)
    : sections;

  useEffect(() => {
    if (!selectedSellerKey) {
      return;
    }

    const hasSelectedSeller = sections.some(
      (section) => section.key === selectedSellerKey,
    );

    if (!hasSelectedSeller) {
      setSelectedSellerKey(null);
    }
  }, [sections, selectedSellerKey]);

  return (
    <div className="space-y-4 px-3 sm:space-y-6 sm:px-2">
      <section className="overflow-hidden rounded-[26px] border border-[var(--buyer-border)] bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
        <div className="grid gap-4 px-4 py-4 sm:px-7 sm:py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:items-start">
          <div className="space-y-3.5 sm:space-y-5">
            <div className="space-y-2.5 sm:space-y-3">
              <div className="space-y-2">
                <h1 className="text-[22px] font-extrabold leading-[1.12] tracking-[-0.04em] text-[var(--buyer-dark)] sm:max-w-[13ch] sm:text-4xl sm:leading-none md:max-w-full">
                  판매자 컬렉션 중심으로 <br /> 굿즈를 차분하게 둘러보세요.
                </h1>
                <p className="max-w-2xl text-[12px] leading-5 text-[var(--buyer-muted)] sm:text-[15px] sm:leading-7">
                  이제 판매자 단위로 상품을 볼 수 있어서, 취향에 맞는 컬렉션만
                  빠르게 좁혀볼 수 있어요.
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
              <label className="sr-only" htmlFor="buyer-catalog-search">
                상품 또는 판매자 검색
              </label>
              <Input
                autoComplete="off"
                enterKeyHint="search"
                id="buyer-catalog-search"
                placeholder="굿즈명, 설명, 판매자명으로 검색"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                판매자 컬렉션
              </p>
            </div>
          </div>

          <SellerProfileRail
            sections={sections}
            selectedSellerKey={selectedSellerKey}
            onSelectSeller={setSelectedSellerKey}
          />
        </div>

        <SellerProductSections
          emptyMessage="조건에 맞는 상품이 아직 없습니다. 다른 필터나 검색어로 다시 확인해 주세요."
          sections={visibleSections}
        />
      </section>
    </div>
  );
}
