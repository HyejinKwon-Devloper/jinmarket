import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest, NextResponse } from "next/server";

import { POST } from "../../../app/api/random-game/draw/route";
import { buildEventDrawSourceUrl } from "./draw-route-url";
import {
  resetEventDrawSourceProxyInvokerForTests,
  setEventDrawSourceProxyInvokerForTests,
} from "./event-draw-source-loader";

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
  setEventDrawSourceProxyInvokerForTests(async (proxyRequest, context) => {
    assert.match(proxyRequest.url, /\/api\/admin\/events\/event-1\/draw-source$/);
    assert.deepEqual(await context.params, {
      path: ["admin", "events", "event-1", "draw-source"],
    });

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
  });

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
    resetEventDrawSourceProxyInvokerForTests();
  }
});

test("draw-source URL helper builds a same-origin proxy URL", () => {
  const request = createRequest({
    eventId: "event local/1",
    winnerCount: 1,
    revealMode: "hidden",
  });

  const target = buildEventDrawSourceUrl({
    requestUrl: request.url,
    eventId: "event local/1",
    apiBaseUrl: "https://api.example.com",
    preferSameOriginProxy: true,
  });

  assert.equal(
    target.toString(),
    "http://localhost:3001/api/admin/events/event%20local%2F1/draw-source",
  );
});

test("draw-source URL helper can resolve directly against the backend API", () => {
  const request = createRequest({
    eventId: "event/prod",
    winnerCount: 1,
    revealMode: "hidden",
  });

  const target = buildEventDrawSourceUrl({
    requestUrl: request.url,
    eventId: "event/prod",
    apiBaseUrl: "https://api.jinmarket.test",
    preferSameOriginProxy: false,
  });

  assert.equal(
    target.toString(),
    "https://api.jinmarket.test/admin/events/event%2Fprod/draw-source",
  );
});

test("draw API surfaces event draw-source fetch failures", async () => {
  setEventDrawSourceProxyInvokerForTests(async () =>
    NextResponse.json(
      { message: "draw source unavailable" },
      {
        status: 503,
      },
    ));

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
    resetEventDrawSourceProxyInvokerForTests();
  }
});

test("draw API returns a 502 when the draw-source request cannot reach the backend", async () => {
  setEventDrawSourceProxyInvokerForTests(async () => {
    throw new TypeError("fetch failed");
  });

  try {
    const request = createRequest({
      eventId: "event-3",
      winnerCount: 1,
      revealMode: "hidden",
    });

    const response = await POST(request);
    const payload = (await response.json()) as { message?: string };

    assert.equal(response.status, 502);
    assert.equal(typeof payload.message, "string");
  } finally {
    resetEventDrawSourceProxyInvokerForTests();
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
