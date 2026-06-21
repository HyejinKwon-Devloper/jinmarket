import type { IncomingHttpHeaders } from "node:http";
import type { NextRequest } from "next/server";

import {
  getApiProxyTarget,
  sendNodeRequest,
} from "../../../lib/proxy-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function buildTargetUrl(path: string[], request: NextRequest) {
  const target = new URL(`${getApiProxyTarget()}/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target;
}

function applyResponseHeaders(headers: Headers, upstreamHeaders: IncomingHttpHeaders) {
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      headers.delete(key);
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, value);
  }
}

async function sendProxyRequest(request: NextRequest, target: URL) {
  const requestHeaders = Object.fromEntries(new Headers(request.headers).entries());
  delete requestHeaders.host;
  delete requestHeaders["content-length"];

  const requestBody =
    request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());

  return sendNodeRequest({
    target,
    method: request.method,
    headers: requestHeaders,
    body: requestBody,
  });
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = buildTargetUrl(path, request);
  const upstream = await sendProxyRequest(request, target);
  const responseHeaders = new Headers();
  applyResponseHeaders(responseHeaders, upstream.headers);

  const responseBody = upstream.body.length > 0 ? new Uint8Array(upstream.body) : null;

  return new Response(responseBody, {
    status: upstream.statusCode,
    statusText: upstream.statusMessage,
    headers: responseHeaders
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
