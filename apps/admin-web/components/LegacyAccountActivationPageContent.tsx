"use client";

import { useEffect, useState } from "react";

import { requestJson } from "../lib/api";

type ActivationResponse = {
  message: string;
  ok?: boolean;
};

export function LegacyAccountActivationPageContent() {
  const [token, setToken] = useState("");
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function handleRequestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);
      const response = await requestJson<ActivationResponse>("/auth/legacy-activate/request-code", {
        method: "POST",
        body: JSON.stringify({
          loginId,
          email,
          ...(token ? { token } : {})
        })
      });

      setCodeRequested(true);
      setMessage(response.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "계정 전환 인증번호 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setMessage("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      setSubmitting(true);
      setMessage(null);
      const response = await requestJson<ActivationResponse>("/auth/legacy-activate/verify", {
        method: "POST",
        body: JSON.stringify({
          loginId,
          email,
          code,
          newPassword,
          ...(token ? { token } : {})
        })
      });

      setMessage(response.message);
      window.location.href = "/products";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "계정 전환 확인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="loginCard">
      <p className="eyebrow">Legacy Seller</p>
      <h1>기존 Threads 판매자 계정 전환</h1>
      <p className="muted">
        예전 Threads 로그인 계정을 판매자 사이트용 아이디, 이메일, 비밀번호 계정으로 전환하는 페이지입니다.
      </p>

      <form onSubmit={handleRequestCode} style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <div className="field">
          <label htmlFor="legacy-login-id">Threads 아이디</label>
          <input
            id="legacy-login-id"
            className="input"
            type="text"
            autoComplete="username"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="@ 없이 입력"
          />
        </div>
        <div className="field">
          <label htmlFor="legacy-email">이메일</label>
          <input
            id="legacy-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="actionRow">
          <button className="secondaryButton" type="submit" disabled={submitting}>
            {submitting ? "전송 중..." : codeRequested ? "인증번호 다시 보내기" : "인증번호 보내기"}
          </button>
        </div>
      </form>

      {codeRequested ? (
        <form onSubmit={handleVerify} style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div className="field">
            <label htmlFor="legacy-code">인증번호</label>
            <input
              id="legacy-code"
              className="input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="legacy-password">새 비밀번호</label>
            <input
              id="legacy-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="legacy-password-confirm">새 비밀번호 확인</label>
            <input
              id="legacy-password-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(event) => setNewPasswordConfirm(event.target.value)}
            />
          </div>
          <div className="actionRow">
            <button className="primaryButton" type="submit" disabled={submitting}>
              {submitting ? "전환 처리 중..." : "계정 전환 완료"}
            </button>
          </div>
        </form>
      ) : null}

      {message ? <div className="message" style={{ marginTop: 16 }}>{message}</div> : null}
    </section>
  );
}
