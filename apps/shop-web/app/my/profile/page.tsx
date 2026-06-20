export const dynamic = "force-dynamic";

import Link from "next/link";

import { ProfileImagePageClient } from "../../../components/ProfileImagePageClient";
import { readCurrentUser } from "../../../lib/server-api";

export default async function MyProfilePage() {
  const user = await readCurrentUser();

  if (!user) {
    return (
      <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)]">
          Profile
        </p>
        <h1 className="mt-3 text-[24px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-[30px]">
          프로필 사진 변경
        </h1>
        <div className="mt-4 rounded-[20px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-sm leading-6 text-[var(--buyer-dark)]">
          프로필 사진을 변경하려면 <Link href="/login" className="font-semibold underline underline-offset-4">로그인</Link>이 필요합니다.
        </div>
      </section>
    );
  }

  return <ProfileImagePageClient initialUser={user} />;
}
