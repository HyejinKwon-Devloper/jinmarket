export const dynamic = "force-dynamic";

import Link from "next/link";

import { EventCardGrid } from "../../components/EventCardGrid";
import { readCurrentUser, readEvents } from "../../lib/server-api";

function eventStateLabel(item: Awaited<ReturnType<typeof readEvents>>[number]) {
  const now = Date.now();
  const startsAt = new Date(item.startsAt).getTime();
  const endsAt = new Date(item.endsAt).getTime();

  if (now < startsAt) {
    return "오픈 예정";
  }

  if (now > endsAt) {
    return "종료";
  }

  return "진행중";
}

export default async function EventZonePage() {
  const [currentUser, items] = await Promise.all([
    readCurrentUser(),
    readEvents(),
  ]);
  const activeCount = items.filter(
    (item) => eventStateLabel(item) === "진행중",
  ).length;
  const shopEntryCount = items.filter(
    (item) => item.registrationMode === "SHOP_ENTRY",
  ).length;

  return (
    <div className="space-y-4 sm:space-y-6 mx-3">
      <section className="overflow-hidden rounded-[26px] border border-[var(--buyer-border)] bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
        <div className="grid gap-4 px-3.5 py-4 sm:px-7 sm:py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:items-start">
          <div className="space-y-3.5 sm:space-y-5">
            <p className="eyebrow">Event Zone</p>
            <h1 className="text-[22px] font-extrabold leading-[1.12] tracking-[-0.04em] text-[var(--buyer-dark)] sm:max-w-[13ch] sm:text-4xl sm:leading-none">
              지금 진행 중인 이벤트를 둘러보고,
              <br /> 바로 참여해보세요.
            </h1>
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
                  노출중인 이벤트
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:gap-3 lg:col-span-1">
              <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
                <strong className="text-[18px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-2xl">
                  {activeCount}
                </strong>
                <p className="mt-1 text-[11px] text-[var(--buyer-muted)] sm:text-sm">
                  현재 진행중
                </p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
                <strong className="text-[18px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-2xl">
                  {shopEntryCount}
                </strong>
                <p className="mt-1 text-[11px] text-[var(--buyer-muted)] sm:text-sm">
                  응모 가능 이벤트
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
              <div className="mt-2.5 flex items-end justify-between gap-3">
                <strong className="text-[22px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-3xl">
                  {items.reduce((count, item) => count + item.entryCount, 0)}
                </strong>
                <span className="text-[12px] text-[var(--buyer-muted)] sm:text-sm">
                  전체 응모 수
                </span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="space-y-3">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Live Events</p>
            <h2>이벤트 존</h2>
          </div>
          <div className="sectionMeta">
            진행중이거나 곧 시작하는 이벤트를 카드로 확인하고, 상세 보기에서
            응모 가능 여부를 바로 확인할 수 있어요.
          </div>
        </div>

        <EventCardGrid
          emptyMessage="현재 노출 중인 이벤트가 없어요. 잠시 후 다시 확인해 주세요."
          items={items}
        />
      </section>
    </div>
  );
}
