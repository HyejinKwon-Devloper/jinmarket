"use client";

import { useId, useState } from "react";

type AnonymousRegistrationFieldProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  helperText?: string;
};

export function AnonymousRegistrationField({
  checked,
  onChange,
  disabled = false,
  helperText
}: AnonymousRegistrationFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogId = useId();

  return (
    <div className="field anonymousInfoField">
      <div className="anonymousFieldHeader">
        <label className="anonymousToggleLabel">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          익명 등록
        </label>
        <button
          type="button"
          className="infoIconButton"
          aria-label="익명 등록 안내 보기"
          aria-expanded={isOpen}
          aria-controls={dialogId}
          onClick={() => setIsOpen((value) => !value)}
        >
          i
        </button>
      </div>
      {helperText ? <p className="muted">{helperText}</p> : null}
      {isOpen ? (
        <div className="infoPopover" id={dialogId} role="dialog" aria-modal="false">
          익명등록을 하시더라도 판매하시려면 dm 등 직접 연락을 통해 판매하셔야 합니다.
        </div>
      ) : null}
    </div>
  );
}
