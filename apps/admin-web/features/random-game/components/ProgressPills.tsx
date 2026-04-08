import type { ScreenStep } from "../types";

const steps: Array<{ id: ScreenStep; label: string }> = [
  { id: "start", label: "Start" },
  { id: "setup", label: "Setup" },
  { id: "game", label: "Play" },
  { id: "result", label: "Reveal" },
];

export function ProgressPills({ currentStep }: { currentStep: ScreenStep }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStep;
        const isComplete = currentIndex > index;

        return (
          <div
            key={step.id}
            data-testid={`progress-pill-${step.id}`}
            className={`inline-flex min-w-0 flex-1 basis-0 items-center justify-center rounded-full border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition sm:px-3 sm:text-xs sm:tracking-[0.18em] ${
              isCurrent
                ? "border-white/70 bg-white text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.2)]"
                : isComplete
                  ? "border-emerald-200/70 bg-emerald-200/18 text-emerald-50"
                  : "border-white/12 bg-white/6 text-white/60"
            }`}
          >
            <span className="truncate whitespace-nowrap">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
