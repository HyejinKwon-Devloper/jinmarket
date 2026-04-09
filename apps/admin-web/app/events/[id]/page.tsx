"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { EventDetail, EventEntryRecord } from "@jinmarket/shared";

import { eventRegistrationModeLabel, requestJson } from "../../../lib/api";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

function accountLabel(entry: EventEntryRecord) {
  if (
    entry.userThreadsUsername &&
    entry.userDisplayName &&
    entry.userThreadsUsername !== entry.userDisplayName
  ) {
    return `${entry.userThreadsUsername} (${entry.userDisplayName})`;
  }

  return entry.userThreadsUsername ?? entry.userDisplayName;
}

function eventStateLabel(item: EventDetail) {
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

function drawHref(item: EventDetail) {
  return item.registrationMode === "SHOP_ENTRY"
    ? `/random-game?eventId=${item.id}`
    : `/random-game?eventTitle=${encodeURIComponent(item.title)}`;
}

export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [item, setItem] = useState<EventDetail | null>(null);
  const [entries, setEntries] = useState<EventEntryRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const detailResponse = await requestJson<{ item: EventDetail }>(
          `/admin/events/${eventId}`,
        );
        const entriesResponse =
          detailResponse.item.registrationMode === "SHOP_ENTRY"
            ? await requestJson<{ items: EventEntryRecord[] }>(
                `/admin/events/${eventId}/entries`,
              )
            : { items: [] as EventEntryRecord[] };

        if (!cancelled) {
          setItem(detailResponse.item);
          setEntries(entriesResponse.items);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "이벤트 정보를 불러오지 못했습니다.",
          );
        }
      }
    }

    if (eventId) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (!item) {
    return <section className="panel">{message ?? "불러오는 중입니다..."}</section>;
  }

  const primaryImageUrl =
    item.images[0]?.imageUrl ?? "https://placehold.co/800x800?text=Event";
  const canRunShopEntryDraw =
    item.registrationMode === "SHOP_ENTRY" && entries.length > 0;

  return (
    <>
      <section className="detailGrid">
        <div className="panel gallery eventGallery">
          <img
            className="heroImage eventDetailHeroImage"
            src={primaryImageUrl}
            alt={item.title}
          />
          {item.images.length > 1 ? (
            <div className="thumbRow">
              {item.images.map((image) => (
                <img
                  key={image.providerPublicId}
                  className="thumb eventDetailThumb"
                  src={image.imageUrl}
                  alt={item.title}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="panel adminDetailPanel">
          <div className="badgeRow">
            <span className="badge">{eventStateLabel(item)}</span>
            <span className="badge">
              {eventRegistrationModeLabel(item.registrationMode)}
            </span>
          </div>
          <h1>{item.title}</h1>
          <p className="muted adminDetailDescription">{item.description}</p>

          <div className="adminRecordGrid">
            <div className="adminRecordItem">
              <span className="adminMetaLabel">진행자</span>
              <span>{item.sellerDisplayName}</span>
            </div>
            <div className="adminRecordItem">
              <span className="adminMetaLabel">응모 수</span>
              <span>{item.entryCount.toLocaleString("ko-KR")}명</span>
            </div>
            <div className="adminRecordItem adminRecordItemWide">
              <span className="adminMetaLabel">이벤트 기간</span>
              <span>
                {formatDateTime(item.startsAt)} ~ {formatDateTime(item.endsAt)}
              </span>
            </div>
          </div>

          <div className="actionRow adminDetailActions">
            <Link className="ghostButton" href="/events">
              이벤트 목록
            </Link>
            {item.registrationMode === "SHOP_ENTRY" ? (
              canRunShopEntryDraw ? (
                <Link className="primaryButton" href={drawHref(item)}>
                  응모자 리스트로 추첨 시작
                </Link>
              ) : (
                <button className="primaryButton" disabled type="button">
                  응모자가 있어야 추첨할 수 있어요
                </button>
              )
            ) : (
              <Link className="primaryButton" href={drawHref(item)}>
                직접 등록 리스트로 추첨 시작
              </Link>
            )}
          </div>

          <div className="message">
            {item.registrationMode === "SHOP_ENTRY"
              ? "구매자 사이트 이벤트 존에서 응모한 사용자 리스트를 그대로 랜덤 게임 참가자로 불러와요."
              : "직접 등록 이벤트는 랜덤 게임 설정 화면에서 참가자 이름을 수동으로 입력해 추첨해요."}
          </div>
          {message ? <div className="message">{message}</div> : null}
        </div>
      </section>

      {item.registrationMode === "SHOP_ENTRY" ? (
        <section className="panel" style={{ marginTop: 24 }}>
          <p className="eyebrow">Entries</p>
          <h2>구매자 사이트 응모자 목록</h2>
          {entries.length === 0 ? (
            <p className="muted">아직 응모한 구매자가 없습니다.</p>
          ) : (
            <div className="adminRecordList">
              {entries.map((entry, index) => (
                <article className="adminRecordCard" key={entry.id}>
                  <div className="adminRecordHeader">
                    <strong>{accountLabel(entry)}</strong>
                    <span className="badge">{index + 1}번째</span>
                  </div>
                  <div className="adminRecordGrid">
                    <div className="adminRecordItem">
                      <span className="adminMetaLabel">응모 시각</span>
                      <span>{formatDateTime(entry.enteredAt)}</span>
                    </div>
                    <div className="adminRecordItem">
                      <span className="adminMetaLabel">사용자 ID</span>
                      <span>{entry.userThreadsUsername ?? entry.userDisplayName}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
