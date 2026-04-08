import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

import type { NextRequest } from "next/server";

const apiProxyTarget = (
  process.env.API_PROXY_TARGET ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://server-six-sepia-69.vercel.app"
    : "https://jinmarket.test:4100")
).replace(/\/+$/, "");

const allowInsecureLocalTls =
  process.env.NODE_ENV !== "production" &&
  /^https:\/\/(127\.0\.0\.1|localhost|jinmarket\.test)(:\d+)?$/i.test(apiProxyTarget);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function buildTargetUrl(path: string[], request: NextRequest) {
  const target = new URL(`${apiProxyTarget}/${path.join("/")}`);
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
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<{
    statusCode: number;
    statusMessage: string;
    headers: IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const upstreamRequest = transport(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: request.method,
        headers: requestHeaders,
        rejectUnauthorized: !allowInsecureLocalTls
      },
      (upstreamResponse) => {
        const chunks: Buffer[] = [];

        upstreamResponse.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        upstreamResponse.on("end", () => {
          resolve({
            statusCode: upstreamResponse.statusCode ?? 502,
            statusMessage: upstreamResponse.statusMessage ?? "Bad Gateway",
            headers: upstreamResponse.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );

    upstreamRequest.on("error", reject);

    if (requestBody) {
      upstreamRequest.write(requestBody);
    }

    upstreamRequest.end();
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
