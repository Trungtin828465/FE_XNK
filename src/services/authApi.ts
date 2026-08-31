import type { AuthUser, LoginResponse } from "@/types/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const AUTH_STORAGE_KEY = "dashboard_auth_user";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeUser(payload: unknown, fallbackUsername: string): AuthUser {
  if (isRecord(payload)) {
    const username = String(payload.username ?? payload.userName ?? fallbackUsername).trim() || fallbackUsername;
    const name = String(payload.name ?? payload.fullName ?? payload.full_name ?? username).trim() || username;
    const role = String(payload.role ?? payload.userRole ?? payload.position ?? "User").trim() || "User";
    return { username, name, role };
  }

  return {
    username: fallbackUsername,
    name: fallbackUsername,
    role: "User",
  };
}

function extractUser(json: LoginResponse, fallbackUsername: string): AuthUser {
  if (isRecord(json.data)) {
    return normalizeUser(json.data, fallbackUsername);
  }

  if (Array.isArray(json.data) && json.data.length > 0) {
    return normalizeUser(json.data[0], fallbackUsername);
  }

  if (isRecord(json.user)) {
    return normalizeUser(json.user, fallbackUsername);
  }

  return normalizeUser(json, fallbackUsername);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const json = (await res.json()) as LoginResponse;

  if (!res.ok) {
    throw new Error(json.message || "Login failed");
  }

  const user = extractUser(json, username);
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  }
  return user;
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
