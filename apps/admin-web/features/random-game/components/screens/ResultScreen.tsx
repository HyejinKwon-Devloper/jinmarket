"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useRandomGameStore } from "../../store/useRandomGameStore";
import { LuckyMuncher } from "../LuckyMuncher";

const REVEAL_SLOWDOWN_MULTIPLIER = 2;

function formatDrawTime(isoString: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoString));
}

export function ResultScreen() {
  const currentSession = useRandomGameStore((state) => state.currentSession);
  const participants = useRandomGameStore((state) => state.participants);
  const participantSource = useRandomGameStore(
    (state) => state.participantSource,
  );
  const reshuffle = useRandomGameStore((state) => state.reshuffle);
  const backToSetup = useRandomGameStore((state) => state.backToSetup);
  const resetAll = useRandomGameStore((state) => state.resetAll);
  const isDrawPending = useRandomGameStore((state) => state.isDrawPending);
  const [revealedCount, setRevealedCount] = useState(0);
  const [listVisible, setListVisible] = useState(false);

  useEffect(() => {
    if (!currentSession) {
      return undefined;
    }

    setRevealedCount(0);
    setListVisible(false);

    const baseDelay =
      (currentSession.revealMode === "visible" ? 260 : 1150) *
      REVEAL_SLOWDOWN_MULTIPLIER;
    const stepDelay =
      (currentSession.revealMode === "visible" ? 520 : 680) *
      REVEAL_SLOWDOWN_MULTIPLIER;
    const finishDelay =
      baseDelay +
      Math.max(currentSession.drawPlan.winners.length - 1, 0) * stepDelay +
      780 * REVEAL_SLOWDOWN_MULTIPLIER;

    const revealTimers = currentSession.drawPlan.winners.map((_, index) =>
      window.setTimeout(() => {
        setRevealedCount(index + 1);
      }, baseDelay + index * stepDelay),
    );
    const listTimer = window.setTimeout(() => {
      setListVisible(true);
    }, finishDelay);

    return () => {
      revealTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(listTimer);
    };
  }, [currentSession]);

  if (!currentSession) {
    return (
      <section className="grid h-full place-items-center rounded-[36px] border border-white/12 bg-white/10 p-6 text-white backdrop-blur">
        <div className="text-center">
          <h2 className="text-xl font-black tracking-tight sm:text-2xl">
            아직 공개할 결과 세션이 없어요.
          </h2>
          <button
            type="button"
            onClick={backToSetup}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5"
          >
            참가자 설정으로 돌아가기
          </button>
        </div>
      </section>
    );
  }

  const winners = currentSession.drawPlan.winners;
  const isInstantReveal = currentSession.revealMode === "visible";
  const activeWinner =
    revealedCount > 0
      ? winners[Math.min(revealedCount - 1, winners.length - 1)]
      : null;
  const centerMode = listVisible
    ? "complete"
    : activeWinner
      ? "winner"
      : "intro";
  const title = isInstantReveal ? (
    <div>
      당첨 결과를
      <br />
      바로 공개하고 있어요
    </div>
  ) : (
    <div>
      게임 리빌 결과를
      <br />
      공개하고 있어요
    </div>
  );
  const primaryActionLabel = isInstantReveal
    ? "같은 설정으로 바로 다시 추첨"
    : "같은 설정으로 다시 플레이";

  const sequenceLabel = useMemo(() => {
    if (centerMode === "complete") {
      return "ALL REVEALED";
    }

    if (activeWinner) {
      return `WINNER ${revealedCount}`;
    }

    return "PREPARING";
  }, [activeWinner, centerMode, revealedCount]);

  const sourceSummary =
    participantSource?.kind === "event"
      ? `${participantSource.eventTitle} 응모자`
      : participantSource?.kind === "manual" && participantSource.eventTitle
        ? `${participantSource.eventTitle} 참가자`
        : "현재 참가자";

  const centerCard = (
    <AnimatePresence mode="wait">
      <motion.div
        key={centerMode === "winner" ? activeWinner?.id : centerMode}
        data-testid="result-center-card"
        initial={{ opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.94 }}
        transition={{ duration: 0.68, ease: "easeOut" }}
        className="w-full max-w-sm rounded-[32px] border border-white/18 bg-white/96 px-6 py-7 text-center text-slate-950 shadow-[0_32px_80px_rgba(15,23,42,0.28)]"
      >
        <div className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-white">
          {sequenceLabel}
        </div>

        {centerMode === "intro" ? (
          <>
            <p className="mt-5 text-lg font-black tracking-tight sm:text-xl">
              결과를 정리하고 있어요.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              잠시 후 당첨자 이름이 중앙 카드에서 순서대로 공개돼요.
            </p>
          </>
        ) : null}

        {centerMode === "winner" && activeWinner ? (
          <>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.22em] text-sky-600">
              축하합니다
            </p>
            <p className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              {activeWinner.name}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {revealedCount}번째 당첨자로 공개됐어요.
            </p>
          </>
        ) : null}

        {centerMode === "complete" ? (
          <>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.22em] text-emerald-600">
              공개 완료
            </p>
            <p className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              총 {winners.length}명의 당첨자가 모두 공개됐어요.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              아래 리스트에서 전체 결과를 한눈에 다시 확인할 수 있어요.
            </p>
          </>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );

  const winnerListCard = listVisible ? (
    <motion.div
      data-testid="result-winner-list"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="rounded-[30px] border border-white/14 bg-slate-950/78 p-4 text-white shadow-[0_24px_60px_rgba(2,6,23,0.38)] backdrop-blur"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-white/60">
            Winner List
          </p>
          <p className="mt-2 text-sm leading-6 text-white/74">
            중앙 리빌 순서를 그대로 유지한 최종 당첨자 리스트예요.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {winners.map((winner, index) => (
            <div
              key={winner.id}
              className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/8 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-slate-950">
                  {index + 1}
                </span>
                <p className="text-sm font-bold text-white sm:text-base">
                  {winner.name}
                </p>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/48">
                Winner
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  ) : null;

  const summaryCard = (
    <div
      data-testid="result-summary-card"
      className="rounded-[28px] border border-white/12 bg-white/8 p-5 text-white backdrop-blur"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-white/60">
        Draw Summary
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-[18px] border border-white/12 bg-white/8 p-3">
          <p className="text-[11px] text-white/64">참가자</p>
          <p className="mt-1 text-xl font-black">{participants.length}</p>
        </div>
        <div className="rounded-[18px] border border-white/12 bg-white/8 p-3">
          <p className="text-[11px] text-white/64">당첨</p>
          <p className="mt-1 text-xl font-black">{winners.length}</p>
        </div>
        <div className="rounded-[18px] border border-white/12 bg-white/8 p-3">
          <p className="text-[11px] text-white/64">공개</p>
          <p className="mt-1 text-sm font-black">
            {isInstantReveal ? "즉시" : "게임"}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-white/74">
        기준 리스트: {sourceSummary} {participants.length}명
      </p>
    </div>
  );

  const sequenceCard = (
    <div
      data-testid="result-sequence-card"
      className="rounded-[28px] border border-slate-200/80 bg-white/96 p-5 text-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.16)]"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-600">
        Sequence
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        당첨자는 중앙 카드에서 한 명씩 공개되고, 전부 끝나면 전체 리스트가
        아래에 정리돼요. 현장 발표에서도 스크롤을 길게 내리지 않고 바로
        확인할 수 있게 구성했어요.
      </p>
    </div>
  );

  const actionButtons = (
    <div data-testid="result-action-buttons" className="flex flex-col gap-3">
      <button
        data-testid="result-reshuffle-button"
        type="button"
        onClick={() => {
          void reshuffle();
        }}
        disabled={isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-pink-400 px-6 text-sm font-black text-slate-950 shadow-[0_18px_40px_rgba(244,114,182,0.35)] transition hover:-translate-y-0.5"
      >
        {isDrawPending ? "새 결과 준비 중..." : primaryActionLabel}
      </button>
      <button
        type="button"
        onClick={backToSetup}
        disabled={isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/12"
      >
        참가자와 설정 수정하기
      </button>
      <button
        type="button"
        onClick={resetAll}
        disabled={isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/16 bg-transparent px-6 text-sm font-black text-white/82 transition hover:-translate-y-0.5 hover:border-white/24 hover:bg-white/6"
      >
        같은 이벤트에서 처음부터 다시 준비
      </button>
    </div>
  );

  const stageCard = (
    <div
      data-testid="result-stage-card"
      className="relative overflow-hidden rounded-[36px] border border-white/12 bg-[radial-gradient(circle_at_top,rgba(254,215,170,0.22),transparent_32%),linear-gradient(180deg,#0b1431_0%,#101c46_100%)] p-5 shadow-[0_34px_90px_rgba(2,6,23,0.45)] sm:p-6"
    >
      <div className="pointer-events-none absolute left-1/2 top-14 h-44 w-44 -translate-x-1/2 rounded-full bg-pink-300/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-10 h-36 w-36 rounded-full bg-cyan-300/18 blur-3xl" />
      <div className="pointer-events-none absolute right-6 top-6 hidden w-32 sm:block">
        <LuckyMuncher
          mood={listVisible ? "happy" : activeWinner ? "surprised" : "focus"}
        />
      </div>

      <div className="inline-flex items-center rounded-full border border-white/12 bg-slate-950/40 px-4 py-2 text-xs font-bold tracking-[0.18em] text-white/82 backdrop-blur">
        {formatDrawTime(currentSession.drawPlan.drawnAt)}
      </div>

      <div className="mx-auto mt-5 w-full max-w-xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-200/80">
          Winner Reveal Stage
        </p>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
          {title}
        </h2>
      </div>

      <div
        data-testid="result-stage-area"
        className="mt-8 flex min-h-[18rem] items-center justify-center px-2 sm:min-h-[21rem]"
      >
        {centerCard}
      </div>
    </div>
  );

  return (
    <section
      data-testid="result-screen"
      className="h-full overflow-y-auto pr-1 lg:overflow-hidden lg:pr-0"
    >
      <div className="flex flex-col gap-4 lg:hidden">
        {stageCard}
        {winnerListCard}
        {summaryCard}
        {sequenceCard}
        {actionButtons}
      </div>

      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4">
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="space-y-4">
            {stageCard}
            {winnerListCard}
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto pr-1">
          <div className="space-y-4">
            {summaryCard}
            {sequenceCard}
            <div className="pt-2">{actionButtons}</div>
          </div>
        </aside>
      </div>

      {/* TODO: Add analytics/event logging for reveal timing, reshuffles, and final winner confirmation. */}
    </section>
  );
}
