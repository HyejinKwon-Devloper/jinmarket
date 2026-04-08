"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  EventCard,
  SellerAccessOverview,
  SessionUser,
} from "@jinmarket/shared";

import { ManagedSellerAccessStatusPanel } from "../../components/ManagedSellerAccessStatusPanel";
import {
  eventRegistrationModeLabel,
  fetchCurrentUser,
  fetchSellerAccessOverview,
  hasSellerAccess,
  requestJson,
} from "../../lib/api";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventWindowLabel(item: EventCard) {
  return `${formatDateTime(item.startsAt)} ~ ${formatDateTime(item.endsAt)}`;
}

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

function drawHref(item: EventCard) {
  return item.registrationMode === "SHOP_ENTRY"
    ? `/random-game?eventId=${item.id}`
    : `/random-game?eventTitle=${encodeURIComponent(item.title)}`;
}

export default function AdminEventsPage() {
  const [items, setItems] = useState<EventCard[]>([]);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [sellerAccessOverview, setSellerAccessOverview] =
    useState<SellerAccessOverview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestingApproval, setRequestingApproval] = useState(false);

  const load = useCallback(async (cancelledRef?: { current: boolean }) => {
    function isCancelled() {
      return cancelledRef?.current === true;
    }

    const user = await fetchCurrentUser();

    if (isCancelled()) {
      return;
    }

    setCurrentUser(user);

    if (!user) {
      setSellerAccessOverview(null);
      setItems([]);
      setMessage("로그인이 필요합니다.");
      return;
    }

    if (hasSellerAccess(user)) {
      const response = await requestJson<{ items: EventCard[] }>("/admin/events");

      if (!isCancelled()) {
        setItems(response.items);
        setSellerAccessOverview({
          canSell: true,
          isAdmin: user.roles.includes("ADMIN"),
          latestRequest: null,
        });
        setMessage(null);
      }
      return;
    }

    const overview = await fetchSellerAccessOverview();

    if (!isCancelled()) {
      setSellerAccessOverview(overview);
      setItems([]);
      setMessage(null);
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };

    void load(cancelledRef).catch((error) => {
      if (!cancelledRef.current) {
        setMessage(
          error instanceof Error
            ? error.message
            : "이벤트 목록을 불러오지 못했습니다.",
        );
      }
    });

    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const canManageEvents =
    hasSellerAccess(currentUser) || sellerAccessOverview?.canSell;
  const activeCount = useMemo(
    () => items.filter((item) => eventStateLabel(item) === "진행중").length,
    [items],
  );
  const shopEntryCount = useMemo(
    () => items.filter((item) => item.registrationMode === "SHOP_ENTRY").length,
    [items],
  );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Events</p>
        <h1>이벤트 등록부터 응모자 추첨 진입까지 한 화면에서 관리해요.</h1>
        <p className="muted" style={{ marginTop: 12 }}>
          구매자 사이트 응모형 이벤트와 현장 수동 등록 이벤트를 모두 운영할 수
          있어요. 상세 화면에서는 응모자 리스트 확인과 랜덤 게임 진입도 바로
          이어집니다.
        </p>
        <div className="actionRow" style={{ marginTop: 16 }}>
          {canManageEvents ? (
            <Link className="primaryButton" href="/events/new">
              새 이벤트 등록
            </Link>
          ) : currentUser ? (
            <button className="primaryButton" disabled type="button">
              새 이벤트 등록
            </button>
          ) : (
            <>
              <button className="primaryButton" disabled type="button">
                새 이벤트 등록
              </button>
              <Link
                className="secondaryButton"
                href="/login?return_to=/events/new"
              >
                로그인
              </Link>
            </>
          )}
        </div>
        {message ? <div className="message">{message}</div> : null}
      </section>

      {currentUser && !canManageEvents ? (
        <ManagedSellerAccessStatusPanel
          overview={sellerAccessOverview}
          requesting={requestingApproval}
          onRequest={async () => {
            if (requestingApproval) {
              return;
            }

            try {
              setRequestingApproval(true);
              const response = await requestJson<{
                item: NonNullable<SellerAccessOverview["latestRequest"]>;
                message: string;
              }>("/admin/seller-access/me/request", { method: "POST" });
              setSellerAccessOverview((previous) => ({
                canSell: false,
                isAdmin: previous?.isAdmin ?? false,
                latestRequest: response.item,
              }));
              setMessage(response.message);
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "판매자 승인 요청에 실패했습니다.",
              );
            } finally {
              setRequestingApproval(false);
            }
          }}
        />
      ) : null}

      <section className="panel adminListPanel">
        <div className="sectionHeader adminListHeader">
          <div>
            <p className="eyebrow">Event Inventory</p>
            <h2>이벤트 목록</h2>
          </div>
          <p className="sectionMeta">
            전체 {items.length}건, 진행중 {activeCount}건, 구매자 응모형{" "}
            {shopEntryCount}건
          </p>
        </div>

        {!canManageEvents ? (
          <p className="muted">
            판매자 승인이 완료되면 이벤트도 직접 등록하고 추첨까지 운영할 수
            있어요.
          </p>
        ) : items.length === 0 ? (
          <p className="muted">
            아직 등록된 이벤트가 없어요. 첫 이벤트를 등록해 보세요.
          </p>
        ) : (
          <div className="adminProductList">
            {items.map((item) => (
              <article className="adminProductRow" key={item.id}>
                <div className="adminProductSummary">
                  <img
                    className="adminProductThumb"
                    src={
                      item.primaryImageUrl ??
                      "https://placehold.co/240x240?text=Event"
                    }
                    alt={item.title}
                  />
                  <div className="adminProductInfo">
                    <div className="badgeRow adminTableBadges">
                      <span className="badge">{eventStateLabel(item)}</span>
                      <span className="badge">
                        {eventRegistrationModeLabel(item.registrationMode)}
                      </span>
                    </div>
                    <Link className="adminListTitle" href={`/events/${item.id}`}>
                      {item.title}
                    </Link>
                    <p className="adminListDescription">{item.description}</p>
                  </div>
                </div>

                <div className="adminMetaGrid">
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">진행 기간</span>
                    <span>{eventWindowLabel(item)}</span>
                  </div>
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">응모 수</span>
                    <span>{item.entryCount.toLocaleString("ko-KR")}명</span>
                  </div>
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">등록 방식</span>
                    <span>{eventRegistrationModeLabel(item.registrationMode)}</span>
                  </div>
                  <div className="adminMetaItem">
                    <span className="adminMetaLabel">등록일</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>

                <div className="adminTableActions adminMetaActions">
                  <Link className="secondaryButton" href={`/events/${item.id}`}>
                    상세 관리
                  </Link>
                  <Link className="ghostButton" href={drawHref(item)}>
                    추첨 시작
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
