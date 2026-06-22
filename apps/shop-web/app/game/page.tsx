export const dynamic = "force-dynamic";

import type { Metadata } from "next";

import { GameHubPageClient } from "../../components/GameHubPageClient";
import { readCurrentUser } from "../../lib/server-api";

export const metadata: Metadata = {
  title: "미니게임 | JINMARKET",
  description:
    "타이밍 스톱 챌린지와 3연승 행운의 가위바위보를 칩 메뉴로 골라 즐길 수 있어요.",
};

export default async function GamePage() {
  const initialUser = await readCurrentUser();

  return <GameHubPageClient initialUser={initialUser} />;
}
