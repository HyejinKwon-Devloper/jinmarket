"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { ParticipantManager } from "../ParticipantManager";
import { useRandomGameStore } from "../../store/useRandomGameStore";

const revealModeOptions = [
  {
    mode: "hidden" as const,
    label: "게임 리빌",
    title: "게임으로 결과 공개",
    description:
      "짧은 플레이 뒤 캐릭터 리빌 연출과 함께 당첨자 카드가 중앙에서 순서대로 나타나요.",
  },
  {
    mode: "visible" as const,
    label: "즉시 공개",
    title: "게임 없이 바로 공개",
    description:
      "현장에서 빠르게 발표해야 할 때 바로 당첨자 카드를 중앙 모달에서 순서대로 보여줘요.",
  },
];

const mobilePanels = [
  {
    id: "participants",
    label: "참가자",
  },
  {
    id: "draw",
    label: "추첨",
  },
  {
    id: "review",
    label: "확인",
  },
] as const;

type MobilePanelId = (typeof mobilePanels)[number]["id"];

type SetupScreenProps = {
  onScrollTopChange?: (scrollTop: number) => void;
};

export function SetupScreen({ onScrollTopChange }: SetupScreenProps) {
  const participants = useRandomGameStore((state) => state.participants);
  const participantSource = useRandomGameStore(
    (state) => state.participantSource,
  );
  const winnerCount = useRandomGameStore((state) => state.winnerCount);
  const revealMode = useRandomGameStore((state) => state.revealMode);
  const lastImportReport = useRandomGameStore(
    (state) => state.lastImportReport,
  );
  const addParticipant = useRandomGameStore((state) => state.addParticipant);
  const bulkAddParticipants = useRandomGameStore(
    (state) => state.bulkAddParticipants,
  );
  const loadSampleParticipants = useRandomGameStore(
    (state) => state.loadSampleParticipants,
  );
  const removeParticipant = useRandomGameStore(
    (state) => state.removeParticipant,
  );
  const setWinnerCount = useRandomGameStore((state) => state.setWinnerCount);
  const setRevealMode = useRandomGameStore((state) => state.setRevealMode);
  const prepareGame = useRandomGameStore((state) => state.prepareGame);
  const resetAll = useRandomGameStore((state) => state.resetAll);
  const isDrawPending = useRandomGameStore((state) => state.isDrawPending);

  const [mobilePanel, setMobilePanel] = useState<MobilePanelId>("participants");

  const participantCount = participants.length;
  const maximumWinners = Math.max(1, participantCount);
  const isLockedEventSource = participantSource?.kind === "event";

  const primaryActionLabel = isDrawPending
    ? "서버에서 추첨 준비 중..."
    : revealMode === "hidden"
      ? "게임 리빌 시작하기"
      : "결과 바로 공개하기";

  const activePanelIndex = mobilePanels.findIndex(
    (panel) => panel.id === mobilePanel,
  );

  useEffect(() => {
    onScrollTopChange?.(0);
    setMobilePanel("participants");

    return () => {
      onScrollTopChange?.(0);
    };
  }, [onScrollTopChange]);

  const activeMobilePanelSummary = useMemo(() => {
    if (mobilePanel === "participants") {
      if (isLockedEventSource && participantSource) {
        return `${participantSource.eventTitle}의 구매자 응모자 리스트를 확인해요.`;
      }

      if (participantSource?.kind === "manual" && participantSource.eventTitle) {
        return `${participantSource.eventTitle}용 현장 참가자를 입력해요.`;
      }

      return "추첨에 사용할 참가자 풀을 정리해요.";
    }

    if (mobilePanel === "draw") {
      return "당첨 인원과 결과 공개 방식을 결정해요.";
    }

    return "설정을 검토하고 추첨을 시작해요.";
  }, [isLockedEventSource, mobilePanel, participantSource]);

  const notesTitle = isLockedEventSource
    ? "구매자 사이트 응모자 리스트로 추첨을 준비해요."
    : participantSource?.kind === "manual" && participantSource.eventTitle
      ? `${participantSource.eventTitle} 현장 참가자 추첨을 준비해요.`
      : "이 단계에서 참가자와 결과 공개 방식을 정리해요.";

  const notesDescription = isLockedEventSource
    ? "이벤트 존에서 응모한 구매자 명단을 서버에서 불러와 잠금 상태로 유지해요. 운영자는 당첨 인원과 공개 방식만 정하면 돼요."
    : participantSource?.kind === "manual" && participantSource.eventTitle
      ? "직접 등록 이벤트는 현장 접수자나 별도 명단을 수동으로 입력한 뒤 게임 리빌 또는 즉시 공개 방식으로 발표해요."
      : "빈 값과 중복 이름은 자동으로 정리하고, 참가자 수가 바뀌면 당첨 인원도 안전하게 보정해요.";

  const sourceLabel = isLockedEventSource
    ? "Buyer site entries"
    : participantSource?.kind === "manual" && participantSource.eventTitle
      ? "Manual event roster"
      : "Free setup";

  const notesCard = (
    <div
      data-testid="setup-notes-card"
      className="rounded-[28px] border border-slate-200/80 bg-white/96 px-5 py-4 text-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.16)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-600">
            Setup Notes
          </p>
          <h2 className="mt-2 text-lg font-black tracking-tight text-slate-950 sm:text-xl">
            {notesTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {notesDescription}
          </p>
        </div>
        <span className="inline-flex self-start rounded-full bg-slate-950 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-white">
          {sourceLabel}
        </span>
      </div>

      {participantSource ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Source
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {participantSource.kind === "event"
                ? "구매자 사이트 응모"
                : "수동 등록 이벤트"}
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Event
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {participantSource.eventTitle ?? "일반 추첨"}
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Status
            </p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {isLockedEventSource ? "응모자 잠금" : "직접 편집 가능"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );

  const winnerConfigCard = (
    <div
      data-testid="setup-winner-card"
      className="rounded-[28px] border border-slate-200/80 bg-white/96 p-5 text-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.16)]"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-600">
        Winner Config
      </p>
      <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">
        몇 명을 뽑을까요?
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        참가자가 {participantCount}명이면 최대 {participantCount || 1}명까지
        안전하게 선택할 수 있어요.
      </p>

      <div className="mt-5 flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <button
          data-testid="setup-winner-minus"
          type="button"
          onClick={() => setWinnerCount(winnerCount - 1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-black text-slate-800 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-100"
        >
          -
        </button>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Winners
          </p>
          <p
            data-testid="setup-winner-count"
            className="mt-1 text-4xl font-black tracking-tight text-slate-950"
          >
            {winnerCount}
          </p>
        </div>
        <button
          data-testid="setup-winner-plus"
          type="button"
          onClick={() => setWinnerCount(winnerCount + 1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-black text-slate-800 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-100"
        >
          +
        </button>
      </div>

      <input
        data-testid="setup-winner-range"
        type="range"
        min={1}
        max={maximumWinners}
        value={Math.min(winnerCount, maximumWinners)}
        onChange={(event) => setWinnerCount(Number(event.target.value))}
        className="mt-4 h-3 w-full accent-sky-500"
      />

      <input
        data-testid="setup-winner-input"
        type="number"
        inputMode="numeric"
        min={1}
        max={maximumWinners}
        value={winnerCount}
        onChange={(event) => setWinnerCount(Number(event.target.value))}
        className="mt-4 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-200 sm:text-base"
      />
    </div>
  );

  const revealCard = (
    <div
      data-testid="setup-reveal-card"
      className="rounded-[28px] border border-slate-200/80 bg-white/96 p-5 text-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.16)]"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-600">
        Result Reveal
      </p>
      <div className="mt-4 grid gap-3">
        {revealModeOptions.map((option) => {
          const isActive = option.mode === revealMode;

          return (
            <button
              key={option.mode}
              data-testid={`setup-reveal-${option.mode}`}
              type="button"
              onClick={() => setRevealMode(option.mode)}
              className={`rounded-[24px] border p-4 text-left transition ${
                isActive
                  ? "border-sky-400 bg-sky-50 shadow-[0_18px_40px_rgba(14,165,233,0.12)]"
                  : "border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {option.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {option.description}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                    isActive
                      ? "bg-sky-500 text-white"
                      : "bg-white text-slate-500"
                  }`}
                >
                  {option.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const snapshotCard = (
    <div
      data-testid="setup-snapshot-card"
      className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))] p-5 text-white shadow-[0_30px_80px_rgba(2,6,23,0.34)]"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-white/60">
        Snapshot
      </p>
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div className="rounded-[20px] border border-white/12 bg-white/10 p-3">
          <p className="text-[11px] text-white/64">참가자</p>
          <p className="mt-1 text-xl font-black">{participantCount}</p>
        </div>
        <div className="rounded-[20px] border border-white/12 bg-white/10 p-3">
          <p className="text-[11px] text-white/64">당첨</p>
          <p className="mt-1 text-xl font-black">{winnerCount}</p>
        </div>
        <div className="rounded-[20px] border border-white/12 bg-white/10 p-3">
          <p className="text-[11px] text-white/64">공개</p>
          <p className="mt-1 text-sm font-black">
            {revealMode === "hidden" ? "게임" : "즉시"}
          </p>
        </div>
        <div className="rounded-[20px] border border-white/12 bg-white/10 p-3">
          <p className="text-[11px] text-white/64">소스</p>
          <p className="mt-1 text-sm font-black">
            {isLockedEventSource ? "응모" : participantSource ? "수동" : "자유"}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-white/74">
        추첨은 중복 없이 진행돼요. 이후 서버 API나 운영 로그와도 연결하기
        쉬운 구조로 나눠 두었어요.
      </p>
    </div>
  );

  const actionButtons = (
    <div data-testid="setup-action-buttons" className="flex flex-col gap-3">
      <button
        data-testid="setup-prepare-button"
        type="button"
        onClick={() => {
          void prepareGame();
        }}
        disabled={participantCount === 0 || isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-pink-400 px-6 text-sm font-black text-slate-950 shadow-[0_18px_40px_rgba(244,114,182,0.35)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
      >
        {primaryActionLabel}
      </button>
      <button
        data-testid="setup-reset-button"
        type="button"
        onClick={resetAll}
        disabled={isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/92 px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
      >
        설정 다시 준비하기
      </button>
    </div>
  );

  const participantPanel = (
    <ParticipantManager
      participants={participants}
      participantSource={participantSource}
      readOnly={isLockedEventSource}
      lastImportReport={lastImportReport}
      onAddParticipant={addParticipant}
      onBulkAddParticipants={bulkAddParticipants}
      onLoadSamples={loadSampleParticipants}
      onRemoveParticipant={removeParticipant}
    />
  );

  const mobilePanelContent =
    mobilePanel === "participants" ? (
      <div data-testid="setup-panel-participants" className="min-h-[34rem]">
        {participantPanel}
      </div>
    ) : mobilePanel === "draw" ? (
      <div data-testid="setup-panel-draw" className="space-y-4">
        {winnerConfigCard}
        {revealCard}
      </div>
    ) : (
      <div data-testid="setup-panel-review" className="space-y-4">
        {snapshotCard}
        {actionButtons}
      </div>
    );

  return (
    <section
      data-testid="setup-screen"
      className="h-full overflow-y-auto pr-1 lg:overflow-hidden lg:pr-0"
      onScroll={(event) => {
        onScrollTopChange?.(event.currentTarget.scrollTop);
      }}
    >
      <div className="flex flex-col gap-4 lg:hidden">
        {notesCard}

        <div
          data-testid="setup-mobile-nav"
          className="rounded-[28px] border border-white/12 bg-white/8 p-3 text-white backdrop-blur"
        >
          <div className="grid grid-cols-3 gap-2">
            {mobilePanels.map((panel, index) => {
              const isActive = panel.id === mobilePanel;
              const isComplete = index < activePanelIndex;

              return (
                <button
                  key={panel.id}
                  data-testid={`setup-tab-${panel.id}`}
                  type="button"
                  onClick={() => setMobilePanel(panel.id)}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full px-3 text-xs font-black uppercase tracking-[0.18em] transition ${
                    isActive
                      ? "bg-white text-slate-950"
                      : isComplete
                        ? "bg-white/14 text-white"
                        : "text-white/68 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {panel.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 px-1 text-sm leading-6 text-white/72">
            {activeMobilePanelSummary}
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mobilePanel}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {mobilePanelContent}
          </motion.div>
        </AnimatePresence>

        {mobilePanel !== "review" ? (
          <div className="flex gap-3">
            {mobilePanel !== "participants" ? (
              <button
                data-testid="setup-back-button"
                type="button"
                onClick={() =>
                  setMobilePanel(mobilePanels[activePanelIndex - 1].id)
                }
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/14 bg-white/8 px-5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/12"
              >
                이전
              </button>
            ) : null}

            <button
              data-testid="setup-next-button"
              type="button"
              onClick={() =>
                setMobilePanel(mobilePanels[activePanelIndex + 1].id)
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-sky-300 bg-sky-100 px-5 text-sm font-black text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-200"
            >
              다음
            </button>
          </div>
        ) : (
          <button
            data-testid="setup-review-back-button"
            type="button"
            onClick={() => setMobilePanel("draw")}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/14 bg-white/8 px-5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/12"
          >
            이전 단계로 돌아가기
          </button>
        )}
      </div>

      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[minmax(0,1.25fr)_340px] lg:gap-4">
        <div className="flex min-h-0 flex-col gap-4">
          {notesCard}
          <div className="min-h-0 flex-1">{participantPanel}</div>
        </div>

        <aside className="min-h-0 overflow-y-auto pr-1">
          <div className="space-y-4">
            {winnerConfigCard}
            {revealCard}
            {snapshotCard}
            {actionButtons}
          </div>
        </aside>
      </div>

      {/* TODO: Add admin mode for locked event sessions, bulk import templates, and operator-only controls. */}
      {/* TODO: Add analytics/event logging for setup edits and draw launches once event tracking rules are defined. */}
    </section>
  );
}
