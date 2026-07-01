// Shared CORS proxy client. Requests are sent to the local Docker proxy, which
// forwards them to the real target named in the x-target-url header.
export const LOCAL_PROXY_URL = "http://localhost:9876";

// Built when the proxy itself is unreachable (Docker proxy not running, DNS
// failure, connection refused, etc.). fetch() rejects in those cases, which
// would otherwise bubble up and freeze whichever flow is awaiting it. Instead
// we return a normal-looking failed Response so every caller's existing
// `response.ok` / `response.json()` handling degrades gracefully. The message
// is duplicated across the fields the various API error parsers read.
function networkErrorResponse(message: string): Response {
  const body = JSON.stringify({
    message,
    errorMessages: [message],
    errors: [{ message }],
  });
  return new Response(body, {
    status: 503,
    statusText: "Proxy unreachable",
    headers: { "content-type": "application/json" },
  });
}

export async function proxyFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("x-target-url", url);

  try {
    return await fetch(LOCAL_PROXY_URL, {
      ...options,
      headers,
    });
  } catch {
    return networkErrorResponse(
      `Could not reach the local proxy at ${LOCAL_PROXY_URL}. ` +
        `Make sure the Docker proxy is running.`
    );
  }
}
