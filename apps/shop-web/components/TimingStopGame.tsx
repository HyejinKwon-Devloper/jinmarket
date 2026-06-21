"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/ui";

type Mode = "easy" | "normal" | "hard" | "real";
type Status = "idle" | "running" | "stopping" | "win" | "lose";

type ModeParams = { base: number; jitter: number; accel: number };

const N = 48;
const BOX = 300;
const LIGHT = 16;
const RADIUS = 130;

const MODE_LABELS: Record<Mode, string> = {
  easy: "느림",
  normal: "보통",
  hard: "빠름",
  real: "실전",
};

const MODE_PARAMS: Record<Mode, ModeParams> = {
  easy: { base: 58, jitter: 7, accel: 900 },
  normal: { base: 34, jitter: 6, accel: 700 },
  hard: { base: 20, jitter: 4, accel: 500 },
  real: { base: 14, jitter: 5, accel: 450 },
};

const TARGETS: { idx: number; label: string }[] = [
  { idx: 0, label: "상단" },
  { idx: 12, label: "오른쪽" },
  { idx: 24, label: "하단" },
  { idx: 36, label: "왼쪽" },
];

function nextInterval(startAt: number, params: ModeParams): number {
  const elapsed = performance.now() - startAt;
  // 시작 초반 살짝 가속: interval이 base*2.2 → base로 감소
  const accelFactor = Math.max(1, 2.2 - (elapsed / params.accel) * 1.2);
  const random = Math.random() * params.jitter;
  return Math.max(5, params.base * accelFactor + random);
}

/** a에서 b까지 최단 오차(칸). 0이면 정확, 양수=목표보다 지나침. */
function signedDiff(a: number, b: number): number {
  let d = (a - b + N) % N;
  if (d > N / 2) d -= N;
  return d;
}

export function TimingStopGame() {
  const [mode, setMode] = useState<Mode>("normal");
  const [delay, setDelay] = useState(280);
  const [target, setTarget] = useState(0);

  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState(
    "STOP 입력 후 지연시간만큼 더 이동한 뒤 멈춥니다.",
  );
  const [tries, setTries] = useState(0);
  const [wins, setWins] = useState(0);
  const [lastDiff, setLastDiff] = useState<number | null>(null);

  const posRef = useRef(0);
  const targetRef = useRef(0);
  const modeRef = useRef<Mode>("normal");
  const delayRef = useRef(280);
  const stoppingRef = useRef(false);
  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    delayRef.current = delay;
  }, [delay]);

  const coords = useMemo(() => {
    return Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return {
        left: BOX / 2 + Math.cos(a) * RADIUS - LIGHT / 2,
        top: BOX / 2 + Math.sin(a) * RADIUS - LIGHT / 2,
      };
    });
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // LED 좌표는 부동소수점 % 값이라 SSR HTML과 클라이언트 계산값이 미세하게
  // 달라 hydration 경고를 유발한다. 링은 인터랙티브 전용이므로 마운트 후에만 렌더.
  useEffect(() => setMounted(true), []);

  const tick = useCallback((startAt: number) => {
    posRef.current = (posRef.current + 1) % N;
    setPos(posRef.current);
    timerRef.current = window.setTimeout(
      () => tick(startAt),
      nextInterval(startAt, MODE_PARAMS[modeRef.current]),
    );
  }, []);

  const finalStop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stoppingRef.current = false;
    runningRef.current = false;

    const diff = signedDiff(posRef.current, targetRef.current);
    const ok = Math.abs(diff) <= 1; // 3칸 LED → 목표칸 ±1칸까지 성공

    setTries((value) => value + 1);
    if (ok) setWins((value) => value + 1);
    setLastDiff(diff);
    setStatus(ok ? "win" : "lose");

    const guide =
      diff > 1
        ? "조금 더 일찍 누르세요."
        : diff < -1
          ? "조금 더 늦게 누르세요."
          : "이 타이밍 유지!";
    setHint(`오차 ${diff}칸. ${guide}`);
  }, []);

  const startGame = useCallback(() => {
    clearTimers();
    stoppingRef.current = false;
    runningRef.current = true;
    posRef.current = Math.floor(Math.random() * N);
    setPos(posRef.current);
    setStatus("running");
    setHint("목표보다 살짝 전에 STOP!");
    const startAt = performance.now();
    timerRef.current = window.setTimeout(() => tick(startAt), 80);
  }, [clearTimers, tick]);

  const requestStop = useCallback(() => {
    if (!runningRef.current || stoppingRef.current || timerRef.current === null) {
      return;
    }
    stoppingRef.current = true;
    setStatus("stopping");
    setHint("입력됨… 지연 후 정지합니다.");
    stopTimerRef.current = window.setTimeout(finalStop, delayRef.current);
  }, [finalStop]);

  // 스페이스바: 진행 중이면 STOP, 아니면 START
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (runningRef.current && !stoppingRef.current) {
        requestStop();
      } else if (!runningRef.current) {
        startGame();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestStop, startGame]);

  const rate = tries > 0 ? Math.round((wins / tries) * 100) : 0;

  const msg =
    status === "idle"
      ? "START를 누르세요"
      : status === "running"
        ? "돌아가는 중…"
        : status === "stopping"
          ? "입력됨… 지연 후 정지"
          : status === "win"
            ? "🎉 성공!"
            : "실패";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 안내 메시지 */}
      <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 text-center shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
        <p
          className={cn(
            "text-xl font-extrabold tracking-[-0.02em]",
            status === "win"
              ? "text-[var(--buyer-success)]"
              : status === "lose"
                ? "text-[var(--buyer-danger)]"
                : "text-[var(--buyer-dark)]",
          )}
        >
          {msg}
        </p>
        <p className="mt-1 min-h-[20px] text-[13px] leading-5 text-[var(--buyer-muted)]">
          {hint}
        </p>
      </section>

      {/* LED 링 보드 (어두운 아케이드 톤) */}
      <section className="flex justify-center rounded-[26px] border border-[var(--buyer-border)] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
        <div
          className="relative w-full max-w-[340px] overflow-hidden rounded-[24px] p-4"
          style={{
            background: "radial-gradient(circle at top, #202431, #0f1014 55%)",
          }}
        >
          <div
            className="relative mx-auto"
            style={{ width: BOX, height: BOX, maxWidth: "100%", aspectRatio: "1 / 1" }}
          >
            {/* SVG 비율 유지용 래퍼 — 좌표는 BOX 기준, 컨테이너 폭에 맞춰 스케일 */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "10px solid #555968",
                background:
                  "radial-gradient(circle, #181a22 0 44%, #101118 45% 100%)",
                boxShadow:
                  "inset 0 0 25px rgba(0,0,0,.8), 0 8px 28px rgba(0,0,0,.45)",
              }}
            />
            {mounted &&
              coords.map((coord, i) => {
              const isTarget = i === target;
              const isHead = i === pos && status !== "idle";
              const isTail =
                status !== "idle" &&
                (i === (pos - 1 + N) % N || i === (pos - 2 + N) % N);

              let background = "#373a46";
              let boxShadow = "inset 0 0 4px rgba(0,0,0,.8)";

              if (isTarget && isHead) {
                background = "#ff6a00";
                boxShadow = "0 0 16px #ff6a00, 0 0 32px rgba(255,80,0,.85)";
              } else if (isTarget) {
                background = "#ffd900";
                boxShadow = "0 0 14px #ffd900, 0 0 25px rgba(255,217,0,.55)";
              } else if (isHead) {
                background = "#ff2727";
                boxShadow =
                  "0 0 12px #ff2727, 0 0 24px rgba(255,39,39,.75), inset 0 0 3px #fff";
              } else if (isTail) {
                background = "#b31515";
                boxShadow = "0 0 7px rgba(255,39,39,.8)";
              }

              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className="absolute rounded-full"
                  style={{
                    width: `${(LIGHT / BOX) * 100}%`,
                    height: `${(LIGHT / BOX) * 100}%`,
                    left: `${(coord.left / BOX) * 100}%`,
                    top: `${(coord.top / BOX) * 100}%`,
                    background,
                    boxShadow,
                  }}
                />
              );
            })}
            <div
              className="absolute flex items-center justify-center rounded-full text-[12px]"
              style={{
                inset: "36%",
                color: "#d5d8e5",
                background: "#222633",
                border: "1px solid rgba(255,255,255,.1)",
              }}
            >
              TARGET
            </div>
          </div>
        </div>
      </section>

      {/* START / STOP */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={startGame}
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-[var(--buyer-primary)] text-lg font-bold text-white shadow-[0_14px_28px_rgba(31,78,121,0.22)] transition hover:bg-[var(--buyer-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
        >
          START
        </button>
        <button
          type="button"
          onClick={requestStop}
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-[var(--buyer-danger)] text-xl font-extrabold text-white shadow-[0_14px_28px_rgba(239,68,68,0.28)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-danger)] focus-visible:ring-offset-2"
        >
          STOP
        </button>
      </section>
      <p className="-mt-2 text-center text-[11px] text-[var(--buyer-muted)]">
        PC에서는 스페이스바로 START/STOP 할 수 있어요.
      </p>

      {/* 통계 */}
      <section className="grid grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="시도" value={`${tries}`} />
        <StatCard label="성공" value={`${wins}`} />
        <StatCard label="성공률" value={`${rate}%`} />
        <StatCard label="오차" value={lastDiff === null ? "-" : `${lastDiff}칸`} />
      </section>

      {/* 설정 */}
      <section className="space-y-4 rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
            난이도
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {(Object.keys(MODE_PARAMS) as Mode[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={cn(
                  "h-10 rounded-xl border text-sm font-semibold transition",
                  mode === key
                    ? "border-[var(--buyer-primary)] bg-[var(--buyer-softest)] text-[var(--buyer-primary)]"
                    : "border-[var(--buyer-border)] bg-white text-[var(--buyer-dark)] hover:bg-[var(--buyer-softest)]",
                )}
              >
                {MODE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
              입력 지연
            </p>
            <span className="text-sm font-bold text-[var(--buyer-dark)]">
              {delay}ms
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={600}
            step={20}
            value={delay}
            onChange={(event) => setDelay(Number(event.target.value))}
            className="mt-2 w-full accent-[var(--buyer-primary)]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--buyer-muted)]">
            STOP을 눌러도 바로 멈추지 않고 이 시간만큼 더 이동해요. 목표보다 몇
            칸 전에 눌러야 하는지 감 잡는 용도예요.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
            목표 위치
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {TARGETS.map((item) => (
              <button
                key={item.idx}
                type="button"
                onClick={() => setTarget(item.idx)}
                className={cn(
                  "h-10 rounded-xl border text-sm font-semibold transition",
                  target === item.idx
                    ? "border-[var(--buyer-primary)] bg-[var(--buyer-softest)] text-[var(--buyer-primary)]"
                    : "border-[var(--buyer-border)] bg-white text-[var(--buyer-dark)] hover:bg-[var(--buyer-softest)]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--buyer-border)] bg-white p-3 text-center shadow-sm">
      <strong className="block text-[20px] font-extrabold tracking-[-0.03em] text-[var(--buyer-dark)]">
        {value}
      </strong>
      <span className="mt-0.5 block text-[11px] text-[var(--buyer-muted)]">
        {label}
      </span>
    </div>
  );
}
