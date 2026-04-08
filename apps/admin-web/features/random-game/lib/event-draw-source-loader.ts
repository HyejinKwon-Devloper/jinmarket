import { NextRequest } from "next/server";

import { GET as proxyGet } from "../../../app/api/[...path]/route";

type ProxyRouteContext = {
  params: Promise<{ path: string[] }>;
};

type ProxyInvoker = (
  request: NextRequest,
  context: ProxyRouteContext,
) => Promise<Response>;

let activeProxyInvoker: ProxyInvoker = proxyGet;

export function setEventDrawSourceProxyInvokerForTests(invoker: ProxyInvoker) {
  activeProxyInvoker = invoker;
}

export function resetEventDrawSourceProxyInvokerForTests() {
  activeProxyInvoker = proxyGet;
}

export async function loadEventDrawSourceThroughAdminProxy(
  request: NextRequest,
  eventId: string,
) {
  const proxyRequest = new NextRequest(
    new URL(`/api/admin/events/${encodeURIComponent(eventId)}/draw-source`, request.url),
    {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    },
  );

  return activeProxyInvoker(proxyRequest, {
    params: Promise.resolve({
      path: ["admin", "events", eventId, "draw-source"],
    }),
  });
}
