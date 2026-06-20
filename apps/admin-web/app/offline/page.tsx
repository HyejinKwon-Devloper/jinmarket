import Link from "next/link";

export default function OfflinePage() {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center py-8">
      <div className="w-full rounded-[28px] border border-[var(--buyer-border)] bg-white p-7 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-9">
        <p className="eyebrow">Offline Mode</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)]">
          네트워크 연결이 끊겨 관리자 데이터를 불러올 수 없어요.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[var(--buyer-muted)] sm:text-[15px]">
          현재는 상품, 주문, 이벤트 상태를 서버에서 다시 받아올 수 없는 상태입니다.
          연결이 복구되면 판매자 센터를 다시 열거나 아래 링크로 목록 화면으로 돌아가 주세요.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="primaryButton" href="/products">
            상품 관리로 이동
          </Link>
          <Link className="ghostButton" href="/orders">
            주문 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
