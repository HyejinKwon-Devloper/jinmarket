"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MAX_EVENT_IMAGES } from "@jinmarket/shared";
import type {
  EventDetail,
  EventRegistrationMode,
  SellerAccessOverview,
  SessionUser,
} from "@jinmarket/shared";

import { ManagedSellerAccessStatusPanel } from "../../../components/ManagedSellerAccessStatusPanel";
import {
  eventRegistrationModeLabel,
  fetchCurrentUser,
  fetchSellerAccessOverview,
  hasSellerAccess,
  requestJson,
  uploadEventImages,
} from "../../../lib/api";

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const adjusted = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return adjusted.toISOString().slice(0, 16);
}

function getDefaultStartValue() {
  return toDateTimeLocalValue(new Date().toISOString());
}

function getDefaultEndValue() {
  return toDateTimeLocalValue(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  );
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

const registrationModeOptions: Array<{
  value: EventRegistrationMode;
  title: string;
  description: string;
}> = [
  {
    value: "MANUAL",
    title: "직접 등록",
    description:
      "현장 접수자나 별도 참가자 명단을 판매자가 직접 입력하고, 그 리스트로 랜덤 게임 추첨을 진행해요.",
  },
  {
    value: "SHOP_ENTRY",
    title: "구매자 사이트에서 응모받기",
    description:
      "이벤트 존에 노출해 구매자가 응모하기 버튼으로 참여하고, 모인 응모자 리스트로 추첨해요.",
  },
];

export default function NewEventPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null | undefined>(
    undefined,
  );
  const [sellerAccessOverview, setSellerAccessOverview] =
    useState<SellerAccessOverview | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [registrationMode, setRegistrationMode] =
    useState<EventRegistrationMode>("MANUAL");
  const [startsAt, setStartsAt] = useState(getDefaultStartValue());
  const [endsAt, setEndsAt] = useState(getDefaultEndValue());
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);

  const loadUser = useCallback(async (cancelledRef?: { current: boolean }) => {
    const user = await fetchCurrentUser();

    if (cancelledRef?.current) {
      return;
    }

    setCurrentUser(user);

    if (!user) {
      setSellerAccessOverview(null);
      setMessage("로그인한 판매자만 이벤트를 등록할 수 있어요.");
      return;
    }

    if (hasSellerAccess(user)) {
      setSellerAccessOverview({
        canSell: true,
        isAdmin: user.roles.includes("ADMIN"),
        latestRequest: null,
      });
      setMessage(null);
      return;
    }

    const overview = await fetchSellerAccessOverview();

    if (!cancelledRef?.current) {
      setSellerAccessOverview(overview);
      setMessage(null);
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };

    void loadUser(cancelledRef).catch(() => {
      if (!cancelledRef.current) {
        setCurrentUser(null);
        setMessage("로그인 상태를 확인하지 못했습니다.");
      }
    });

    return () => {
      cancelledRef.current = true;
    };
  }, [loadUser]);

  if (currentUser === undefined) {
    return <section className="panel">로그인 상태를 확인하는 중입니다...</section>;
  }

  if (!currentUser) {
    return (
      <section className="panel">
        <p className="eyebrow">Create Event</p>
        <h1>이벤트 등록</h1>
        <p className="muted">
          로그인한 판매자만 이벤트를 등록할 수 있습니다.
        </p>
        <div className="actionRow" style={{ marginTop: 18 }}>
          <button className="primaryButton" disabled type="button">
            이벤트 등록
          </button>
          <Link className="secondaryButton" href="/login?return_to=/events/new">
            로그인
          </Link>
        </div>
        {message ? <div className="message">{message}</div> : null}
      </section>
    );
  }

  if (!hasSellerAccess(currentUser) && !sellerAccessOverview?.canSell) {
    return (
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
    );
  }

  return (
    <>
      {message ? <div className="message">{message}</div> : null}
      <section className="panel">
        <p className="eyebrow">Create Event</p>
        <h1>이벤트 등록</h1>
        <p className="muted">
          대표 이미지를 포함해 최대 {MAX_EVENT_IMAGES}장까지 등록할 수 있어요.
          구매자 사이트 이벤트 존에는 첫 번째 이미지가 대표 카드로 노출됩니다.
        </p>

        <div className="field">
          <label>이벤트 명</label>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label>이벤트 내용</label>
          <textarea
            className="textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="field">
          <label>응모 방식</label>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
          >
            {registrationModeOptions.map((option) => {
              const isActive = option.value === registrationMode;

              return (
                <button
                  key={option.value}
                  type="button"
                  className="panel"
                  style={{
                    textAlign: "left",
                    borderColor: isActive
                      ? "rgba(255, 210, 0, 0.82)"
                      : undefined,
                    boxShadow: isActive
                      ? "0 20px 38px rgba(0, 31, 31, 0.16)"
                      : undefined,
                  }}
                  onClick={() => setRegistrationMode(option.value)}
                >
                  <p className="eyebrow">
                    {eventRegistrationModeLabel(option.value)}
                  </p>
                  <h2>{option.title}</h2>
                  <p className="muted">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>이벤트 시작 일시</label>
          <input
            className="input"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>

        <div className="field">
          <label>이벤트 종료 일시</label>
          <input
            className="input"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>

        <div className="field">
          <label>이벤트 이미지 업로드</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const nextFiles = Array.from(event.target.files ?? []).slice(
                0,
                MAX_EVENT_IMAGES,
              );
              if ((event.target.files?.length ?? 0) > MAX_EVENT_IMAGES) {
                setMessage(
                  `이미지는 최대 ${MAX_EVENT_IMAGES}장까지 업로드할 수 있습니다.`,
                );
              } else {
                setMessage(null);
              }
              setFiles(nextFiles);
            }}
          />
          <p className="muted">
            첫 번째 이미지가 대표 이미지로 사용되고, 상세 보기에서는 전체
            이미지가 캐러셀로 노출돼요.
          </p>
        </div>

        <div className="actionRow" style={{ marginTop: 18 }}>
          <button
            className="primaryButton"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setMessage(null);

              try {
                const user = await fetchCurrentUser();

                if (!user) {
                  throw new Error("로그인이 필요합니다.");
                }

                if (files.length === 0) {
                  throw new Error("이벤트 이미지를 1장 이상 선택해 주세요.");
                }

                const startsAtIso = toIsoDateTime(startsAt);
                const endsAtIso = toIsoDateTime(endsAt);

                if (!startsAtIso || !endsAtIso) {
                  throw new Error(
                    "이벤트 시작과 종료 일시를 모두 입력해 주세요.",
                  );
                }

                if (
                  new Date(endsAtIso).getTime() <=
                  new Date(startsAtIso).getTime()
                ) {
                  throw new Error(
                    "이벤트 종료 일시는 시작 일시보다 늦어야 합니다.",
                  );
                }

                const images = await uploadEventImages(files);
                const response = await requestJson<{ item: EventDetail }>(
                  "/admin/events",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      title,
                      description,
                      registrationMode,
                      startsAt: startsAtIso,
                      endsAt: endsAtIso,
                      images,
                    }),
                  },
                );

                router.push(`/events/${response.item.id}`);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "이벤트 등록에 실패했습니다.",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "등록 중..." : "이벤트 등록"}
          </button>
        </div>
      </section>
    </>
  );
}
