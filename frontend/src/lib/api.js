// The one place that talks to the backend.
//
// Session handling in short:
//   - The ACCESS TOKEN lives only in this module's memory. It is never put in
//     localStorage, so a script injected into the page cannot read it later.
//   - The REFRESH TOKEN is an httpOnly cookie the browser sends by itself.
//     JavaScript never sees it.
//   - When a request fails with 401 because the access token expired, we ask
//     the server for a new one and repeat the request once. The page never notices.

const API_BASE = "/api/v1";

let accessToken = null;
let refreshInProgress = null;
const sessionListeners = new Set();

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details; // for validation errors: [{ field, message }]
  }

  // Message for one form field, if the server complained about it.
  fieldError(field) {
    return this.details?.find?.((issue) => issue.field === field)?.message;
  }
}

// Lets the auth provider know whenever the signed-in user changes.
export function onSessionChange(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function setSession(session) {
  accessToken = session?.accessToken ?? null;
  for (const listener of sessionListeners) listener(session?.user ?? null);
}

async function send(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "Something went wrong. Try again.",
      data?.error?.details
    );
  }
  return data;
}

// Refresh tokens work exactly once. If two tabs refreshed at the same moment,
// the slower one would present an already-used token. A browser-wide lock makes
// tabs take turns; the second tab then sends the cookie the first one received.
function oneTabAtATime(task) {
  return navigator.locks ? navigator.locks.request("linkforge-session-refresh", task) : task();
}

// Trades the refresh cookie for a new access token.
// Resolves to the user, or null when there is no valid session.
// Concurrent callers share one request.
export function restoreSession() {
  refreshInProgress ??= oneTabAtATime(() => send("/auth/refresh", { method: "POST" }))
    .then(
      (session) => {
        setSession(session);
        return session.user;
      },
      (error) => {
        if (error.status !== 401) throw error; // offline or server trouble: keep the session
        setSession(null);
        return null;
      }
    )
    .finally(() => {
      refreshInProgress = null;
    });
  return refreshInProgress;
}

// Use this for every API call:  api("/urls", { method: "POST", body: {...} })
export async function api(path, options) {
  try {
    return await send(path, options);
  } catch (error) {
    const tokenExpired = error.status === 401 && accessToken !== null;
    if (!tokenExpired) throw error;

    const user = await restoreSession();
    if (!user) throw error;
    return send(path, options);
  }
}

export async function login(credentials) {
  const session = await send("/auth/login", { method: "POST", body: credentials });
  setSession(session);
  return session.user;
}

export async function register(details) {
  const session = await send("/auth/register", { method: "POST", body: details });
  setSession(session);
  return session.user;
}

export async function logout() {
  await send("/auth/logout", { method: "POST" }).catch(() => {});
  setSession(null);
}
