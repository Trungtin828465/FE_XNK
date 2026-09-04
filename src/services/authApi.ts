import type { AuthUser, LoginResponse } from "@/types/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const AUTH_STORAGE_KEY = "dashboard_auth_user";

function storeUser(user: AuthUser): AuthUser {
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  }
  return user;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeUser(payload: unknown, fallbackUsername: string): AuthUser {
  if (isRecord(payload)) {
    const rawId = payload.id ?? payload.userId ?? payload.user_id;
    const id = Number(rawId);
    const username = String(payload.username ?? payload.userName ?? fallbackUsername).trim() || fallbackUsername;
    const name = String(payload.name ?? payload.fullName ?? payload.full_name ?? username).trim() || username;
    const role = String(payload.role ?? payload.userRole ?? payload.position ?? "User").trim() || "User";
    const session = String(payload.session ?? payload.sessionId ?? payload.session_id ?? "").trim() || undefined;
    const token = String(payload.token ?? payload.accessToken ?? payload.access_token ?? "").trim() || undefined;
    return { id: Number.isInteger(id) && id > 0 ? id : undefined, username, name, role, session, token };
  }

  return {
    username: fallbackUsername,
    name: fallbackUsername,
    role: "User",
  };
}

function extractUser(json: LoginResponse, fallbackUsername: string): AuthUser {
  let user: AuthUser;
  if (isRecord(json.data) && isRecord(json.data.user)) {
    user = normalizeUser(json.data.user, fallbackUsername);
  } else if (isRecord(json.data)) {
    user = normalizeUser(json.data, fallbackUsername);
  } else if (Array.isArray(json.data) && json.data.length > 0) {
    user = normalizeUser(json.data[0], fallbackUsername);
  } else if (isRecord(json.user)) {
    user = normalizeUser(json.user, fallbackUsername);
  } else {
    user = normalizeUser(json, fallbackUsername);
  }
  const data = isRecord(json.data) ? json.data : {};
  const topLevelToken = String(
    json.token ?? json.accessToken ?? json.access_token ?? data.token ?? data.accessToken ?? data.access_token ?? "",
  ).trim() || undefined;
  const topLevelSession = String(
    json.session ?? json.sessionId ?? json.session_id ?? data.session ?? data.sessionId ?? data.session_id ?? "",
  ).trim() || undefined;
  return {
    ...user,
    token: user.token || topLevelToken,
    session: user.session || topLevelSession || topLevelToken,
  };
}

export async function login(username: string, password: string): Promise<AuthUser> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const json = (await res.json().catch(() => ({}))) as LoginResponse;

    if (!res.ok) {
      throw new Error(json.message || "Login failed");
    }

    return storeUser(extractUser(json, username));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Không thể kết nối đến máy chủ");
    }
    throw error;
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
