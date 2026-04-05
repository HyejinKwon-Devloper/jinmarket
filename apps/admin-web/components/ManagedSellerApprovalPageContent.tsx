"use client";

import { useEffect, useState } from "react";
import type { SellerAccessRequestRecord, SessionUser } from "@jinmarket/shared";

import { fetchCurrentUser, isApprovalAdmin, requestJson } from "../lib/api";

type AdminApprovalAuthStatus = {
  eligible: boolean;
  verified: boolean;
};

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
  const [items, setItems] = useState<SellerAccessRequestRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [requiresAdminPassword, setRequiresAdminPassword] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  async function loadRequests() {
    const response = await requestJson<{ items: SellerAccessRequestRecord[] }>("/admin/seller-access");
    setItems(response.items);
  }

  async function fetchApprovalAuthStatus() {
    return requestJson<AdminApprovalAuthStatus>("/admin/seller-access/auth");
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

        const authStatus = await fetchApprovalAuthStatus();

        if (cancelled) {
          return;
        }

        if (!authStatus.eligible) {
          setMessage("관리자 계정만 판매자 승인 목록을 관리할 수 있습니다.");
          return;
        }

        if (!authStatus.verified) {
          setRequiresAdminPassword(true);
          setMessage("판매자 승인 목록에 들어가려면 관리자 비밀번호를 확인해 주세요.");
          return;
        }

        await loadRequests();

        if (!cancelled) {
          setRequiresAdminPassword(false);
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

  if (currentUser === undefined) {
    return <section className="panel">권한을 확인하는 중입니다...</section>;
  }

  if (!currentUser || !isApprovalAdmin(currentUser)) {
    return <section className="panel">{message ?? "접근 권한이 없습니다."}</section>;
  }

  if (requiresAdminPassword) {
    return (
      <section className="panel">
        <p className="eyebrow">Seller Approval</p>
        <h1>관리자 비밀번호 확인</h1>
        <p className="muted">
          판매자 승인 목록은 관리자 로그인만으로는 열리지 않습니다. 관리자 비밀번호를 한 번 더 확인해 주세요.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            if (isVerifyingPassword) {
              return;
            }

            try {
              setIsVerifyingPassword(true);
              setMessage(null);
              await requestJson("/admin/seller-access/auth", {
                method: "POST",
                body: JSON.stringify({ password: adminPassword })
              });
              await loadRequests();
              setRequiresAdminPassword(false);
              setAdminPassword("");
              setMessage(null);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "관리자 비밀번호 확인에 실패했습니다.");
            } finally {
              setIsVerifyingPassword(false);
            }
          }}
        >
          <div className="field" style={{ marginTop: 18 }}>
            <label>관리자 비밀번호</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
          </div>
          <div className="actionRow" style={{ marginTop: 18 }}>
            <button className="primaryButton" disabled={isVerifyingPassword} type="submit">
              {isVerifyingPassword ? "확인 중..." : "비밀번호 확인"}
            </button>
          </div>
        </form>
        {message ? <div className="message">{message}</div> : null}
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">Seller Approval</p>
      <h1>판매자 승인 요청 목록</h1>
      <p className="muted">
        여기서 요청을 수락하면 해당 계정에 판매 권한이 추가되고, 이후 상품 등록과 판매 관리가 가능해집니다.
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

                      if (nextMessage.includes("비밀번호 확인이 필요")) {
                        setRequiresAdminPassword(true);
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
