"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type {
  SellerAccessRequestRecord,
  SellerApprovalAdminAuthStatus,
  SessionUser
} from "@jinmarket/shared";

import { ApiError, fetchCurrentUser, isApprovalAdmin, requestJson } from "../lib/api";

function applicantLabel(item: SellerAccessRequestRecord) {
  if (
    item.applicantThreadsUsername &&
    item.applicantDisplayName &&
    item.applicantThreadsUsername !== item.applicantDisplayName
  ) {
    return `${item.applicantThreadsUsername} (${item.applicantDisplayName})`;
  }

  return item.applicantThreadsUsername ?? item.applicantDisplayName;
}

export function ManagedSellerApprovalPageContent() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null | undefined>(undefined);
  const [authStatus, setAuthStatus] = useState<SellerApprovalAdminAuthStatus | null>(null);
  const [items, setItems] = useState<SellerAccessRequestRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [requiresAdminOtp, setRequiresAdminOtp] = useState(false);
  const [isSubmittingOtp, setIsSubmittingOtp] = useState(false);

  async function loadRequests() {
    const response = await requestJson<{ items: SellerAccessRequestRecord[] }>("/admin/seller-access");
    setItems(response.items);
  }

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
          setMessage("로그인이 필요합니다.");
          return;
        }

        if (!isApprovalAdmin(user)) {
          setMessage("관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.");
          return;
        }

        const nextAuthStatus = await fetchApprovalAuthStatus();

        if (cancelled) {
          return;
        }

        setAuthStatus(nextAuthStatus);

        if (!nextAuthStatus.eligible) {
          setMessage("관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.");
          return;
        }

        if (!nextAuthStatus.verified) {
          setRequiresAdminOtp(true);

          if (!nextAuthStatus.totpEnabled) {
            if (!cancelled) {
              setMessage("판매자 승인용 Google OTP가 아직 고정 등록되지 않았습니다. 운영자 등록 후 다시 시도해 주세요.");
            }

            return;
          }

          setMessage("판매자 승인 목록에 들어가려면 Google OTP 6자리 코드를 입력해 주세요.");
          return;
        }

        await loadRequests();

        if (!cancelled) {
          setRequiresAdminOtp(false);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "판매자 승인 목록을 불러오지 못했습니다.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingOtp || !authStatus?.totpEnabled) {
      return;
    }

    try {
      setIsSubmittingOtp(true);
      setMessage(null);
      const response = await requestJson<{ ok: true; message?: string }>("/admin/seller-access/auth", {
        method: "POST",
        body: JSON.stringify({ code: otpCode })
      });
      await loadRequests();
      setAuthStatus({ eligible: true, verified: true, totpEnabled: true });
      setRequiresAdminOtp(false);
      setOtpCode("");
      setMessage(response.message ?? null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Google OTP 확인에 실패했습니다."
      );
    } finally {
      setIsSubmittingOtp(false);
    }
  }

  if (currentUser === undefined) {
    return <section className="panel">권한을 확인하는 중입니다...</section>;
  }

  if (!currentUser || !isApprovalAdmin(currentUser)) {
    return <section className="panel">{message ?? "접근 권한이 없습니다."}</section>;
  }

  if (requiresAdminOtp) {
    return (
      <section className="panel">
        <p className="eyebrow">Seller Approval</p>
        <h1>Google OTP 확인</h1>
        <p className="muted">
          판매자 승인 목록은 관리자 로그인만으로 바로 열리지 않습니다. Google Authenticator 같은 OTP
          앱으로 관리자 2차 인증을 완료해 주세요.
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
          <p className="muted" style={{ marginTop: 18 }}>
            이 계정의 판매자 승인 OTP는 웹에서 새로 등록할 수 없습니다. 운영자가 미리 고정 등록한 뒤
            다시 시도해 주세요.
          </p>
        )}
        {message ? <div className="message">{message}</div> : null}
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">Seller Approval</p>
      <h1>판매자 승인 요청 목록</h1>
      <p className="muted">
        여기서 요청을 수락하면 해당 계정은 판매 권한을 얻고, 이후 상품 등록과 판매 관리를 시작할 수
        있습니다.
      </p>

      {message ? <div className="message">{message}</div> : null}
      {items.length === 0 ? <p className="muted">현재 대기 중인 승인 요청이 없습니다.</p> : null}

      {items.length > 0 ? (
        <div className="adminRecordList" style={{ marginTop: 18 }}>
          {items.map((item) => (
            <article className="adminRecordCard" key={item.id}>
              <div className="adminRecordHeader">
                <strong>{applicantLabel(item)}</strong>
                <span className="badge">승인 대기</span>
              </div>
              <div className="adminRecordGrid">
                <div className="adminRecordItem">
                  <span className="adminMetaLabel">요청 일시</span>
                  <span>{new Date(item.requestedAt).toLocaleString("ko-KR")}</span>
                </div>
              </div>
              <div className="adminRecordActions">
                <button
                  className="primaryButton"
                  disabled={approvingId === item.id}
                  onClick={async () => {
                    if (approvingId) {
                      return;
                    }

                    try {
                      setApprovingId(item.id);
                      const response = await requestJson<{ message: string }>(
                        `/admin/seller-access/${item.id}/approve`,
                        { method: "POST" }
                      );
                      setMessage(response.message);
                      await loadRequests();
                    } catch (error) {
                      const nextMessage =
                        error instanceof Error ? error.message : "판매자 승인에 실패했습니다.";

                      if (
                        error instanceof ApiError &&
                        (error.code === "SELLER_APPROVAL_TOTP_REQUIRED" ||
                          error.code === "SELLER_APPROVAL_TOTP_SETUP_REQUIRED")
                      ) {
                        const nextAuthStatus = await fetchApprovalAuthStatus().catch(() => null);
                        setAuthStatus(nextAuthStatus);
                        setRequiresAdminOtp(true);
                        setItems([]);
                      }

                      setMessage(nextMessage);
                    } finally {
                      setApprovingId(null);
                    }
                  }}
                >
                  {approvingId === item.id ? "승인 중..." : "승인 수락"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
