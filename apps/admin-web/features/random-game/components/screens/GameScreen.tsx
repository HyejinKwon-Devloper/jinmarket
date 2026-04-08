"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { useRandomGameStore } from "../../store/useRandomGameStore";
import { LuckyMuncher } from "../LuckyMuncher";
import { RandomGameCanvas } from "../RandomGameCanvas";

type RevealPhase = "play" | "inflate" | "launch";

export function GameScreen() {
  const currentSession = useRandomGameStore((state) => state.currentSession);
  const participants = useRandomGameStore((state) => state.participants);
  const winnerCount = useRandomGameStore((state) => state.winnerCount);
  const participantSource = useRandomGameStore(
    (state) => state.participantSource,
  );
  const finishGame = useRandomGameStore((state) => state.finishGame);
  const backToSetup = useRandomGameStore((state) => state.backToSetup);
  const reshuffle = useRandomGameStore((state) => state.reshuffle);
  const isDrawPending = useRandomGameStore((state) => state.isDrawPending);
  const [eatenCount, setEatenCount] = useState(0);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("play");

  useEffect(() => {
    setEatenCount(0);
    setRevealPhase("play");
  }, [currentSession?.id]);

  useEffect(() => {
    if (revealPhase === "play") {
      return undefined;
    }

    const launchTimer = window.setTimeout(() => {
      setRevealPhase("launch");
    }, 700);
    const finishTimer = window.setTimeout(() => {
      finishGame();
    }, 1800);

    return () => {
      window.clearTimeout(launchTimer);
      window.clearTimeout(finishTimer);
    };
  }, [finishGame, revealPhase]);

  if (!currentSession) {
    return (
      <section className="grid h-full place-items-center rounded-[36px] border border-white/12 bg-white/10 p-6 text-white backdrop-blur">
        <div className="text-center">
          <h2 className="text-xl font-black tracking-tight sm:text-2xl">
            준비된 게임 세션이 없어요.
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/72">
            참가자와 공개 설정을 확인한 뒤 다시 시작해 주세요.
          </p>
          <button
            type="button"
            onClick={backToSetup}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5"
          >
            설정 화면으로 돌아가기
          </button>
        </div>
      </section>
    );
  }

  const remainingToTrigger = Math.max(currentSession.threshold - eatenCount, 0);
  const sourceLabel =
    participantSource?.kind === "event"
      ? `${participantSource.eventTitle} 응모자`
      : participantSource?.kind === "manual" && participantSource.eventTitle
        ? `${participantSource.eventTitle} 참가자`
        : "현재 참가자";

  const boardStage = (
    <div
      data-testid="game-board-stage"
      className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#0d1838]"
    >
      <div className="mx-auto w-full max-w-[28rem] lg:max-w-none">
        <RandomGameCanvas
          sessionId={currentSession.id}
          foods={currentSession.foodItems}
          threshold={currentSession.threshold}
          disabled={revealPhase !== "play"}
          onProgressChange={setEatenCount}
          onThresholdReached={() => {
            setRevealPhase((previous) =>
              previous === "play" ? "inflate" : previous,
            );
          }}
        />
      </div>

      {revealPhase !== "play" ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/58 px-6 text-center backdrop-blur-sm">
          <div>
            <motion.div
              className="mx-auto w-36 sm:w-40"
              animate={
                revealPhase === "inflate"
                  ? {
                      scale: [1, 1.08, 1.15, 1.06],
                      rotate: [0, -3, 3, 0],
                    }
                  : {
                      scale: [1.06, 1.18, 0.98],
                      rotate: [0, 4, -4, 0],
                    }
              }
              transition={{ duration: 0.9, ease: "easeInOut" }}
            >
              <LuckyMuncher
                mood={revealPhase === "launch" ? "surprised" : "happy"}
              />
            </motion.div>
            <motion.div
              className="mt-4 rounded-full border border-white/16 bg-white/10 px-4 py-3 text-xs font-bold text-white/90 sm:px-5 sm:text-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {revealPhase === "inflate"
                ? "에너지가 충분히 모였어요. 캐릭터가 행운 캡슐을 꺼낼 준비를 하고 있어요."
                : "캡슐이 튀어나오고 있어요. 곧 결과 화면으로 넘어갈게요."}
            </motion.div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const missionCard = (
    <div
      data-testid="game-mission-card"
      className="rounded-[28px] border border-slate-200/80 bg-white/96 p-5 text-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.16)]"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-600">
        Mission
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">남은 오브</p>
          <p className="mt-1 text-2xl font-black text-slate-950">
            {remainingToTrigger}
          </p>
        </div>
        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">당첨 인원</p>
          <p className="mt-1 text-2xl font-black text-slate-950">
            {winnerCount}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        {sourceLabel} {participants.length}명 중에서 당첨자를 추첨하고 있어요.
      </p>
    </div>
  );

  const controlsCard = (
    <div
      data-testid="game-controls-card"
      className="rounded-[28px] border border-white/12 bg-white/8 p-5 text-white backdrop-blur"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-white/60">
        Controls
      </p>
      <p className="mt-3 text-sm leading-6 text-white/72">
        오른쪽 아래 조이스틱이나 방향키로 캐릭터를 움직일 수 있어요.
        필요한 개수만큼 오브를 모으면 결과 리빌이 자동으로 시작돼요.
      </p>
    </div>
  );

  const actionButtons = (
    <div data-testid="game-action-buttons" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          void reshuffle();
        }}
        disabled={isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/14 bg-white/8 px-5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/12"
      >
        {isDrawPending ? "새 결과 준비 중..." : "새 결과로 다시 플레이"}
      </button>
      <button
        type="button"
        onClick={backToSetup}
        disabled={isDrawPending}
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/14 bg-transparent px-5 text-sm font-black text-white/86 transition hover:-translate-y-0.5 hover:border-white/24 hover:bg-white/6"
      >
        참가자와 설정 수정
      </button>
    </div>
  );

  return (
    <section
      data-testid="game-screen"
      className="h-full overflow-y-auto pr-1 lg:overflow-hidden lg:pr-0"
    >
      <div className="flex flex-col gap-4 lg:hidden">
        <div
          data-testid="game-board-card"
          className="rounded-[36px] border border-white/12 bg-[#09132f]/92 p-4 shadow-[0_34px_90px_rgba(2,6,23,0.45)]"
        >
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200/80">
                Game On
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-white">
                에너지 오브를 모아 캐릭터가 행운 캡슐을 꺼내게 해 보세요.
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/72">
                목표 개수만큼 모으면 결과 연출이 시작되고 중앙 결과 화면으로
                자연스럽게 이어져요.
              </p>
            </div>
            <div
              data-testid="game-progress-chip"
              className="inline-flex items-center self-start rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/76"
            >
              목표 오브 {currentSession.threshold}개 중 {eatenCount}개 획득
            </div>
          </div>

          <div className="mt-4">{boardStage}</div>
        </div>

        {missionCard}
        {controlsCard}
        {actionButtons}
      </div>

      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4">
        <div
          data-testid="game-board-card"
          className="flex min-h-0 flex-col rounded-[36px] border border-white/12 bg-[#09132f]/92 p-5 shadow-[0_34px_90px_rgba(2,6,23,0.45)]"
        >
          <div className="mb-4 shrink-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200/80">
                  Game On
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">
                  에너지 오브를 모아 캐릭터가 행운 캡슐을 꺼내게 해 보세요.
                </h2>
              </div>
              <div
                data-testid="game-progress-chip"
                className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/76"
              >
                목표 오브 {currentSession.threshold}개 중 {eatenCount}개 획득
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">{boardStage}</div>
        </div>

        <aside className="min-h-0 overflow-y-auto pr-1">
          <div className="space-y-4">
            {missionCard}
            {controlsCard}
            <div className="pt-2">{actionButtons}</div>
          </div>
        </aside>
      </div>

      {/* TODO: Add sound effects for orb collection, charge-up, and winner pop once event audio rules are approved. */}
    </section>
  );
}
