import type { DrawPlan, Participant } from "../types";

type RandomIndex = (maxExclusive: number) => number;

function defaultRandomIndex(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

export function fisherYatesShuffle<T>(
  values: readonly T[],
  randomIndex: RandomIndex = defaultRandomIndex,
) {
  const items = [...values];

  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

export function drawWinners(
  participants: readonly Participant[],
  winnerCount: number,
  randomIndex: RandomIndex = defaultRandomIndex,
): DrawPlan {
  if (participants.length === 0) {
    throw new Error("At least one participant is required.");
  }

  if (!Number.isInteger(winnerCount) || winnerCount < 1) {
    throw new Error("Winner count must be a positive integer.");
  }

  if (winnerCount > participants.length) {
    throw new Error("Winner count cannot exceed participant count.");
  }

  const shuffledParticipants = fisherYatesShuffle(participants, randomIndex);

  return {
    winners: shuffledParticipants.slice(0, winnerCount),
    shuffledParticipants,
    drawnAt: new Date().toISOString(),
  };
}
