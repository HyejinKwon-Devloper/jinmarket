"use client";

import { useState } from "react";
import type { SessionUser } from "@jinmarket/shared";

import { cn } from "../lib/ui";
import { LuckyRpsGame } from "./LuckyRpsGame";
import { TimingStopGame } from "./TimingStopGame";
import { Badge } from "./ui/Badge";

type MiniGameTab = "TIMING_STOP" | "LUCKY_RPS";

const gameTabs: Array<{
  id: MiniGameTab;
  badge: string;
  label: string;
  title: string;
  description: string;
  highlights?: string[];
}> = [
  {
    id: "TIMING_STOP",
    badge: "Reaction",
    label: "타이밍 스톱",
    title: "타이밍 스톱 챌린지",
    description:
      "회전하는 빨간 LED를 노란 목표칸에 정확히 멈추는 반응 타이밍 미니게임이에요.",
    highlights: ["난이도 4단계", "입력 지연 조절", "혼자 연습형"],
  },
  {
    id: "LUCKY_RPS",
    badge: "Lucky Draw",
    label: "행운 가위바위보",
    title: "3연승 행운의 가위바위보",
    description: "3판 연속으로 모두 이기면 오늘의 행운을 드려요.",
    highlights: undefined,
  },
];

export function GameHubPageClient({
  initialUser,
}: {
  initialUser: SessionUser | null;
}) {
  const [activeTab, setActiveTab] = useState<MiniGameTab>("TIMING_STOP");
  const activeGame =
    gameTabs.find((tab) => tab.id === activeTab) ?? gameTabs[0];

  return (
    <div className="mx-3 space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-[26px] border border-[var(--buyer-border)] bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
        <div className="grid gap-4 px-4 py-5 sm:px-7 sm:py-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-3">
              <Badge variant="success">Mini Game</Badge>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                  {activeGame.badge}
                </p>
                <h1 className="text-[22px] font-extrabold leading-[1.12] tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-4xl sm:leading-none">
                  {activeGame.title}
                </h1>
                <p className="max-w-[52ch] text-sm leading-6 text-[var(--buyer-muted)] sm:text-[15px] sm:leading-7">
                  {activeGame.description}
                </p>
              </div>
            </div>

            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {gameTabs.map((tab) => {
                const isActive = tab.id === activeTab;

                return (
                  <button
                    key={tab.id}
                    aria-pressed={isActive}
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2",
                      isActive
                        ? "border-[var(--buyer-primary)] bg-[var(--buyer-primary)] text-white shadow-[0_14px_30px_rgba(31,78,121,0.18)]"
                        : "border-[var(--buyer-border)] bg-[var(--buyer-softest)] text-[var(--buyer-dark)] hover:bg-white",
                    )}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
              Game Note
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeGame?.highlights?.map((highlight, index) => (
                <Badge
                  key={`${activeGame.id}-${index}`}
                  variant={
                    activeGame.id === "LUCKY_RPS" && index === 2
                      ? "warning"
                      : "default"
                  }
                >
                  {highlight}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-5 text-[var(--buyer-muted)] sm:text-sm sm:leading-6">
              {activeGame.id === "LUCKY_RPS"
                ? "행운의 가위바위보는 3연승 성공 시 행운이 전달되요!"
                : "타이밍 스톱 챌린지는 누구나 바로 연습할 수 있어요. 키보드 스페이스바와 엔터로도 플레이 가능합니다."}
            </p>
          </div>
        </div>
      </section>

      {activeTab === "TIMING_STOP" ? (
        <TimingStopGame />
      ) : (
        <LuckyRpsGame initialUser={initialUser} />
      )}
    </div>
  );
}
