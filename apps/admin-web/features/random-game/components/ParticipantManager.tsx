"use client";

import { useState } from "react";

import type {
  ImportReport,
  Participant,
  ParticipantSourceContext,
} from "../types";

type ParticipantManagerProps = {
  participants: Participant[];
  participantSource: ParticipantSourceContext | null;
  readOnly?: boolean;
  lastImportReport: ImportReport | null;
  onAddParticipant: (name: string) => ImportReport;
  onBulkAddParticipants: (bulkText: string) => ImportReport;
  onLoadSamples: () => ImportReport;
  onRemoveParticipant: (participantId: string) => void;
};

function participantSourceTitle(source: ParticipantSourceContext | null) {
  if (!source) {
    return "현장 참가자 입력";
  }

  if (source.kind === "event") {
    return `${source.eventTitle} 응모자 리스트`;
  }

  if (source.eventTitle) {
    return `${source.eventTitle} 참가자 등록`;
  }

  return "현장 참가자 입력";
}

function participantSourceDescription(source: ParticipantSourceContext | null) {
  if (!source) {
    return "직접 추가하거나 한 줄씩 붙여 넣어서 참가자 풀을 정리해 보세요.";
  }

  if (source.kind === "event") {
    return "구매자 사이트에서 응모한 리스트를 그대로 보여줘요. 이 화면에서는 수정되지 않아요.";
  }

  if (source.eventTitle) {
    return "이 이벤트는 현장 접수자나 별도 명단을 직접 입력해 추첨하는 방식이에요.";
  }

  return "이름을 직접 입력하거나 여러 줄로 붙여 넣어서 참가자를 준비할 수 있어요.";
}

export function ParticipantManager({
  participants,
  participantSource,
  readOnly = false,
  lastImportReport,
  onAddParticipant,
  onBulkAddParticipants,
  onLoadSamples,
  onRemoveParticipant,
}: ParticipantManagerProps) {
  const [manualName, setManualName] = useState("");
  const [bulkText, setBulkText] = useState("");

  function handleAddParticipant() {
    const report = onAddParticipant(manualName);

    if (report.added > 0) {
      setManualName("");
    }
  }

  function handleBulkAdd() {
    const report = onBulkAddParticipants(bulkText);

    if (report.added > 0) {
      setBulkText("");
    }
  }

  const hasImportSummary =
    !readOnly &&
    lastImportReport !== null &&
    (lastImportReport.added > 0 ||
      lastImportReport.skippedDuplicates.length > 0 ||
      lastImportReport.skippedEmpty > 0);

  const cardTitle = participantSourceTitle(participantSource);
  const cardDescription = participantSourceDescription(participantSource);

  return (
    <div
      data-testid="participant-manager"
      className="flex h-full min-h-0 flex-col rounded-[32px] border border-slate-200/70 bg-white/96 p-4 text-slate-950 shadow-[0_28px_80px_rgba(15,23,42,0.15)] sm:p-5"
    >
      <div className="shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-600">
              Participant Pool
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {cardTitle}
            </h2>
            <p className="mt-2 text-sm leading-5 text-slate-600 sm:leading-6">
              {cardDescription}
            </p>
          </div>

          {!readOnly ? (
            <button
              data-testid="participant-load-samples"
              type="button"
              onClick={onLoadSamples}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-sky-300 bg-sky-100 px-5 text-sm font-bold text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-200"
            >
              샘플 명단 채우기
            </button>
          ) : (
            <div className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700">
              Shop entry locked
            </div>
          )}
        </div>

        {readOnly ? (
          <div className="mt-4 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
            <p className="font-black">응모자 원본 리스트를 사용해요.</p>
            <p className="mt-2">
              중복 이름이 있더라도 실제 응모 기록 기준으로 그대로 추첨해요.
              운영자는 이 화면에서 응모자를 수정하지 않고 바로 추첨 설정만
              진행하면 돼요.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">직접 추가</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  data-testid="participant-manual-input"
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddParticipant();
                    }
                  }}
                  className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-200 sm:text-base"
                  placeholder="예: 김하늘"
                />
                <button
                  data-testid="participant-add-button"
                  type="button"
                  onClick={handleAddParticipant}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  추가
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">여러 명 붙여 넣기</p>
              <textarea
                data-testid="participant-bulk-input"
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-200"
                placeholder={"김하늘\n박서준\n최유리"}
              />
              <button
                data-testid="participant-bulk-add-button"
                type="button"
                onClick={handleBulkAdd}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-100"
              >
                여러 명 한 번에 추가
              </button>
            </div>
          </div>
        )}

        {hasImportSummary ? (
          <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">최근 입력 요약</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 font-semibold">
                추가 {lastImportReport?.added ?? 0}
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold">
                중복 {lastImportReport?.skippedDuplicates.length ?? 0}
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold">
                빈 줄 {lastImportReport?.skippedEmpty ?? 0}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-[28px] border border-slate-200 bg-white p-4">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">현재 참가자</p>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              총 {participants.length}명이 준비되어 있어요.
              {readOnly
                ? " 응모자 리스트는 순서를 유지한 채 그대로 사용돼요."
                : " 같은 이름은 한 번만 목록에 남겨둘게요."}
            </p>
          </div>
          <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
            n = {participants.length}
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {participants.length === 0 ? (
            <div className="grid h-full min-h-32 place-items-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm leading-5 text-slate-500 sm:leading-6">
              {readOnly
                ? "아직 불러온 응모자 리스트가 없어요. 이벤트 상세 화면에서 다시 들어오거나 응모 상태를 확인해 주세요."
                : "아직 참가자가 없어요. 이름을 직접 입력하거나 샘플 명단을 불러와서 바로 테스트해 보세요."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {participants.map((participant, index) =>
                readOnly ? (
                  <div
                    key={participant.id}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 sm:px-4 sm:text-sm"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500">
                      {index + 1}
                    </span>
                    {participant.name}
                  </div>
                ) : (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => onRemoveParticipant(participant.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 sm:px-4 sm:text-sm"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500">
                      {index + 1}
                    </span>
                    {participant.name}
                    <span className="text-xs text-slate-400">삭제</span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
