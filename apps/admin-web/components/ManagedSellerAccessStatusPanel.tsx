"use client";

import type { SellerAccessOverview } from "@jinmarket/shared";

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("ko-KR");
}

export function ManagedSellerAccessStatusPanel({
  overview,
  requesting,
  onRequest
}: {
  overview: SellerAccessOverview | null;
  requesting: boolean;
  onRequest: () => Promise<void>;
}) {
  const latestRequest = overview?.latestRequest ?? null;
  const isPending = latestRequest?.status === "PENDING";
  const isRejected = latestRequest?.status === "REJECTED";
  const isApproved = overview?.canSell || latestRequest?.status === "APPROVED";

  return (
    <section className="panel sellerAccessPanel">
      <p className="eyebrow">Seller Approval</p>
      <h2>판매 등록 전 승인 확인이 필요합니다.</h2>
      <p className="muted">
        판매자 사이트에 로그인한 뒤 승인 요청을 남기면 <strong>관리자 계정</strong>이 확인 후 승인합니다.
        승인 전에는 상품 등록과 판매 관리 기능을 사용할 수 없습니다.
      </p>

      {latestRequest ? (
        <div className="sellerAccessStatusCard">
          <strong>
            현재 상태:{" "}
            {latestRequest.status === "PENDING"
              ? "승인 대기"
              : latestRequest.status === "APPROVED"
                ? "승인 완료"
                : "반려"}
          </strong>
          <p className="muted">요청 일시: {formatDateTime(latestRequest.requestedAt)}</p>
          {latestRequest.reviewedAt ? (
            <p className="muted">처리 일시: {formatDateTime(latestRequest.reviewedAt)}</p>
          ) : null}
          {isApproved ? (
            <p className="muted">승인이 완료되었습니다. 화면 상태가 바로 바뀌지 않으면 다시 확인해 주세요.</p>
          ) : null}
        </div>
      ) : null}

      <div className="actionRow" style={{ marginTop: 16 }}>
        <button
          className="primaryButton"
          type="button"
          disabled={requesting || isPending}
          onClick={() => {
            if (isApproved) {
              window.location.reload();
              return;
            }

            void onRequest();
          }}
        >
          {isApproved
            ? "승인 상태 다시 확인"
            : isPending
              ? "승인 대기 중"
              : requesting
                ? "요청 중..."
                : isRejected
                  ? "다시 승인 요청"
                  : "판매자 승인 요청"}
        </button>
      </div>
    </section>
  );
}
