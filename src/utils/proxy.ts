// Shared CORS proxy client. Requests are sent to the local Docker proxy, which
// forwards them to the real target named in the x-target-url header.
export const LOCAL_PROXY_URL = "http://localhost:9876";

export async function proxyFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("x-target-url", url);

  return fetch(LOCAL_PROXY_URL, {
    ...options,
    headers,
  });
}
