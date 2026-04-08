"use client";

import { useEffect, useRef, useState } from "react";

import type { FoodItem } from "../types";
import { TouchJoystick } from "./TouchJoystick";

type RandomGameCanvasProps = {
  sessionId: string;
  foods: readonly FoodItem[];
  threshold: number;
  disabled?: boolean;
  onProgressChange: (eatenCount: number) => void;
  onThresholdReached: () => void;
};

type HeroState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tilt: number;
  facing: 1 | -1;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
) {
  const boardGradient = context.createLinearGradient(0, 0, width, height);
  boardGradient.addColorStop(0, "#101b43");
  boardGradient.addColorStop(0.58, "#0b1433");
  boardGradient.addColorStop(1, "#111d48");
  context.fillStyle = boardGradient;
  drawRoundedRect(context, 0, 0, width, height, 28);
  context.fill();

  context.save();
  context.globalAlpha = 0.22;

  for (let row = 1; row < 7; row += 1) {
    for (let column = 1; column < 6; column += 1) {
      const pulse = 0.22 + Math.sin(elapsed / 260 + row + column) * 0.08;
      const x = (width / 6) * column;
      const y = (height / 8) * row;
      const radius = 3.5 + ((row + column) % 2);

      const glow = context.createRadialGradient(x, y, 0, x, y, radius * 3.4);
      glow.addColorStop(0, "rgba(134, 239, 255, 0.9)");
      glow.addColorStop(0.45, "rgba(96, 165, 250, 0.28)");
      glow.addColorStop(1, "rgba(96, 165, 250, 0)");
      context.globalAlpha = pulse;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, radius * 3.4, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  drawRoundedRect(context, 6, 6, width - 12, height - 12, 24);
  context.stroke();
}

function drawFood(
  context: CanvasRenderingContext2D,
  food: FoodItem,
  width: number,
  height: number,
  elapsed: number,
) {
  const x = food.x * width;
  const y = food.y * height;
  const pulse = 1 + Math.sin(elapsed / 190 + food.sparkleOffset) * 0.12;
  const radius = 8.5 * food.size * pulse;
  const hue = food.hue;

  context.save();
  context.translate(x, y);

  const glow = context.createRadialGradient(
    -radius * 0.3,
    -radius * 0.35,
    radius * 0.18,
    0,
    0,
    radius * 2.2,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.98)");
  glow.addColorStop(0.28, `hsla(${hue}, 100%, 78%, 0.95)`);
  glow.addColorStop(0.72, `hsla(${hue}, 92%, 60%, 0.48)`);
  glow.addColorStop(1, `hsla(${hue}, 92%, 60%, 0)`);
  context.shadowBlur = 24;
  context.shadowColor = `hsla(${hue}, 100%, 72%, 0.45)`;
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, radius * 2, 0, Math.PI * 2);
  context.fill();

  context.shadowBlur = 0;
  const core = context.createRadialGradient(
    -radius * 0.24,
    -radius * 0.22,
    radius * 0.08,
    0,
    0,
    radius,
  );
  core.addColorStop(0, "rgba(255,255,255,0.96)");
  core.addColorStop(0.32, `hsla(${hue}, 100%, 80%, 0.98)`);
  core.addColorStop(1, `hsla(${hue}, 88%, 58%, 0.96)`);
  context.fillStyle = core;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 1.8;
  context.strokeStyle = "rgba(255,255,255,0.55)";
  context.stroke();

  context.strokeStyle = "rgba(255,255,255,0.82)";
  context.lineWidth = 1.6;
  context.beginPath();
  context.moveTo(-radius * 0.3, 0);
  context.lineTo(radius * 0.3, 0);
  context.moveTo(0, -radius * 0.3);
  context.lineTo(0, radius * 0.3);
  context.stroke();

  context.restore();
}

function drawFallbackHero(
  context: CanvasRenderingContext2D,
  hero: HeroState,
  radius: number,
) {
  context.save();
  context.translate(hero.x, hero.y);
  context.rotate(hero.tilt);
  context.scale(hero.facing, 1);

  const aura = context.createRadialGradient(0, -radius * 0.6, radius * 0.2, 0, 0, radius * 1.8);
  aura.addColorStop(0, "rgba(125,211,252,0.42)");
  aura.addColorStop(1, "rgba(125,211,252,0)");
  context.fillStyle = aura;
  context.beginPath();
  context.arc(0, 0, radius * 1.8, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#dbeafe";
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawHero(
  context: CanvasRenderingContext2D,
  hero: HeroState,
  radius: number,
  image: HTMLImageElement | null,
) {
  context.save();
  context.fillStyle = "rgba(2, 6, 23, 0.22)";
  context.beginPath();
  context.ellipse(
    hero.x,
    hero.y + radius * 1.22,
    radius * 0.92,
    radius * 0.34,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();

  if (!image) {
    drawFallbackHero(context, hero, radius);
    return;
  }

  const imageAspectRatio = image.naturalHeight / image.naturalWidth || 1.088;
  const width = radius * 3.55;
  const height = width * imageAspectRatio;

  context.save();
  context.translate(hero.x, hero.y + radius * 0.1);
  context.rotate(hero.tilt);
  context.scale(hero.facing, 1);

  const aura = context.createRadialGradient(0, -radius * 0.7, radius * 0.2, 0, 0, radius * 2);
  aura.addColorStop(0, "rgba(125,211,252,0.3)");
  aura.addColorStop(0.6, "rgba(125,211,252,0.12)");
  aura.addColorStop(1, "rgba(125,211,252,0)");
  context.fillStyle = aura;
  context.beginPath();
  context.arc(0, 0, radius * 1.85, 0, Math.PI * 2);
  context.fill();

  context.shadowBlur = 22;
  context.shadowColor = "rgba(15, 23, 42, 0.32)";
  context.drawImage(image, -width / 2, -height * 0.58, width, height);
  context.restore();
}

export function RandomGameCanvas({
  sessionId,
  foods,
  threshold,
  disabled = false,
  onProgressChange,
  onThresholdReached,
}: RandomGameCanvasProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const keyboardRef = useRef<Set<string>>(new Set());
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const foodsRef = useRef<FoodItem[]>([...foods]);
  const eatenCountRef = useRef(0);
  const thresholdTriggeredRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);
  const heroRef = useRef<HeroState>({
    x: 64,
    y: 180,
    vx: 0,
    vy: 0,
    tilt: 0,
    facing: 1,
  });
  const progressCallbackRef = useRef(onProgressChange);
  const thresholdCallbackRef = useRef(onThresholdReached);
  const [boardSize, setBoardSize] = useState({ width: 320, height: 430 });
  const [joystickActive, setJoystickActive] = useState(false);

  progressCallbackRef.current = onProgressChange;
  thresholdCallbackRef.current = onThresholdReached;

  useEffect(() => {
    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.src = "/random-game/giyu-cropped.png";

    const handleLoad = () => {
      if (cancelled) {
        return;
      }

      heroImageRef.current = image;
    };

    if (image.complete) {
      handleLoad();
    } else {
      image.onload = handleLoad;
    }

    return () => {
      cancelled = true;
      image.onload = null;

      if (heroImageRef.current === image) {
        heroImageRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const board = boardRef.current;

    if (!board) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextBounds = entries[0]?.contentRect;

      if (!nextBounds) {
        return;
      }

      setBoardSize({
        width: Math.max(280, Math.floor(nextBounds.width)),
        height: Math.max(360, Math.floor(nextBounds.height)),
      });
    });

    observer.observe(board);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const heroRadius = Math.max(28, boardSize.width * 0.074);
    const horizontalMargin = heroRadius * 1.55 + 12;
    const verticalMargin = heroRadius * 1.68 + 12;

    heroRef.current = {
      x: clamp(
        heroRef.current.x || boardSize.width * 0.18,
        horizontalMargin,
        boardSize.width - horizontalMargin,
      ),
      y: clamp(
        heroRef.current.y || boardSize.height * 0.5,
        verticalMargin,
        boardSize.height - verticalMargin,
      ),
      vx: 0,
      vy: 0,
      tilt: 0,
      facing: heroRef.current.facing,
    };
    lastTickRef.current = null;
  }, [boardSize.height, boardSize.width]);

  useEffect(() => {
    foodsRef.current = [...foods];
    eatenCountRef.current = 0;
    thresholdTriggeredRef.current = false;
    progressCallbackRef.current(0);
    heroRef.current = {
      x: boardSize.width * 0.18,
      y: boardSize.height * 0.5,
      vx: 0,
      vy: 0,
      tilt: 0,
      facing: 1,
    };
    lastTickRef.current = null;
  }, [boardSize.height, boardSize.width, foods, sessionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        ![
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "a",
          "s",
          "d",
        ].includes(event.key)
      ) {
        return;
      }

      event.preventDefault();
      keyboardRef.current.add(event.key.toLowerCase());
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keyboardRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    const renderFrame = (timestamp: number) => {
      const dpr = window.devicePixelRatio || 1;
      const expectedWidth = Math.floor(boardSize.width * dpr);
      const expectedHeight = Math.floor(boardSize.height * dpr);

      if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
        canvas.width = expectedWidth;
        canvas.height = expectedHeight;
        canvas.style.width = `${boardSize.width}px`;
        canvas.style.height = `${boardSize.height}px`;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, boardSize.width, boardSize.height);

      const previousTimestamp = lastTickRef.current ?? timestamp;
      const deltaSeconds = Math.min(0.032, (timestamp - previousTimestamp) / 1000);
      lastTickRef.current = timestamp;

      const hero = heroRef.current;
      const keys = keyboardRef.current;
      const keyboardX =
        (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
        (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
      const keyboardY =
        (keys.has("arrowdown") || keys.has("s") ? 1 : 0) -
        (keys.has("arrowup") || keys.has("w") ? 1 : 0);
      const keyboardMagnitude = Math.hypot(keyboardX, keyboardY);
      const activeInput =
        keyboardMagnitude > 0
          ? {
              x: keyboardX / keyboardMagnitude,
              y: keyboardY / keyboardMagnitude,
            }
          : joystickVectorRef.current;

      const inputMagnitude = disabled
        ? 0
        : Math.min(1, Math.hypot(activeInput.x, activeInput.y));
      const heroRadius = Math.max(28, boardSize.width * 0.074);
      const horizontalMargin = heroRadius * 1.55 + 12;
      const verticalMargin = heroRadius * 1.68 + 12;
      const moveSpeed = Math.min(boardSize.width, boardSize.height) * 0.82;
      const targetVelocityX = activeInput.x * moveSpeed * inputMagnitude;
      const targetVelocityY = activeInput.y * moveSpeed * inputMagnitude;

      hero.vx += (targetVelocityX - hero.vx) * Math.min(1, deltaSeconds * 8);
      hero.vy += (targetVelocityY - hero.vy) * Math.min(1, deltaSeconds * 8);
      hero.tilt += ((activeInput.x * 0.14) - hero.tilt) * Math.min(1, deltaSeconds * 9);

      hero.x = clamp(
        hero.x + hero.vx * deltaSeconds,
        horizontalMargin,
        boardSize.width - horizontalMargin,
      );
      hero.y = clamp(
        hero.y + hero.vy * deltaSeconds,
        verticalMargin,
        boardSize.height - verticalMargin,
      );

      if (hero.vx > 8) {
        hero.facing = 1;
      } else if (hero.vx < -8) {
        hero.facing = -1;
      }

      const remainingFoods: FoodItem[] = [];

      for (const food of foodsRef.current) {
        const foodX = food.x * boardSize.width;
        const foodY = food.y * boardSize.height;
        const collisionRadius = heroRadius * 0.72 + 9 * food.size;
        const distance = Math.hypot(hero.x - foodX, hero.y - foodY);

        if (!disabled && distance <= collisionRadius) {
          eatenCountRef.current += 1;
          progressCallbackRef.current(eatenCountRef.current);

          if (
            eatenCountRef.current >= threshold &&
            !thresholdTriggeredRef.current
          ) {
            thresholdTriggeredRef.current = true;
            thresholdCallbackRef.current();
          }

          continue;
        }

        remainingFoods.push(food);
      }

      foodsRef.current = remainingFoods;

      drawBoard(context, boardSize.width, boardSize.height, timestamp);
      foodsRef.current.forEach((food) =>
        drawFood(context, food, boardSize.width, boardSize.height, timestamp),
      );
      drawHero(context, hero, heroRadius, heroImageRef.current);

      frameRef.current = window.requestAnimationFrame(renderFrame);
    };

    frameRef.current = window.requestAnimationFrame(renderFrame);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [boardSize.height, boardSize.width, disabled, sessionId, threshold]);

  return (
    <div
      data-testid="game-canvas"
      className="relative aspect-[4/5] w-full"
      style={{ touchAction: "none" }}
    >
      <div ref={boardRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {!joystickActive ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/12 bg-slate-950/45 px-3 py-2 text-[11px] font-semibold text-white/80 backdrop-blur">
          조이스틱으로 캐릭터를 움직여 에너지 오브를 모아 보세요
        </div>
      ) : null}

      <TouchJoystick
        disabled={disabled}
        onActiveChange={setJoystickActive}
        onVectorChange={(vector) => {
          joystickVectorRef.current = vector;
        }}
      />
    </div>
  );
}
