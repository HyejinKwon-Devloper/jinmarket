import { Suspense } from "react";
import type { Metadata } from "next";

import { RandomGameApp } from "../../features/random-game/components/RandomGameApp";

export const metadata: Metadata = {
  title: "Random Game | Jinmarket Admin",
  description:
    "Mobile-friendly winner selection game for admin-hosted events.",
};

export default function RandomGamePage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100svh] place-items-center bg-[#071127] px-6 text-white">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/18 border-t-cyan-300" />
            <p className="mt-5 text-sm font-bold tracking-[0.18em] text-white/72">
              RANDOM GAME LOADING
            </p>
          </div>
        </div>
      }
    >
      <RandomGameApp />
    </Suspense>
  );
}
