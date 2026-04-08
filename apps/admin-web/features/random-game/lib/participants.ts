import type { ImportReport, Participant } from "../types";

const whitespacePattern = /\s+/g;

function formatName(value: string) {
  return value.trim().replace(whitespacePattern, " ");
}

export function normalizeParticipantName(value: string) {
  return formatName(value).toLocaleLowerCase("ko-KR");
}

function createParticipant(name: string): Participant {
  const formattedName = formatName(name);

  return {
    id: crypto.randomUUID(),
    name: formattedName,
    normalizedName: normalizeParticipantName(formattedName),
  };
}

export function appendParticipantNames(
  participants: readonly Participant[],
  rawNames: readonly string[],
) {
  const normalizedNames = new Set(
    participants.map((participant) => participant.normalizedName),
  );
  const additions: Participant[] = [];
  const report: ImportReport = {
    added: 0,
    skippedDuplicates: [],
    skippedEmpty: 0,
  };

  for (const rawName of rawNames) {
    const formattedName = formatName(rawName);

    if (!formattedName) {
      report.skippedEmpty += 1;
      continue;
    }

    const normalizedName = normalizeParticipantName(formattedName);

    if (normalizedNames.has(normalizedName)) {
      report.skippedDuplicates.push(formattedName);
      continue;
    }

    normalizedNames.add(normalizedName);
    additions.push(createParticipant(formattedName));
    report.added += 1;
  }

  return {
    participants: [...participants, ...additions],
    report,
  };
}

export function sanitizeWinnerCount(value: number, participantCount: number) {
  if (participantCount <= 1) {
    return 1;
  }

  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(participantCount, Math.max(1, Math.round(value)));
}
