import type { ProductCard } from "@jinmarket/shared";

export const productFilters = [
  "ALL",
  "INSTANT_BUY",
  "GAME_CHANCE",
  "PRICE_OFFER",
  "FREE_SHARE",
] as const;

export type ProductFilter = (typeof productFilters)[number];

export const productFilterLabels: Record<ProductFilter, string> = {
  ALL: "전체 상품",
  INSTANT_BUY: "즉시 구매",
  GAME_CHANCE: "가위바위보",
  PRICE_OFFER: "가격 제안",
  FREE_SHARE: "무료 나눔",
};

export function matchesProductFilter(item: ProductCard, activeFilter: ProductFilter) {
  if (activeFilter === "INSTANT_BUY") {
    return item.purchaseType === "INSTANT_BUY";
  }

  if (activeFilter === "GAME_CHANCE") {
    return item.purchaseType === "GAME_CHANCE";
  }

  if (activeFilter === "PRICE_OFFER") {
    return item.allowPriceOffer;
  }

  if (activeFilter === "FREE_SHARE") {
    return item.isFreeShare;
  }

  return true;
}

export function matchesProductSearch(item: ProductCard, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.title,
    item.description ?? "",
    item.sellerDisplayName ?? "",
    item.catalogGroupLabel,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function sortCatalogItems(left: ProductCard, right: ProductCard) {
  if (left.status !== right.status) {
    if (left.status === "OPEN") {
      return -1;
    }

    if (right.status === "OPEN") {
      return 1;
    }
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}
