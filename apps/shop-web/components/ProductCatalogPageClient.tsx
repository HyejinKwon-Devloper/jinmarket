"use client";

import { useDeferredValue, useEffect, useState } from "react";
import type { ProductCard, SessionUser } from "@jinmarket/shared";

import { SellerProductSections } from "./SellerProductSections";
import { SellerProfileRail } from "./SellerProfileRail";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { groupProductsByCatalogSection } from "../lib/catalog";
import {
  matchesProductFilter,
  matchesProductSearch,
  productFilterLabels,
  productFilters,
  sortCatalogItems,
  type ProductFilter,
} from "../lib/product-catalog";

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 21L15.8 15.8M17 10.5C17 14.0899 14.0899 17 10.5 17C6.91015 17 4 14.0899 4 10.5C4 6.91015 6.91015 4 10.5 4C14.0899 4 17 6.91015 17 10.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ProductCatalogPageClient({
  initialItems,
  initialUser,
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
  const filteredItems = initialItems
    .filter(
      (item) =>
        matchesProductFilter(item, activeFilter) &&
        matchesProductSearch(item, normalizedQuery),
    )
    .sort(sortCatalogItems);
  const sections = groupProductsByCatalogSection(filteredItems);
  const visibleSections = selectedSellerKey
    ? sections.filter((section) => section.key === selectedSellerKey)
    : sections;
  const openCount = initialItems.filter(
    (item) => item.status === "OPEN",
  ).length;
  const sellerCount = new Set(
    initialItems
      .filter((item) => !item.isAnonymous)
      .map((item) => item.catalogGroupKey),
  ).size;
  const anonymousCount = initialItems.filter((item) => item.isAnonymous).length;
  const priceOfferCount = initialItems.filter(
    (item) => item.allowPriceOffer,
  ).length;

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
        <div className="space-y-4 px-4 py-4 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2.5">
              <div className="space-y-2">
                <h1 className="max-w-[14ch] text-[22px] font-extrabold leading-[1.12] tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-4xl sm:leading-none">
                  판매자 중심으로 전체 상품을 차분하게 둘러보세요.
                </h1>
              </div>
            </div>
          </div>

          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="sr-only" htmlFor="buyer-product-catalog-search">
              상품 검색
            </label>
            <Input
              autoComplete="off"
              enterKeyHint="search"
              id="buyer-product-catalog-search"
              placeholder="굿즈명, 설명, 판매자명으로 검색"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Button
              aria-label="상품 검색"
              className="h-10 min-h-0 w-10 px-0 sm:h-11 sm:w-11"
              type="submit"
              variant="subtle"
            >
              <SearchIcon />
            </Button>
          </form>

          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {productFilters.map((filter) => (
              <Button
                key={filter}
                aria-pressed={filter === activeFilter}
                type="button"
                variant={filter === activeFilter ? "primary" : "outline"}
                onClick={() => setActiveFilter(filter)}
              >
                {productFilterLabels[filter]}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">공개 상품 {openCount}</Badge>
              {sellerCount > 0 ? <Badge>판매자 {sellerCount}</Badge> : null}
              {priceOfferCount > 0 ? (
                <Badge variant="warning">가격 제안 {priceOfferCount}</Badge>
              ) : null}
              {anonymousCount > 0 ? (
                <Badge variant="warning">익명 등록 {anonymousCount}</Badge>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-3 px-3 sm:px-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                판매자 컬렉션
              </p>
              <h2 className="text-lg font-bold tracking-[-0.03em] text-[var(--buyer-ink)] sm:text-2xl">
                {selectedSellerKey && visibleSections[0]
                  ? `${visibleSections[0].label} 상품`
                  : `${productFilterLabels[activeFilter]}을 판매자별로 둘러보세요`}
              </h2>
              <p className="text-[12px] leading-5 text-[var(--buyer-muted)] sm:text-sm sm:leading-6">
                판매자 프로필을 선택하면 해당 판매자의 상품만 바로 볼 수 있어요.
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
          emptyMessage="필터와 검색어에 맞는 판매자 상품이 아직 없습니다. 다른 조건으로 다시 확인해 주세요."
          sections={visibleSections}
        />
      </section>
    </div>
  );
}
