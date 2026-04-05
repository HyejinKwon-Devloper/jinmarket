import type { GameChoice, GameResult } from "@jinmarket/shared";

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

