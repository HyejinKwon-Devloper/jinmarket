"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MAX_EVENT_IMAGES } from "@jinmarket/shared";
import type {
  EventDetail,
  EventRegistrationMode,
  SellerAccessOverview,
  SessionUser,
} from "@jinmarket/shared";

import { ManagedSellerAccessStatusPanel } from "../../../../components/ManagedSellerAccessStatusPanel";
import {
  eventRegistrationModeLabel,
  fetchCurrentUser,
  fetchSellerAccessOverview,
  hasSellerAccess,
  requestJson,
  uploadEventImages,
} from "../../../../lib/api";

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const adjusted = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return adjusted.toISOString().slice(0, 16);
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
    title: "구매자 사이트에서 응모 받기",
    description:
      "이벤트 존에 노출된 구매자가 응모하기 버튼으로 참여하고, 모인 응모자 리스트로 추첨해요.",
  },
];

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [currentUser, setCurrentUser] = useState<SessionUser | null | undefined>(
    undefined,
  );
  const [sellerAccessOverview, setSellerAccessOverview] =
    useState<SellerAccessOverview | null>(null);
  const [item, setItem] = useState<EventDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [registrationMode, setRegistrationMode] =
    useState<EventRegistrationMode>("MANUAL");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [replacementFiles, setReplacementFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);

  const loadUserAndEvent = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      const user = await fetchCurrentUser();

      if (cancelledRef?.current) {
        return;
      }

      setCurrentUser(user);

      if (!user) {
        setSellerAccessOverview(null);
        setMessage("로그인한 판매자만 이벤트를 수정할 수 있습니다.");
        return;
      }

      if (!hasSellerAccess(user)) {
        const overview = await fetchSellerAccessOverview();

        if (!cancelledRef?.current) {
          setSellerAccessOverview(overview);
          setMessage(null);
        }
        return;
      }

      setSellerAccessOverview({
        canSell: true,
        isAdmin: user.roles.includes("ADMIN"),
        latestRequest: null,
      });

      const response = await requestJson<{ item: EventDetail }>(
        `/admin/events/${eventId}`,
      );

      if (cancelledRef?.current) {
        return;
      }

      setItem(response.item);
      setTitle(response.item.title);
      setDescription(response.item.description);
      setRegistrationMode(response.item.registrationMode);
      setStartsAt(toDateTimeLocalValue(response.item.startsAt));
      setEndsAt(toDateTimeLocalValue(response.item.endsAt));
      setMessage(null);
    },
    [eventId],
  );

  useEffect(() => {
    const cancelledRef = { current: false };

    void loadUserAndEvent(cancelledRef)
      .catch((error) => {
        if (!cancelledRef.current) {
          setMessage(
            error instanceof Error
              ? error.message
              : "이벤트 정보를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelledRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [loadUserAndEvent]);

  useEffect(() => {
    const urls = replacementFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [replacementFiles]);

  if (loading || currentUser === undefined) {
    return <section className="panel">불러오는 중입니다...</section>;
  }

  if (!currentUser) {
    return (
      <section className="panel">
        <p className="eyebrow">Edit Event</p>
        <h1>이벤트 수정</h1>
        <p className="muted">
          로그인한 판매자만 이벤트를 수정할 수 있습니다.
        </p>
        <div className="actionRow" style={{ marginTop: 18 }}>
          <button className="primaryButton" disabled type="button">
            이벤트 수정
          </button>
          <Link
            className="secondaryButton"
            href={`/login?return_to=/events/${eventId}/edit`}
          >
            로그인
          </Link>
        </div>
        {message ? (
          <div className="message" role="status" aria-live="polite">
            {message}
          </div>
        ) : null}
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

  if (!item) {
    return <section className="panel">{message ?? "이벤트를 찾을 수 없습니다."}</section>;
  }

  return (
    <section className="panel">
      <p className="eyebrow">Edit Event</p>
      <h1>이벤트 수정</h1>
      <p className="muted">
        제목, 설명, 진행 기간, 응모 방식, 이미지를 함께 수정할 수 있습니다.
        새 이미지를 저장하면 기존 이미지는 모두 교체되고 첫 번째 이미지가
        대표 이미지가 됩니다.
      </p>

      <div className="field" style={{ marginTop: 20 }}>
        <label>현재 등록된 이미지</label>
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
      </div>

      <div className="field">
        <label htmlFor="event-images">이미지 교체</label>
        <input
          id="event-images"
          className="input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? []).slice(
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

            setReplacementFiles(selectedFiles);
          }}
        />
        <p className="muted">최대 {MAX_EVENT_IMAGES}장까지 업로드할 수 있습니다.</p>
      </div>

      {previewUrls.length > 0 ? (
        <div className="field">
          <label>새로 교체될 이미지 미리보기</label>
          <div className="thumbRow">
            {previewUrls.map((url, index) => (
              <img
                key={url}
                className="thumb eventDetailThumb"
                src={url}
                alt={`새 이벤트 이미지 ${index + 1}`}
              />
            ))}
          </div>
          <div className="actionRow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="ghostButton"
              onClick={() => {
                setReplacementFiles([]);
                setMessage(null);
              }}
            >
              새 이미지 선택 취소
            </button>
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="event-title">이벤트명</label>
        <input
          id="event-title"
          className="input"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="event-description">이벤트 설명</label>
        <textarea
          id="event-description"
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
                aria-pressed={isActive}
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
        <label htmlFor="event-starts-at">이벤트 시작 일시</label>
        <input
          id="event-starts-at"
          className="input"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="event-ends-at">이벤트 종료 일시</label>
        <input
          id="event-ends-at"
          className="input"
          type="datetime-local"
          required
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
      </div>

      <div className="actionRow" style={{ marginTop: 20 }}>
        <button
          className="primaryButton"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setMessage(null);

            try {
              const startsAtIso = toIsoDateTime(startsAt);
              const endsAtIso = toIsoDateTime(endsAt);

              if (!startsAtIso || !endsAtIso) {
                throw new Error("이벤트 시작과 종료 일시를 모두 입력해 주세요.");
              }

              if (
                new Date(endsAtIso).getTime() <=
                new Date(startsAtIso).getTime()
              ) {
                throw new Error(
                  "이벤트 종료 일시는 시작 일시보다 뒤여야 합니다.",
                );
              }

              const payload: {
                title: string;
                description: string;
                registrationMode: EventRegistrationMode;
                startsAt: string;
                endsAt: string;
                images?: EventDetail["images"];
              } = {
                title,
                description,
                registrationMode,
                startsAt: startsAtIso,
                endsAt: endsAtIso,
              };

              if (replacementFiles.length > MAX_EVENT_IMAGES) {
                throw new Error(
                  `이미지는 최대 ${MAX_EVENT_IMAGES}장까지 업로드할 수 있습니다.`,
                );
              }

              if (replacementFiles.length > 0) {
                payload.images = await uploadEventImages(replacementFiles);
              }

              const response = await requestJson<{ item: EventDetail }>(
                `/admin/events/${eventId}`,
                {
                  method: "PATCH",
                  body: JSON.stringify(payload),
                },
              );

              setItem(response.item);
              setReplacementFiles([]);
              setMessage("이벤트 정보가 저장되었습니다.");
              router.push(`/events/${response.item.id}`);
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "이벤트 수정에 실패했습니다.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "저장 중..." : "수정 저장"}
        </button>

        <Link className="ghostButton" href={`/events/${eventId}`}>
          상세로 돌아가기
        </Link>
      </div>

      {message ? (
        <div className="message" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
    </section>
  );
}
