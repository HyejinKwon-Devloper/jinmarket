"use client";

import { useState } from "react";

type Vector = {
  x: number;
  y: number;
};

type TouchJoystickProps = {
  disabled?: boolean;
  onVectorChange: (vector: Vector) => void;
  onActiveChange?: (active: boolean) => void;
};

const padRadius = 44;

function clampStick(deltaX: number, deltaY: number) {
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= padRadius) {
    return { x: deltaX, y: deltaY };
  }

  const scale = padRadius / distance;

  return {
    x: deltaX * scale,
    y: deltaY * scale,
  };
}

export function TouchJoystick({
  disabled = false,
  onVectorChange,
  onActiveChange,
}: TouchJoystickProps) {
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });

  function resetStick() {
    setKnobPosition({ x: 0, y: 0 });
    onVectorChange({ x: 0, y: 0 });
    onActiveChange?.(false);
  }

  function updateStickPosition(
    target: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) {
    const bounds = target.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const clamped = clampStick(clientX - centerX, clientY - centerY);

    setKnobPosition(clamped);
    onVectorChange({
      x: clamped.x / padRadius,
      y: clamped.y / padRadius,
    });
  }

  return (
    <div
      className="pointer-events-auto absolute flex flex-col items-end gap-2"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
      }}
    >
      <div className="rounded-full border border-white/15 bg-slate-950/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/75 backdrop-blur">
        Drag To Move
      </div>
      <div
        className={`relative h-28 w-28 rounded-full border backdrop-blur-sm ${
          disabled
            ? "border-white/10 bg-white/5 opacity-40"
            : "border-white/20 bg-white/10"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onActiveChange?.(true);
          updateStickPosition(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }

          event.preventDefault();
          updateStickPosition(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          resetStick();
        }}
        onPointerCancel={() => {
          resetStick();
        }}
        onLostPointerCapture={() => {
          resetStick();
        }}
      >
        <div className="absolute inset-4 rounded-full border border-white/12" />
        <div
          className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-yellow-200 via-orange-300 to-pink-400 shadow-[0_10px_24px_rgba(15,23,42,0.35)] transition-transform duration-75"
          style={{
            transform: `translate(calc(-50% + ${knobPosition.x}px), calc(-50% + ${knobPosition.y}px))`,
          }}
        />
      </div>
    </div>
  );
}
