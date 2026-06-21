"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  PushApp,
  PushAudienceRole,
  PushAudienceSummary,
  PushRecipientRecord,
  SellerApprovalAdminAuthStatus,
  SessionUser,
} from "@jinmarket/shared";

import { ApiError, fetchCurrentUser, isApprovalAdmin, requestJson } from "../lib/api";

type PushAudienceSummaryResponse = {
  app: PushApp;
  items: PushAudienceSummary[];
};

type PushRecipientsResponse = {
  app: PushApp;
  roles: PushAudienceRole[];
  items: PushRecipientRecord[];
};

type PushSendResponse = {
  message: string;
  result: {
    requestedUsers: number;
    usersWithDelivery: number;
    usersWithoutSubscriptions: number;
    usersSkippedDueToConfig: number;
    attempted: number;
    delivered: number;
  };
};

const roleOrder: PushAudienceRole[] = ["ADMIN", "SELLER", "BUYER"];

const defaultRoleFilters: Record<PushApp, PushAudienceRole[]> = {
  ADMIN: ["ADMIN", "SELLER"],
  SHOP: ["BUYER"],
};

function getAppLabel(app: PushApp) {
  return app === "ADMIN" ? "판매자/관리자 앱" : "구매자 앱";
}

function getRoleLabel(role: PushAudienceRole) {
  switch (role) {
    case "ADMIN":
      return "관리자";
    case "SELLER":
      return "판매자";
    case "BUYER":
      return "구매자";
    default:
      return role;
  }
}

function formatLastSeen(value: string | null) {
  if (!value) {
    return "기록 없음";
  }

  return new Date(value).toLocaleString("ko-KR");
}

function buildRecipientQuery(app: PushApp, roles: PushAudienceRole[], search: string) {
  const params = new URLSearchParams({ app, limit: "120" });

  if (roles.length > 0) {
    params.set("roles", roles.join(","));
  }

  if (search.trim()) {
    params.set("search", search.trim());
  }

  return params.toString();
}

function buildPreset(app: PushApp, preset: "sold" | "offer") {
  if (preset === "offer") {
    return app === "ADMIN"
      ? {
          title: "새 가격 제안이 도착했어요",
          body: "상품에 새 가격 제안이 도착했습니다. 판매자 센터에서 바로 확인해 주세요.",
          url: "/products",
          tag: "manual-price-offer",
        }
      : {
          title: "가격 제안 상태가 바뀌었어요",
          body: "구매 중인 상품과 관련된 가격 제안 상태가 업데이트되었습니다.",
          url: "/my/orders",
          tag: "manual-price-offer",
        };
  }

  return app === "ADMIN"
    ? {
        title: "상품이 판매되었어요",
        body: "새 주문이 생성되었습니다. 주문 목록에서 구매자와 진행 상태를 확인해 주세요.",
        url: "/orders",
        tag: "manual-product-sold",
      }
    : {
        title: "주문 상태를 확인해 주세요",
        body: "주문과 관련된 새 알림이 도착했습니다. 앱에서 주문 상태를 확인해 주세요.",
        url: "/my/orders",
        tag: "manual-product-sold",
      };
}

function isApprovalOtpError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === "SELLER_APPROVAL_TOTP_REQUIRED" ||
      error.code === "SELLER_APPROVAL_TOTP_SETUP_REQUIRED")
  );
}

export function ManagedPushNotificationsPageContentV2() {
  const initialPreset = buildPreset("ADMIN", "sold");
  const [currentUser, setCurrentUser] = useState<SessionUser | null | undefined>(undefined);
  const [authStatus, setAuthStatus] = useState<SellerApprovalAdminAuthStatus | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [requiresAdminOtp, setRequiresAdminOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [isSubmittingOtp, setIsSubmittingOtp] = useState(false);
  const [selectedApp, setSelectedApp] = useState<PushApp>("ADMIN");
  const [selectedRoles, setSelectedRoles] = useState<PushAudienceRole[]>(defaultRoleFilters.ADMIN);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [summaries, setSummaries] = useState<PushAudienceSummary[]>([]);
  const [recipients, setRecipients] = useState<PushRecipientRecord[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [title, setTitle] = useState(initialPreset.title);
  const [body, setBody] = useState(initialPreset.body);
  const [url, setUrl] = useState(initialPreset.url);
  const [tag, setTag] = useState(initialPreset.tag);
  const [requireInteraction, setRequireInteraction] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  async function fetchApprovalAuthStatus() {
    return requestJson<SellerApprovalAdminAuthStatus>("/admin/seller-access/auth");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const user = await fetchCurrentUser();

        if (cancelled) {
          return;
        }

        setCurrentUser(user);

        if (!user) {
          setPageMessage("로그인이 필요합니다.");
          return;
        }

        if (!isApprovalAdmin(user)) {
          setPageMessage("관리자 계정만 푸시 알림을 발송하고 관리할 수 있습니다.");
          return;
        }

        const nextAuthStatus = await fetchApprovalAuthStatus();

        if (cancelled) {
          return;
        }

        setAuthStatus(nextAuthStatus);

        if (!nextAuthStatus.eligible) {
          setPageMessage("관리자 계정만 푸시 알림을 발송하고 관리할 수 있습니다.");
          return;
        }

        if (!nextAuthStatus.verified) {
          setRequiresAdminOtp(true);

          if (!nextAuthStatus.totpEnabled) {
            setPageMessage(
              "판매자 승인용 Google OTP가 아직 고정 등록되지 않았습니다. 운영자 등록 후 다시 시도해 주세요.",
            );
            return;
          }

          setPageMessage("푸시 관리 화면에 들어가려면 Google OTP 6자리 코드를 입력해 주세요.");
          return;
        }

        setRequiresAdminOtp(false);
        setPageMessage(null);
      } catch (error) {
        if (!cancelled) {
          setPageMessage(error instanceof Error ? error.message : "푸시 관리 화면을 불러오지 못했습니다.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      currentUser === undefined ||
      !currentUser ||
      !isApprovalAdmin(currentUser) ||
      requiresAdminOtp ||
      !authStatus?.verified
    ) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      setIsLoadingData(true);

      try {
        const queryString = buildRecipientQuery(selectedApp, selectedRoles, searchTerm);
        const [summaryResponse, recipientsResponse] = await Promise.all([
          requestJson<PushAudienceSummaryResponse>(`/admin/push/audiences?app=${selectedApp}`),
          requestJson<PushRecipientsResponse>(`/admin/push/recipients?${queryString}`),
        ]);

        if (cancelled) {
          return;
        }

        setSummaries(summaryResponse.items);
        setRecipients(recipientsResponse.items);
        setSelectedUserIds((current) => {
          const nextIds = new Set(recipientsResponse.items.map((item) => item.userId));
          return current.filter((userId) => nextIds.has(userId));
        });
        setPageMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isApprovalOtpError(error)) {
          const nextAuthStatus = await fetchApprovalAuthStatus().catch(() => null);
          setAuthStatus(nextAuthStatus);
          setRequiresAdminOtp(true);
          setRecipients([]);
          setSummaries([]);
          setSelectedUserIds([]);
        }

        setPageMessage(error instanceof Error ? error.message : "푸시 대상 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [authStatus?.verified, currentUser, requiresAdminOtp, searchTerm, selectedApp, selectedRoles]);

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingOtp || !authStatus?.totpEnabled) {
      return;
    }

    try {
      setIsSubmittingOtp(true);
      setPageMessage(null);
      const response = await requestJson<{ ok: true; message?: string }>("/admin/seller-access/auth", {
        method: "POST",
        body: JSON.stringify({ code: otpCode }),
      });
      setAuthStatus({ eligible: true, verified: true, totpEnabled: true });
      setRequiresAdminOtp(false);
      setOtpCode("");
      setPageMessage(response.message ?? null);
    } catch (error) {
      setPageMessage(error instanceof Error ? error.message : "Google OTP 확인에 실패했습니다.");
    } finally {
      setIsSubmittingOtp(false);
    }
  }

  function toggleRole(role: PushAudienceRole) {
    setSelectedUserIds([]);
    setSelectedRoles((current) => {
      const next = current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role];

      return [...next].sort((left, right) => roleOrder.indexOf(left) - roleOrder.indexOf(right));
    });
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  function applyPreset(preset: "sold" | "offer") {
    const nextPreset = buildPreset(selectedApp, preset);
    setTitle(nextPreset.title);
    setBody(nextPreset.body);
    setUrl(nextPreset.url);
    setTag(nextPreset.tag);
    setSendMessage(null);
  }

  if (currentUser === undefined) {
    return <section className="panel">권한을 확인하는 중입니다...</section>;
  }

  if (!currentUser || !isApprovalAdmin(currentUser)) {
    return <section className="panel">{pageMessage ?? "접근 권한이 없습니다."}</section>;
  }

  if (requiresAdminOtp) {
    return (
      <section className="panel">
        <p className="eyebrow">Push Manager</p>
        <h1>Google OTP 확인</h1>
        <p className="muted">
          푸시 발송 화면은 관리자 로그인만으로 바로 열리지 않습니다. Google Authenticator 같은 OTP 앱의
          6자리 코드를 한 번 더 확인해 주세요.
        </p>

        {authStatus?.totpEnabled ? (
          <form onSubmit={(event) => void handleOtpSubmit(event)}>
            <div className="field" style={{ marginTop: 18 }}>
              <label>현재 Google OTP 6자리 코드</label>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
              />
            </div>
            <div className="actionRow" style={{ marginTop: 18 }}>
              <button className="primaryButton" disabled={isSubmittingOtp} type="submit">
                {isSubmittingOtp ? "확인 중..." : "Google OTP 확인"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 18 }}>
            이 계정의 푸시 발송용 관리자 OTP는 웹에서 새로 등록할 수 없습니다. 운영자가 미리 고정 등록한 뒤
            다시 시도해 주세요.
          </p>
            <p className="muted" style={{ marginTop: 12 }}>
              OTP provisioning: <code>npx tsx scripts/provision-seller-approval-totp.ts --login-id your-admin-login-id</code>
            </p>
          </>
        )}

        {pageMessage ? <div className="message">{pageMessage}</div> : null}
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="panel">
        <p className="eyebrow">Push Manager</p>
        <h1>운영 푸시 발송</h1>
        <p className="muted">
          상품 판매 알림은 자동 푸시로도 연결되지만, 여기서는 운영 공지나 재알림을 관리자 승인 흐름 아래에서
          직접 발송할 수 있습니다.
        </p>

        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            marginTop: 18,
          }}
        >
          <div className="field" style={{ marginTop: 0 }}>
            <label>대상 앱</label>
            <select
              className="select"
              value={selectedApp}
              onChange={(event) => {
                const nextApp = event.target.value as PushApp;
                const nextPreset = buildPreset(nextApp, "sold");
                setSelectedApp(nextApp);
                setSelectedRoles(defaultRoleFilters[nextApp]);
                setSelectedUserIds([]);
                setTitle(nextPreset.title);
                setBody(nextPreset.body);
                setUrl(nextPreset.url);
                setTag(nextPreset.tag);
                setSendMessage(null);
              }}
            >
              <option value="ADMIN">판매자/관리자 앱</option>
              <option value="SHOP">구매자 앱</option>
            </select>
          </div>

          <div className="field" style={{ marginTop: 0 }}>
            <label>빠른 프리셋</label>
            <div className="actionRow">
              <button className="secondaryButton" type="button" onClick={() => applyPreset("sold")}>
                상품 판매 알림 채우기
              </button>
              <button className="ghostButton" type="button" onClick={() => applyPreset("offer")}>
                가격 제안 알림 채우기
              </button>
            </div>
          </div>
        </div>

        <div className="badgeRow" style={{ marginTop: 18 }}>
          {summaries.map((summary) => (
            <span className="badge" key={summary.role}>
              {getRoleLabel(summary.role)} {summary.subscribedUsers}/{summary.totalUsers}
            </span>
          ))}
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label>받는 사용자 역할</label>
          <div className="actionRow">
            {roleOrder.map((role) => (
              <button
                className={selectedRoles.includes(role) ? "primaryButton" : "secondaryButton"}
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
              >
                {getRoleLabel(role)}
              </button>
            ))}
          </div>
          <p className="muted">
            현재 앱은 {getAppLabel(selectedApp)}입니다. 역할을 모두 해제하면 이 앱에서 푸시를 허용한 전체 사용자를
            보여줍니다.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearchTerm(searchInput);
            setSelectedUserIds([]);
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "minmax(0, 1fr) auto auto",
              marginTop: 18,
            }}
          >
            <input
              className="input"
              placeholder="이름, 로그인 아이디, 이메일로 검색"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button className="secondaryButton" type="submit">
              검색
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchTerm("");
                setSelectedUserIds([]);
              }}
            >
              초기화
            </button>
          </div>
        </form>

        <div className="actionRow" style={{ marginTop: 18 }}>
          <button
            className="secondaryButton"
            type="button"
            disabled={recipients.length === 0}
            onClick={() => setSelectedUserIds(recipients.map((item) => item.userId))}
          >
            현재 목록 전체 선택
          </button>
          <button
            className="ghostButton"
            type="button"
            disabled={selectedUserIds.length === 0}
            onClick={() => setSelectedUserIds([])}
          >
            선택 해제
          </button>
          <span className="badge">
            선택 {selectedUserIds.length}명 / 표시 {recipients.length}명
          </span>
        </div>

        {pageMessage ? <div className="message">{pageMessage}</div> : null}
        {isLoadingData ? <div className="message">푸시 대상 목록을 불러오는 중입니다...</div> : null}
        {!isLoadingData && recipients.length === 0 ? (
          <div className="message">
            현재 조건에 맞는 수신자가 없습니다. 아직 해당 앱에서 푸시를 허용하지 않았거나 검색 조건에 맞는 사용자가
            없을 수 있습니다.
          </div>
        ) : null}

        {recipients.length > 0 ? (
          <div className="adminRecordList" style={{ marginTop: 18 }}>
            {recipients.map((recipient) => {
              const isSelected = selectedUserIdSet.has(recipient.userId);
              const metaParts = [recipient.loginId, recipient.email].filter(Boolean);

              return (
                <article
                  className="adminRecordCard"
                  key={recipient.userId}
                  style={{
                    borderColor: isSelected ? "rgba(31, 78, 121, 0.28)" : undefined,
                    boxShadow: isSelected ? "0 18px 36px rgba(15, 23, 42, 0.08)" : undefined,
                  }}
                >
                  <div className="adminRecordHeader">
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 12,
                        cursor: "pointer",
                      }}
                    >
                      <input checked={isSelected} type="checkbox" onChange={() => toggleUser(recipient.userId)} />
                      <strong>{recipient.displayName}</strong>
                    </label>
                    <span className="badge">{recipient.subscriptionCount}개 기기</span>
                  </div>

                  {metaParts.length > 0 ? <p className="muted">{metaParts.join(" · ")}</p> : null}

                  <div className="adminRecordGrid">
                    <div className="adminRecordItem">
                      <span className="adminMetaLabel">역할</span>
                      <span>{recipient.roles.map(getRoleLabel).join(", ") || "역할 없음"}</span>
                    </div>
                    <div className="adminRecordItem">
                      <span className="adminMetaLabel">최근 구독 확인</span>
                      <span>{formatLastSeen(recipient.lastSeenAt)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <p className="eyebrow">Composer</p>
        <h2>푸시 내용 작성</h2>
        <p className="muted">
          {getAppLabel(selectedApp)}으로 발송됩니다. 경로는 상대 경로(`/orders`)나 전체 URL 둘 다 사용할 수
          있습니다.
        </p>

        <form
          onSubmit={async (event) => {
            event.preventDefault();

            if (isSending) {
              return;
            }

            if (selectedUserIds.length === 0) {
              setSendMessage("받는 사용자를 1명 이상 선택해 주세요.");
              return;
            }

            try {
              setIsSending(true);
              setSendMessage(null);
              const response = await requestJson<PushSendResponse>("/admin/push/send", {
                method: "POST",
                body: JSON.stringify({
                  app: selectedApp,
                  userIds: selectedUserIds,
                  title,
                  body,
                  url,
                  tag: tag.trim() || undefined,
                  requireInteraction,
                }),
              });
              setSendMessage(
                `${response.message} 선택 ${response.result.requestedUsers}명, 전달 사용자 ${response.result.usersWithDelivery}명, 전달 건수 ${response.result.delivered}건`,
              );
            } catch (error) {
              if (isApprovalOtpError(error)) {
                const nextAuthStatus = await fetchApprovalAuthStatus().catch(() => null);
                setAuthStatus(nextAuthStatus);
                setRequiresAdminOtp(true);
                setRecipients([]);
                setSummaries([]);
                setSelectedUserIds([]);
              }

              setSendMessage(error instanceof Error ? error.message : "푸시 알림 발송에 실패했습니다.");
            } finally {
              setIsSending(false);
            }
          }}
        >
          <div className="field" style={{ marginTop: 18 }}>
            <label>알림 제목</label>
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="field">
            <label>알림 내용</label>
            <textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} />
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div className="field">
              <label>클릭 이동 경로</label>
              <input className="input" value={url} onChange={(event) => setUrl(event.target.value)} />
            </div>
            <div className="field">
              <label>알림 태그</label>
              <input className="input" value={tag} onChange={(event) => setTag(event.target.value)} />
            </div>
          </div>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              marginTop: 18,
              cursor: "pointer",
            }}
          >
            <input
              checked={requireInteraction}
              type="checkbox"
              onChange={(event) => setRequireInteraction(event.target.checked)}
            />
            <span>사용자가 닫기 전까지 알림을 더 오래 유지</span>
          </label>

          <div className="actionRow" style={{ marginTop: 18 }}>
            <button className="primaryButton" disabled={isSending} type="submit">
              {isSending ? "발송 중..." : `${selectedUserIds.length}명에게 푸시 보내기`}
            </button>
          </div>
        </form>

        {sendMessage ? <div className="message">{sendMessage}</div> : null}
      </section>
    </div>
  );
}
