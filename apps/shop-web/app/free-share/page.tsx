export const dynamic = "force-dynamic";

import Link from "next/link";

import { SellerProductSections } from "../../components/SellerProductSections";
import { Badge } from "../../components/ui/Badge";
import { LinkButton } from "../../components/ui/Button";
import { groupProductsByCatalogSection } from "../../lib/catalog";
import { readCurrentUser, readProducts } from "../../lib/server-api";

export default async function FreeSharePage() {
  const [currentUser, products] = await Promise.all([
    readCurrentUser(),
    readProducts(),
  ]);
  const items = products.filter((item) => item.isFreeShare);
  const sections = groupProductsByCatalogSection(items);
  const instantBuyCount = items.filter(
    (item) => item.purchaseType === "INSTANT_BUY",
  ).length;
  const gameChanceCount = items.filter(
    (item) => item.purchaseType === "GAME_CHANCE",
  ).length;
  const openCount = items.filter((item) => item.status === "OPEN").length;

  return (
    <div className="space-y-4 sm:space-y-6 mx-3">
      <section className="overflow-hidden rounded-[26px] border border-[var(--buyer-border)] bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
        <div className="grid gap-4 px-3.5 py-4 sm:px-7 sm:py-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)] lg:items-start">
          <div className="space-y-3.5 sm:space-y-4">
            <Badge variant="success">Free Share</Badge>
            <div className="space-y-2">
              <h1 className="max-w-[16ch] text-[22px] font-extrabold leading-[1.12] tracking-[-0.04em] text-[var(--buyer-dark)] sm:max-w-[14ch] sm:text-4xl sm:leading-none">
                무료로 나눔받을 수 있는 상품만 따로 모아봤어요
              </h1>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <LinkButton href="/products" variant="outline">
                전체 상품 보기
              </LinkButton>
              <LinkButton href="/events" variant="subtle">
                이벤트 보기
              </LinkButton>
            </div>

            {!currentUser ? (
              <div className="rounded-2xl border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3 py-2.5 text-[12px] leading-5 text-[var(--buyer-dark)] sm:px-4 sm:py-3 sm:text-sm sm:leading-6">
                로그인 없이도 목록은 볼 수 있지만, 무료 나눔 요청이나 구매
                진행은 로그인 후에 가능합니다.{" "}
                <Link
                  className="font-semibold text-[var(--buyer-primary)] underline"
                  href="/login"
                >
                  로그인
                </Link>
                후 계속해 주세요.
              </div>
            ) : null}
          </div>

          <aside className="grid gap-2 rounded-[22px] bg-[var(--buyer-softest)] p-3 sm:grid-cols-2 sm:gap-3 sm:rounded-[28px] sm:p-4 lg:grid-cols-1">
            <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--buyer-primary)]">
                Free Share Inventory
              </p>
              <div className="mt-2.5 flex items-end justify-between gap-3">
                <strong className="text-[22px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-3xl">
                  {items.length}
                </strong>
                <span className="text-[12px] text-[var(--buyer-muted)] sm:text-sm">
                  무료 나눔 상품
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:gap-3 lg:col-span-1">
              <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
                <strong className="text-[18px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-2xl">
                  {openCount}
                </strong>
                <p className="mt-1 text-[11px] text-[var(--buyer-muted)] sm:text-sm">
                  현재 요청 가능
                </p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
                <strong className="text-[16px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-xl">
                  {instantBuyCount}
                </strong>
                <p className="mt-1 text-[11px] text-[var(--buyer-muted)] sm:text-sm">
                  즉시 요청형
                </p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
                <strong className="text-[16px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-xl">
                  {gameChanceCount}
                </strong>
                <p className="mt-1 text-[11px] text-[var(--buyer-muted)] sm:text-sm">
                  가위바위보형
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
              Free Share Catalog
            </p>
            <h2 className="text-lg font-bold tracking-[-0.03em] text-[var(--buyer-ink)] sm:text-2xl">
              판매자별 무료 나눔 모음
            </h2>
          </div>
        </div>

        <SellerProductSections
          emptyMessage="지금은 등록된 무료 나눔 상품이 없습니다. 잠시 후 다시 확인해 주세요."
          sections={sections}
        />
      </section>
    </div>
  );
}
