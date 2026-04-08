import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest, NextResponse } from "next/server";

import { POST } from "../../../app/api/random-game/draw/route";

function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3001/api/random-game/draw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("draw API returns a server-generated session with unique winners", async () => {
  const request = createRequest({
    participantNames: ["Mina", "Jisoo", "Noah", "Luca", "Hana"],
    winnerCount: 2,
    revealMode: "hidden",
  });

  const response = await POST(request);
  const payload = (await response.json()) as {
    session: {
      revealMode: string;
      threshold: number;
      totalFoodCount: number;
      drawPlan: {
        winners: Array<{ id: string; name: string }>;
        shuffledParticipants: Array<{ id: string; name: string }>;
        drawnAt: string;
      };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.session.revealMode, "hidden");
  assert.equal(payload.session.drawPlan.winners.length, 2);
  assert.equal(payload.session.drawPlan.shuffledParticipants.length, 5);
  assert.ok(payload.session.totalFoodCount >= payload.session.threshold);
  assert.ok(!Number.isNaN(Date.parse(payload.session.drawPlan.drawnAt)));

  const winnerIds = payload.session.drawPlan.winners.map((winner) => winner.id);
  assert.equal(new Set(winnerIds).size, 2);
});

test("draw API keeps immediate reveal mode in the generated session", async () => {
  const request = createRequest({
    participantNames: ["Ari", "Bora", "Cody"],
    winnerCount: 1,
    revealMode: "visible",
  });

  const response = await POST(request);
  const payload = (await response.json()) as {
    session: {
      revealMode: string;
      drawPlan: {
        winners: Array<{ id: string }>;
      };
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.session.revealMode, "visible");
  assert.equal(payload.session.drawPlan.winners.length, 1);
});

test("draw API accepts event-based participants even when display names repeat", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    assert.match(url, /\/api\/admin\/events\/event-1\/draw-source$/);

    return NextResponse.json({
      item: {
        eventId: "event-1",
        eventTitle: "Spring Event",
        sellerDisplayName: "Seller Kim",
        registrationMode: "SHOP_ENTRY",
        participants: [
          { id: "entry-1", name: "Alex" },
          { id: "entry-2", name: "Alex" },
          { id: "entry-3", name: "Jamie" },
        ],
      },
    });
  };

  try {
    const request = createRequest({
      eventId: "event-1",
      winnerCount: 2,
      revealMode: "hidden",
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      session: {
        drawPlan: {
          shuffledParticipants: Array<{ id: string; name: string }>;
          winners: Array<{ id: string; name: string }>;
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.session.drawPlan.shuffledParticipants.length, 3);
    assert.equal(payload.session.drawPlan.winners.length, 2);
    assert.equal(
      payload.session.drawPlan.shuffledParticipants.filter(
        (participant) => participant.name === "Alex",
      ).length,
      2,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("draw API surfaces event draw-source fetch failures", async () => {
  const originalFetch = global.fetch;

  global.fetch = async () =>
    NextResponse.json(
      { message: "draw source unavailable" },
      {
        status: 503,
      },
    );

  try {
    const request = createRequest({
      eventId: "event-2",
      winnerCount: 1,
      revealMode: "hidden",
    });

    const response = await POST(request);
    const payload = (await response.json()) as { message?: string };

    assert.equal(response.status, 503);
    assert.equal(payload.message, "draw source unavailable");
  } finally {
    global.fetch = originalFetch;
  }
});

test("draw API rejects duplicate participant names", async () => {
  const request = createRequest({
    participantNames: ["Mina", "mina", "Noah"],
    winnerCount: 1,
    revealMode: "hidden",
  });

  const response = await POST(request);
  const payload = (await response.json()) as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(typeof payload.message, "string");
});

test("draw API rejects winner counts larger than participant count", async () => {
  const request = createRequest({
    participantNames: ["Ari", "Bora"],
    winnerCount: 3,
    revealMode: "hidden",
  });

  const response = await POST(request);
  const payload = (await response.json()) as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(typeof payload.message, "string");
});

test("draw API rejects malformed JSON bodies", async () => {
  const request = new NextRequest("http://localhost:3001/api/random-game/draw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{not-valid-json",
  });

  const response = await POST(request);
  const payload = (await response.json()) as { message?: string };

  assert.equal(response.status, 400);
  assert.equal(typeof payload.message, "string");
});
