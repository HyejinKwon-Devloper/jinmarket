"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { EventDetail, SessionUser } from "@jinmarket/shared";

import { ProductImageCarousel } from "../../../components/ProductImageCarousel";
import { fetchCurrentUser, requestJson } from "../../../lib/api";

function registrationModeLabel(value: EventDetail["registrationMode"]) {
  return value === "SHOP_ENTRY" ? "구매자 사이트 응모" : "직접 등록 이벤트";
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

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [item, setItem] = useState<EventDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginHref, setLoginHref] = useState("/login");
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);

  async function refreshEvent() {
    const refreshed = await requestJson<{ item: EventDetail }>(`/events/${eventId}`);
    setItem(refreshed.item);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLoginHref(`/login?return_to=${encodeURIComponent(window.location.href)}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [currentUser, detailResponse] = await Promise.all([
          fetchCurrentUser(),
          requestJson<{ item: EventDetail }>(`/events/${eventId}`),
        ]);

        if (!cancelled) {
          setUser(currentUser);
          setItem(detailResponse.item);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "이벤트 정보를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
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

  if (loading) {
    return <section className="panel">불러오는 중입니다...</section>;
  }

  if (!item) {
    return (
      <section className="panel">
        {message ?? "이벤트를 찾을 수 없습니다."}
      </section>
    );
  }

  const isShopEntryEvent = item.registrationMode === "SHOP_ENTRY";

  return (
    <section className="detailGrid">
      <div className="gallery eventGallery">
        <ProductImageCarousel
          title={item.title}
          images={item.images}
          fallbackUrl={item.primaryImageUrl}
        />
      </div>

      <div className="panel detailInfoPanel">
        <div className="badgeRow">
          <span className="badge success">{eventStateLabel(item)}</span>
          <span className="badge">{registrationModeLabel(item.registrationMode)}</span>
        </div>

        <div className="detailTextStack">
          <h1>{item.title}</h1>
          <p className="muted">진행자 {item.sellerDisplayName}</p>
          <p>{item.description}</p>
        </div>

        <div className="detailMetaCards">
          <div className="detailMetaCard">
            <span className="detailMetaLabel">이벤트 기간</span>
            <span>
              {new Date(item.startsAt).toLocaleString("ko-KR")} ~{" "}
              {new Date(item.endsAt).toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="detailMetaCard">
            <span className="detailMetaLabel">현재 응모 수</span>
            <span>{item.entryCount.toLocaleString("ko-KR")}명</span>
          </div>
        </div>

        {!user ? (
          <div className="message">
            로그인하면 응모 가능한 이벤트에 바로 참여할 수 있어요.
          </div>
        ) : null}

        {!isShopEntryEvent ? (
          <div className="message">
            이 이벤트는 판매자가 직접 참가자를 등록해 추첨하는 방식이에요.
          </div>
        ) : null}

        {isShopEntryEvent ? (
          <div className="actionRow" style={{ marginTop: 16 }}>
            {!user ? (
              <Link className="primaryButton" href={loginHref}>
                로그인 후 응모하기
              </Link>
            ) : item.hasEntered ? (
              <button className="primaryButton" disabled type="button">
                이미 응모 완료
              </button>
            ) : item.canEnter ? (
              <button
                className="primaryButton"
                disabled={isSubmittingEntry}
                onClick={async () => {
                  if (isSubmittingEntry) {
                    return;
                  }

                  setIsSubmittingEntry(true);
                  try {
                    const response = await requestJson<{ message: string }>(
                      `/events/${eventId}/entries`,
                      {
                        method: "POST",
                      },
                    );
                    setMessage(response.message);
                    await refreshEvent();
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "응모에 실패했습니다.",
                    );
                  } finally {
                    setIsSubmittingEntry(false);
                  }
                }}
              >
                {isSubmittingEntry ? "응모 중..." : "응모하기"}
              </button>
            ) : (
              <button className="primaryButton" disabled type="button">
                {eventStateLabel(item) === "오픈 예정"
                  ? "이벤트 시작 전"
                  : eventStateLabel(item) === "종료"
                    ? "이벤트 종료"
                    : "응모 불가"}
              </button>
            )}
            <Link className="ghostButton" href="/events">
              이벤트 존으로
            </Link>
          </div>
        ) : null}

        {message ? <div className="message">{message}</div> : null}
      </div>
    </section>
  );
}
