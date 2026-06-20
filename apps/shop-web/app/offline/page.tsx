import Link from "next/link";

export default function OfflinePage() {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center py-8">
      <div className="w-full rounded-[28px] border border-[var(--buyer-border)] bg-white p-7 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)]">
          Offline Mode
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)]">
          인터넷 연결을 다시 확인해 주세요.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[var(--buyer-muted)] sm:text-[15px]">
          지금은 네트워크에 연결되지 않아 최신 상품과 주문 정보를 불러올 수 없어요.
          연결이 돌아오면 홈 화면에서 다시 열거나 아래 링크로 메인 화면으로 이동해 주세요.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--buyer-primary)] bg-[var(--buyer-primary)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(31,78,121,0.18)] transition hover:border-[var(--buyer-primary-strong)] hover:bg-[var(--buyer-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
            href="/"
          >
            메인으로 돌아가기
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--buyer-primary)] bg-white px-4 py-2 text-sm font-semibold text-[var(--buyer-primary)] transition hover:bg-[var(--buyer-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
            href="/events"
          >
            이벤트 보기
          </Link>
        </div>
      </div>
    </section>
  );
}
