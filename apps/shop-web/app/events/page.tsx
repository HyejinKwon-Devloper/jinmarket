"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventCard, SessionUser } from "@jinmarket/shared";

import { EventCardGrid } from "../../components/EventCardGrid";
import { fetchCurrentUser, requestJson } from "../../lib/api";

function eventStateLabel(item: EventCard) {
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

export default function EventZonePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<EventCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [currentUser, eventsResponse] = await Promise.all([
          fetchCurrentUser(),
          requestJson<{ items: EventCard[] }>("/events"),
        ]);

        if (!cancelled) {
          setUser(currentUser);
          setItems(eventsResponse.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "이벤트를 불러오지 못했습니다.",
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = items.filter(
    (item) => eventStateLabel(item) === "진행중",
  ).length;
  const shopEntryCount = items.filter(
    (item) => item.registrationMode === "SHOP_ENTRY",
  ).length;

  return (
    <>
      <section className="hero heroBanner heroSplit">
        <div>
          <p className="eyebrow">Event Zone</p>
          <h1 className="heroLead">
            지금 진행 중인 이벤트를 둘러보고, 응모 가능한 이벤트에 바로
            참여해 보세요.
          </h1>
          <p className="muted heroBody">
            판매자가 등록한 이벤트는 대표 사진 카드로 먼저 보여주고, 상세
            보기에서는 4장 이미지 캐러셀과 응모 버튼을 함께 제공해요.
          </p>
          <div className="actionRow" style={{ marginTop: 16 }}>
            <Link className="ghostButton" href="/">
              상품 목록으로 돌아가기
            </Link>
          </div>
          {!user ? (
            <div className="message">
              로그인 전에도 이벤트 목록은 볼 수 있어요. 응모 가능한 이벤트에
              참여하려면 <Link href="/login">로그인</Link>해 주세요.
            </div>
          ) : null}
          {error ? <div className="message">{error}</div> : null}
        </div>

        <aside className="heroAside">
          <div className="heroStatGrid">
            <div className="heroStat">
              <strong>{items.length}</strong>
              <span>노출중 이벤트</span>
            </div>
            <div className="heroStat">
              <strong>{activeCount}</strong>
              <span>현재 진행중</span>
            </div>
            <div className="heroStat">
              <strong>{shopEntryCount}</strong>
              <span>응모 가능 이벤트</span>
            </div>
            <div className="heroStat">
              <strong>
                {items.reduce((count, item) => count + item.entryCount, 0)}
              </strong>
              <span>전체 응모 수</span>
            </div>
          </div>
        </aside>
      </section>

      <section>
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
          items={items}
          emptyMessage="현재 노출 중인 이벤트가 없어요. 잠시 후 다시 확인해 주세요."
        />
      </section>
    </>
  );
}
