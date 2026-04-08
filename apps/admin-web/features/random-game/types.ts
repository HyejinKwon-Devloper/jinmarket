import type { EventRegistrationMode } from "@jinmarket/shared";

export type ScreenStep = "start" | "setup" | "game" | "result";
export type ResultRevealMode = "hidden" | "visible";

export type MessageTone = "info" | "success" | "warning" | "error";

export type StatusMessage = {
  tone: MessageTone;
  title: string;
  description: string;
};

export type Participant = {
  id: string;
  name: string;
  normalizedName: string;
};

export type ImportReport = {
  added: number;
  skippedDuplicates: string[];
  skippedEmpty: number;
};

export type DrawPlan = {
  winners: Participant[];
  shuffledParticipants: Participant[];
  drawnAt: string;
};

export type FoodItem = {
  id: string;
  x: number;
  y: number;
  size: number;
  hue: number;
  sparkleOffset: number;
};

export type GameSession = {
  id: string;
  drawPlan: DrawPlan;
  foodItems: FoodItem[];
  threshold: number;
  totalFoodCount: number;
  revealMode: ResultRevealMode;
};

export type DrawSessionRequest = {
  participantNames?: string[];
  eventId?: string;
  winnerCount: number;
  revealMode: ResultRevealMode;
};

export type DrawSessionResponse = {
  session: GameSession;
};

export type ParticipantSourceContext =
  | {
      kind: "manual";
      eventTitle?: string | null;
      sellerDisplayName?: string | null;
    }
  | {
      kind: "event";
      eventId: string;
      eventTitle: string;
      sellerDisplayName: string;
      registrationMode: EventRegistrationMode;
      locked: true;
      entryCount: number;
    };

export type EventDrawSourcePayload = {
  eventId: string;
  eventTitle: string;
  sellerDisplayName: string;
  registrationMode: EventRegistrationMode;
  participants: Array<{
    id: string;
    name: string;
  }>;
};
