"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

import { sampleParticipantNames } from "../../data/sampleParticipants";
import { useRandomGameStore } from "../../store/useRandomGameStore";
import { LuckyMuncher } from "../LuckyMuncher";

type StartScreenProps = {
  onScrollTopChange?: (scrollTop: number) => void;
};

export function StartScreen({ onScrollTopChange }: StartScreenProps) {
  const goToSetup = useRandomGameStore((state) => state.goToSetup);
  const loadSampleParticipants = useRandomGameStore(
    (state) => state.loadSampleParticipants,
  );

  useEffect(() => {
    onScrollTopChange?.(0);

    return () => {
      onScrollTopChange?.(0);
    };
  }, [onScrollTopChange]);

  return (
    <section
      data-testid="start-screen"
      className="h-full overflow-y-auto pr-1 lg:overflow-hidden lg:pr-0"
      onScroll={(event) => {
        onScrollTopChange?.(event.currentTarget.scrollTop);
      }}
    >
      <div className="grid min-h-full gap-4 lg:h-full lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
        <div className="flex flex-col justify-between rounded-[36px] border border-white/12 bg-white/95 p-6 text-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.25)] sm:p-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-sky-600">
              Character Arcade Reveal
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
              이벤트 응모자도, 현장 명단도
              <br />
              같은 게임 리빌로 공정하게 공개해 보세요.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600 sm:text-lg sm:leading-7">
              참가자 명단을 준비하고, 게임 리빌 또는 즉시 공개 중 한 가지
              발표 방식을 선택하면 모바일 친화적인 추첨 경험으로 바로
              이어져요.
            </p>
          </div>

          <div className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                data-testid="start-create-event"
                type="button"
                onClick={goToSetup}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                추첨 설정 시작하기
              </button>
              <button
                data-testid="start-load-sample"
                type="button"
                onClick={() => {
                  loadSampleParticipants();
                }}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-sky-300 bg-sky-100 px-6 text-sm font-black text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-200"
              >
                샘플 명단으로 빠르게 체험
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                {
                  index: "1",
                  accent: "text-pink-500",
                  title: "참가자 준비",
                  description:
                    "직접 입력과 여러 줄 붙여 넣기를 모두 지원해서 현장 명단도 빠르게 정리할 수 있어요.",
                },
                {
                  index: "2",
                  accent: "text-amber-500",
                  title: "공개 방식 선택",
                  description:
                    "게임으로 분위기를 끌어올리거나, 즉시 결과를 보여주는 빠른 모드도 선택할 수 있어요.",
                },
                {
                  index: "3",
                  accent: "text-emerald-500",
                  title: "공정한 추첨",
                  description:
                    "셔플 기반 서버 추첨으로 중복 없이 당첨자를 뽑고, 결과는 중앙 리빌 카드로 보여줘요.",
                },
              ].map((item) => (
                <div
                  key={item.index}
                  className="rounded-[26px] border border-slate-200 bg-slate-50 p-4"
                >
                  <p
                    className={`text-xs font-black uppercase tracking-[0.24em] ${item.accent}`}
                  >
                    {item.index}
                  </p>
                  <p className="mt-2 text-base font-black text-slate-950 sm:text-lg">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-600 sm:leading-6">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
          <motion.div
            className="relative overflow-hidden rounded-[36px] border border-white/12 bg-[linear-gradient(180deg,rgba(34,211,238,0.18),rgba(168,85,247,0.12))] p-6 shadow-[0_24px_64px_rgba(15,23,42,0.28)]"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute -right-8 top-6 h-32 w-32 rounded-full bg-pink-400/25 blur-3xl" />
            <div className="absolute -left-8 bottom-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/70">
                  Character Preview
                </p>
                <div className="mx-auto mt-6 w-48 sm:w-56">
                  <LuckyMuncher mood="happy" />
                </div>
              </div>
              <div className="mt-5 rounded-[28px] border border-white/12 bg-white/10 p-4 text-sm leading-5 text-white/86 backdrop-blur sm:leading-6">
                오브를 충분히 모으면 캐릭터가 행운 캡슐을 꺼내고, 당첨자
                카드가 화면 중앙에서 순서대로 팝업돼요.
              </div>
            </div>
          </motion.div>

          <div className="rounded-[32px] border border-white/12 bg-white/8 p-5 text-white shadow-[0_22px_54px_rgba(15,23,42,0.18)] backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/60">
              Sample Pool
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {sampleParticipantNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-white/12 bg-white/10 px-3 py-2 text-sm font-semibold text-white/86"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
