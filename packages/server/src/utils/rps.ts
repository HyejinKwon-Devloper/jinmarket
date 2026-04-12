import {
  GAME_PURCHASE_MAX_DECISIVE_ROUNDS,
  GAME_PURCHASE_REQUIRED_WINS,
  type GameAttemptRecord,
  type GameChoice,
  type GamePurchaseProgress,
  type GameResult
} from "@jinmarket/shared";

const choices: GameChoice[] = ["ROCK", "PAPER", "SCISSORS"];

export function randomChoice(): GameChoice {
  return choices[Math.floor(Math.random() * choices.length)];
}

export function decideRpsResult(playerChoice: GameChoice, systemChoice: GameChoice): GameResult {
  if (playerChoice === systemChoice) {
    return "DRAW";
  }

  if (
    (playerChoice === "ROCK" && systemChoice === "SCISSORS") ||
    (playerChoice === "PAPER" && systemChoice === "ROCK") ||
    (playerChoice === "SCISSORS" && systemChoice === "PAPER")
  ) {
    return "WIN";
  }

  return "LOSE";
}

export function summarizeGamePurchaseSeries(
  attempts: Pick<GameAttemptRecord, "result">[]
): GamePurchaseProgress {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const attempt of attempts) {
    if (attempt.result === "WIN") {
      wins += 1;
      continue;
    }

    if (attempt.result === "LOSE") {
      losses += 1;
      continue;
    }

    draws += 1;
  }

  const decisiveRounds = wins + losses;
  const isComplete =
    wins >= GAME_PURCHASE_REQUIRED_WINS ||
    losses >= GAME_PURCHASE_REQUIRED_WINS ||
    decisiveRounds >= GAME_PURCHASE_MAX_DECISIVE_ROUNDS;

  return {
    wins,
    losses,
    draws,
    totalRounds: attempts.length,
    decisiveRounds,
    targetWins: GAME_PURCHASE_REQUIRED_WINS,
    maxDecisiveRounds: GAME_PURCHASE_MAX_DECISIVE_ROUNDS,
    isComplete,
    canContinue: !isComplete
  };
}
