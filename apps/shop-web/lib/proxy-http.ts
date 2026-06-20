import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

export const apiProxyTarget = (
  process.env.API_PROXY_TARGET ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://server-six-sepia-69.vercel.app"
    : "https://jinmarket.test:4000")
).replace(/\/+$/, "");

const allowInsecureLocalTls =
  process.env.NODE_ENV !== "production" &&
  /^https:\/\/(127\.0\.0\.1|localhost|jinmarket\.test)(:\d+)?$/i.test(apiProxyTarget);

export async function sendNodeRequest({
  target,
  method,
  headers,
  body,
}: {
  target: URL;
  method: string;
  headers?: Record<string, string>;
  body?: Buffer;
}) {
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
        method,
        headers,
        rejectUnauthorized: !allowInsecureLocalTls,
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
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    upstreamRequest.on("error", reject);

    if (body) {
      upstreamRequest.write(body);
    }

    upstreamRequest.end();
  });
}
