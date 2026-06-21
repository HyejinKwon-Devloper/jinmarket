export const dynamic = "force-dynamic";

import type { Metadata } from "next";

import { TimingStopGame } from "../../components/TimingStopGame";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = {
  title: "타이밍 스톱 챌린지 | JINMARKET",
  description:
    "회전하는 빨간 LED를 노란 목표칸에 정확히 멈추는 반응 타이밍 미니게임이에요.",
};

export default function GamePage() {
  return (
    <div className="space-y-4 sm:space-y-6 mx-3">
      <section className="overflow-hidden rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-7">
        <div className="space-y-3">
          <Badge variant="success">Mini Game</Badge>
          <h1 className="text-[22px] font-extrabold leading-[1.12] tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-4xl sm:leading-none">
            타이밍 스톱 챌린지
          </h1>
          <p className="max-w-[42ch] text-sm leading-6 text-[var(--buyer-muted)]">
            회전하는 빨간 LED를 노란 목표칸에 멈춰보세요. STOP을 눌러도 입력
            지연만큼 더 이동하니, 목표보다 살짝 일찍 누르는 감을 익히는 게
            핵심이에요.
          </p>
        </div>
      </section>

      <TimingStopGame />
    </div>
  );
}
