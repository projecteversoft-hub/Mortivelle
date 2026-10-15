/** Extracts a single cookie's value from a response's raw Set-Cookie header lines. */
export function parseCookie(
  setCookieHeaders: string[] | undefined,
  name: string,
): string | undefined {
  if (!setCookieHeaders) return undefined;
  for (const line of setCookieHeaders) {
    const [pair] = line.split(';');
    const [cookieName, ...rest] = (pair ?? '').split('=');
    if (cookieName?.trim() === name) {
      return rest.join('=');
    }
  }
  return undefined;
}
