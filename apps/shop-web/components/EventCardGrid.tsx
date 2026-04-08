"use client";

import Link from "next/link";
import type { EventCard } from "@jinmarket/shared";

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

function registrationModeLabel(value: EventCard["registrationMode"]) {
  return value === "SHOP_ENTRY" ? "응모 가능" : "직접 등록 이벤트";
}

export function EventCardGrid({
  items,
  emptyMessage,
}: {
  items: EventCard[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="panel">
        <p className="muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="cardGrid">
      {items.map((item) => (
        <article className="card" key={item.id}>
          <img
            className="cardImage"
            src={item.primaryImageUrl ?? "https://placehold.co/600x600?text=Event"}
            alt={item.title}
          />
          <div className="cardBody">
            <div className="badgeRow">
              <span className="badge success">{eventStateLabel(item)}</span>
              <span className="badge">
                {registrationModeLabel(item.registrationMode)}
              </span>
            </div>

            <div className="cardSummary">
              <h2 className="cardTitle">{item.title}</h2>
              <p className="cardSellerLabel">진행자 {item.sellerDisplayName}</p>
            </div>

            <div className="cardMeta">
              <p className="muted">
                응모 {item.entryCount.toLocaleString("ko-KR")}명
              </p>
              <p className="muted">
                {new Date(item.startsAt).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(item.endsAt).toLocaleDateString("ko-KR")}
              </p>
            </div>

            <div className="cardFooter">
              <Link className="primaryButton" href={`/events/${item.id}`}>
                상세 보기
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
