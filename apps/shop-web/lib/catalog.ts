import type { ProductCard } from "@jinmarket/shared";

export type SellerCatalogSection = {
  key: string;
  label: string;
  description: string;
  items: ProductCard[];
};

const sellerProfilePalettes = [
  "from-[var(--buyer-soft)] via-white to-[var(--buyer-softest)]",
  "from-[var(--buyer-softest)] via-white to-[var(--buyer-soft)]",
  "from-white via-[var(--buyer-softest)] to-[var(--buyer-soft)]",
] as const;

export function getSellerProfilePalette(label: string) {
  const sum = Array.from(label).reduce((total, char) => total + char.charCodeAt(0), 0);
  return sellerProfilePalettes[sum % sellerProfilePalettes.length];
}

export function getSellerProfileInitial(section: Pick<SellerCatalogSection, "key" | "label">) {
  if (section.key === "anonymous") {
    return "익";
  }

  return section.label.trim().slice(0, 1) || "판";
}

export function groupProductsByCatalogSection(items: ProductCard[]): SellerCatalogSection[] {
  const sections = new Map<string, SellerCatalogSection>();

  for (const item of items) {
    const existing = sections.get(item.catalogGroupKey);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    sections.set(item.catalogGroupKey, {
      key: item.catalogGroupKey,
      label: item.catalogGroupLabel,
      description: item.isAnonymous
        ? "판매자 정보를 공개하지 않는 상품만 따로 모아둔 섹션입니다."
        : "같은 판매자가 등록한 상품을 한 번에 둘러볼 수 있습니다.",
      items: [item],
    });
  }

  return Array.from(sections.values());
}
