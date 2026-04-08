import assert from "node:assert/strict";
import test from "node:test";

import { drawWinners, fisherYatesShuffle } from "./draw";
import type { Participant } from "../types";

function createParticipants(names: string[]): Participant[] {
  return names.map((name, index) => ({
    id: `participant-${index + 1}`,
    name,
    normalizedName: name.toLowerCase(),
  }));
}

function createRandomIndexFromSequence(sequence: number[]) {
  const calls: number[] = [];
  let index = 0;

  return {
    randomIndex(maxExclusive: number) {
      calls.push(maxExclusive);

      const value = sequence[index];
      index += 1;

      assert.notEqual(
        value,
        undefined,
        "expected enough random sequence values for the shuffle",
      );
      assert.ok(
        value >= 0 && value < maxExclusive,
        `random index ${value} must be within 0..${maxExclusive - 1}`,
      );

      return value;
    },
    getCalls() {
      return calls;
    },
  };
}

test("fisherYatesShuffle returns a new array and does not mutate the input", () => {
  const original = ["A", "B", "C", "D"];
  const { randomIndex } = createRandomIndexFromSequence([1, 0, 0]);

  const shuffled = fisherYatesShuffle(original, randomIndex);

  assert.deepEqual(original, ["A", "B", "C", "D"]);
  assert.deepEqual(shuffled, ["D", "C", "A", "B"]);
  assert.notStrictEqual(shuffled, original);
});

test("drawWinners returns the expected deterministic winners with an injected random source", () => {
  const participants = createParticipants(["Mina", "Jisoo", "Noah", "Luca"]);
  const sequence = createRandomIndexFromSequence([1, 0, 0]);

  const plan = drawWinners(participants, 2, sequence.randomIndex);

  assert.deepEqual(
    sequence.getCalls(),
    [4, 3, 2],
    "shuffle should request a bounded random index for each swap step",
  );
  assert.deepEqual(
    plan.winners.map((participant) => participant.name),
    ["Luca", "Noah"],
  );
  assert.deepEqual(
    plan.shuffledParticipants.map((participant) => participant.name),
    ["Luca", "Noah", "Mina", "Jisoo"],
  );
  assert.ok(
    !Number.isNaN(Date.parse(plan.drawnAt)),
    "drawnAt should be a valid ISO timestamp",
  );
});

test("drawWinners never returns duplicate winners in repeated random draws", () => {
  const participants = createParticipants([
    "Ari",
    "Bora",
    "Cody",
    "Dani",
    "Evan",
    "Faye",
  ]);

  for (let iteration = 0; iteration < 250; iteration += 1) {
    const plan = drawWinners(participants, 3);
    const winnerIds = plan.winners.map((participant) => participant.id);
    const uniqueWinnerIds = new Set(winnerIds);

    assert.equal(plan.winners.length, 3);
    assert.equal(uniqueWinnerIds.size, 3);
    assert.ok(
      plan.winners.every((participant) =>
        participants.some((candidate) => candidate.id === participant.id),
      ),
    );
  }
});

test("drawWinners returns the full pool when winner count equals participant count", () => {
  const participants = createParticipants(["Ari", "Bora", "Cody"]);

  const plan = drawWinners(participants, participants.length);

  assert.equal(plan.winners.length, participants.length);
  assert.equal(plan.shuffledParticipants.length, participants.length);
  assert.deepEqual(
    [...plan.winners].sort((left, right) => left.id.localeCompare(right.id)),
    [...participants].sort((left, right) => left.id.localeCompare(right.id)),
  );
});

test("drawWinners rejects empty participant pools", () => {
  assert.throws(
    () => drawWinners([], 1),
    /At least one participant is required\./,
  );
});

test("drawWinners rejects invalid winner counts", () => {
  const participants = createParticipants(["Ari", "Bora"]);

  assert.throws(
    () => drawWinners(participants, 0),
    /Winner count must be a positive integer\./,
  );
  assert.throws(
    () => drawWinners(participants, 3),
    /Winner count cannot exceed participant count\./,
  );
  assert.throws(
    () => drawWinners(participants, Number.NaN),
    /Winner count must be a positive integer\./,
  );
});
