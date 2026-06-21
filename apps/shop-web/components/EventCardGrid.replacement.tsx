import Link from "next/link";
import type { EventCard } from "@jinmarket/shared";

import { getEventCardImageProps } from "../lib/image";

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
      {items.map((item, index) => {
        const image = getEventCardImageProps(item.primaryImageUrl);

        return (
          <article className="card eventCard" key={item.id}>
            <div className="eventCardImageWrap">
              <img
                alt={item.title}
                className="cardImage eventCardImage"
                decoding="async"
                fetchPriority={index < 2 ? "high" : "auto"}
                height={900}
                loading={index < 4 ? "eager" : "lazy"}
                sizes={image.sizes}
                src={image.src}
                srcSet={image.srcSet}
                width={720}
              />
              <div className="badgeRow eventCardOverlay">
                <span className="badge success">{eventStateLabel(item)}</span>
                <span className="badge">
                  {registrationModeLabel(item.registrationMode)}
                </span>
              </div>
            </div>

            <div className="cardBody">
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
        );
      })}
    </div>
  );
}
