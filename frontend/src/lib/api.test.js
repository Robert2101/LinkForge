import { beforeEach, describe, expect, it, vi } from "vitest";

// The api module keeps the session in module-level variables, so each test
// loads a fresh copy and gives it a fake fetch.

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadApi(fetchMock) {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {}); // no Web Locks in the test environment
  return import("./api.js");
}

beforeEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("turns an error response into an ApiError with field messages", async () => {
    const { api, ApiError } = await loadApi(
      vi.fn(async () =>
        json(422, {
          error: {
            code: "VALIDATION_FAILED",
            message: "Some fields are invalid",
            details: [{ field: "originalUrl", message: "Enter a public http:// or https:// address" }],
          },
        })
      )
    );

    const error = await api("/urls", { method: "POST", body: {} }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.fieldError("originalUrl")).toMatch(/public/);
    expect(error.fieldError("customAlias")).toBeUndefined();
  });

  it("reports a network failure in plain words", async () => {
    const { api } = await loadApi(vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("/urls")).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("refreshes an expired access token once and repeats the request", async () => {
    let currentToken = "token-1";
    const fetchMock = vi.fn(async (url, options) => {
      if (url.endsWith("/auth/login")) return json(200, { user: { id: "u1" }, accessToken: "token-1" });
      if (url.endsWith("/auth/refresh")) {
        currentToken = "token-2";
        return json(200, { user: { id: "u1" }, accessToken: "token-2" });
      }
      // A protected endpoint: only the newest token is accepted.
      return options.headers.Authorization === `Bearer ${currentToken}` && currentToken === "token-2"
        ? json(200, { items: [] })
        : json(401, { error: { code: "UNAUTHORIZED", message: "Session expired" } });
    });

    const { api, login } = await loadApi(fetchMock);
    await login({ email: "a@b.c", password: "x" });

    await expect(api("/urls")).resolves.toEqual({ items: [] });

    const calls = fetchMock.mock.calls.map(([url]) => url.replace("/api/v1", ""));
    expect(calls).toEqual(["/auth/login", "/urls", "/auth/refresh", "/urls"]);
  });

  it("shares one refresh between requests that fail at the same time", async () => {
    let refreshed = false;
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/login")) return json(200, { user: { id: "u1" }, accessToken: "old" });
      if (url.endsWith("/auth/refresh")) {
        refreshed = true;
        return json(200, { user: { id: "u1" }, accessToken: "new" });
      }
      return refreshed ? json(200, { ok: true }) : json(401, { error: { code: "UNAUTHORIZED", message: "expired" } });
    });

    const { api, login } = await loadApi(fetchMock);
    await login({ email: "a@b.c", password: "x" });
    await Promise.all([api("/urls"), api("/analytics/overview"), api("/auth/me")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("signs the user out when the refresh token is no longer valid", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/login")) return json(200, { user: { id: "u1" }, accessToken: "old" });
      return json(401, { error: { code: "UNAUTHORIZED", message: "Session expired. Sign in again." } });
    });

    const { api, login, onSessionChange } = await loadApi(fetchMock);
    const seen = [];
    onSessionChange((user) => seen.push(user));

    await login({ email: "a@b.c", password: "x" });
    await expect(api("/urls")).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual([{ id: "u1" }, null]);
  });

  it("does not try to refresh after a failed login", async () => {
    const fetchMock = vi.fn(async () =>
      json(401, { error: { code: "UNAUTHORIZED", message: "Email or password is incorrect" } })
    );
    const { login } = await loadApi(fetchMock);

    await expect(login({ email: "a@b.c", password: "wrong" })).rejects.toMatchObject({
      message: "Email or password is incorrect",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
