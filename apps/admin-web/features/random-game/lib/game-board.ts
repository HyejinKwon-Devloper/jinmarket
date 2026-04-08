import type {
  DrawPlan,
  FoodItem,
  GameSession,
  ResultRevealMode,
} from "../types";

const foodHues = [28, 42, 56, 170, 196, 328];

function distanceBetween(
  first: Pick<FoodItem, "x" | "y">,
  second: Pick<FoodItem, "x" | "y">,
) {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function createFoodItems(count: number) {
  const items: FoodItem[] = [];
  let attempt = 0;

  while (items.length < count && attempt < count * 80) {
    attempt += 1;

    const size = 0.85 + Math.random() * 0.4;
    const candidate: FoodItem = {
      id: crypto.randomUUID(),
      x: 0.12 + Math.random() * 0.76,
      y: 0.14 + Math.random() * 0.72,
      size,
      hue: foodHues[items.length % foodHues.length],
      sparkleOffset: Math.random() * Math.PI * 2,
    };

    const overlaps = items.some((item) => {
      const minimumDistance = 0.09 + (item.size + candidate.size) * 0.028;
      return distanceBetween(item, candidate) < minimumDistance;
    });

    if (!overlaps) {
      items.push(candidate);
    }
  }

  let fallbackIndex = 0;

  while (items.length < count) {
    const column = fallbackIndex % 4;
    const row = Math.floor(fallbackIndex / 4);

    items.push({
      id: crypto.randomUUID(),
      x: 0.18 + column * 0.19,
      y: 0.2 + row * 0.14,
      size: 1,
      hue: foodHues[(items.length + fallbackIndex) % foodHues.length],
      sparkleOffset: Math.random() * Math.PI * 2,
    });
    fallbackIndex += 1;
  }

  return items;
}

export function createGameSession(
  drawPlan: DrawPlan,
  participantCount: number,
  winnerCount: number,
  revealMode: ResultRevealMode,
): GameSession {
  const totalFoodCount = Math.min(
    18,
    Math.max(8, winnerCount * 4 + Math.ceil(Math.log2(participantCount + 1))),
  );
  const threshold = Math.min(totalFoodCount, Math.max(5, winnerCount * 3 + 2));

  return {
    id: crypto.randomUUID(),
    drawPlan,
    foodItems: createFoodItems(totalFoodCount),
    threshold,
    totalFoodCount,
    revealMode,
  };
}
