"use client";

import Image from "next/image";

type LuckyMuncherProps = {
  className?: string;
  mood?: "happy" | "focus" | "surprised";
};

const moodImageClasses = {
  happy: "translate-y-0 rotate-0 scale-100",
  focus: "translate-y-1 -rotate-2 scale-[0.99]",
  surprised: "-translate-y-1 rotate-[1.5deg] scale-[1.04]",
};

const moodAuraClasses = {
  happy: "from-cyan-300/35 via-sky-300/20 to-fuchsia-300/30",
  focus: "from-emerald-300/28 via-cyan-300/16 to-sky-400/28",
  surprised: "from-amber-300/36 via-rose-300/20 to-pink-300/30",
};

export function LuckyMuncher({
  className,
  mood = "happy",
}: LuckyMuncherProps) {
  return (
    <div className={className} aria-hidden="true">
      <div className="relative mx-auto aspect-[1225/1333] w-full max-w-full select-none">
        <div
          className={`absolute inset-[12%] rounded-full bg-gradient-to-br blur-3xl ${moodAuraClasses[mood]}`}
        />
        <div className="absolute bottom-[5%] left-1/2 h-5 w-[40%] -translate-x-1/2 rounded-full bg-slate-950/20 blur-xl" />
        <div
          className={`absolute inset-0 transition-transform duration-300 ease-out ${moodImageClasses[mood]}`}
        >
          <Image
            src="/random-game/giyu-cropped.png"
            alt=""
            fill
            sizes="(max-width: 640px) 200px, 260px"
            className="object-contain drop-shadow-[0_22px_30px_rgba(15,23,42,0.28)]"
            priority={false}
          />
        </div>
      </div>
    </div>
  );
}
