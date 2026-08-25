import { Agent, fetch as guardedFetch } from "undici";

import { readBoundedRequestText } from "@/lib/server/bounded-request-body";

import { createGuardedLookup, defaultDnsResolver } from "./public";

export async function sendGuardedHttpRequest(
  request: Request,
  maximumResponseBytes = 64 * 1024,
): Promise<Response> {
  const dispatcher = new Agent({
    connect: { lookup: createGuardedLookup(defaultDnsResolver) },
  });
  try {
    const upstream = await guardedFetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: await request.text() }),
      redirect: "manual",
      signal: request.signal,
      dispatcher,
    });
    const body = await readBoundedRequestText(upstream, maximumResponseBytes);
    return new Response(body.ok ? body.text : null, {
      status: body.ok ? upstream.status : 413,
      headers: body.ok
        ? Object.fromEntries(upstream.headers.entries())
        : {
            "content-type": "text/plain",
            "x-ae-probe-outcome": "response_too_large",
          },
    });
  } finally {
    await dispatcher.close().catch(() => undefined);
  }
}
