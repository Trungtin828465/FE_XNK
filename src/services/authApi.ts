import type { AuthUser, LoginResponse } from "@/types/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
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

export interface AuthActionResponse {
  success?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

export interface ManagedUser {
  id: number;
  username: string;
  name: string;
  role: string;
  session: string;
}

function getResponseMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";
  return String(payload.message ?? payload.error ?? "").trim();
}

function findUserRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.users)) return payload.users;
  if (isRecord(payload.data) && Array.isArray(payload.data.users)) return payload.data.users;
  return [];
}

function normalizeManagedUser(payload: unknown): ManagedUser | null {
  if (!isRecord(payload)) return null;
  const nestedUser = isRecord(payload.user) ? payload.user : {};
  const id = Number(payload.id ?? payload.userId ?? payload.user_id ?? nestedUser.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const username = String(payload.username ?? payload.user_name ?? nestedUser.username ?? "").trim();
  return {
    id,
    username,
    name: String(payload.name ?? payload.fullName ?? payload.full_name ?? nestedUser.name ?? username).trim() || username,
    role: String(payload.role ?? payload.userRole ?? payload.user_role ?? nestedUser.role ?? "").trim(),
    session: String(payload.session ?? payload.sessionId ?? payload.session_id ?? nestedUser.session ?? "").trim(),
  };
}

async function authRequest(path: string, init: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || (isRecord(result) && result.success === false)) {
      throw new Error(getResponseMessage(result) || `Yêu cầu thất bại (${response.status})`);
    }
    return result;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Không thể kết nối đến máy chủ");
    throw error;
  }
}

async function postAuthAction(path: string, body: Record<string, string>): Promise<AuthActionResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as AuthActionResponse;
    if (!response.ok || result.success === false) {
      throw new Error(result.message || result.error || `Yêu cầu thất bại (${response.status})`);
    }
    return result;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Không thể kết nối đến máy chủ");
    throw error;
  }
}

export interface RegisterUserPayload {
  username: string;
  name: string;
  password: string;
  role: string;
  session: string;
}

export function registerUser(payload: RegisterUserPayload): Promise<AuthActionResponse> {
  return postAuthAction("register", { ...payload });
}

export function updateUserPassword(username: string, password: string): Promise<AuthActionResponse> {
  return postAuthAction("update-password", { username, password });
}

export async function getUsers(): Promise<ManagedUser[]> {
  const result = await authRequest("users", { method: "GET" });
  return findUserRows(result)
    .map(normalizeManagedUser)
    .filter((user): user is ManagedUser => user !== null);
}

export async function getUserById(id: number): Promise<ManagedUser> {
  const result = await authRequest(`users/${id}`, { method: "GET" });
  const source = isRecord(result) && result.data !== undefined ? result.data : result;
  const user = normalizeManagedUser(source)
    || (isRecord(source) ? normalizeManagedUser(source.user) : null);
  if (!user) throw new Error("Dữ liệu tài khoản từ máy chủ không hợp lệ");
  return user;
}

export async function updateUser(
  id: number,
  changes: Pick<ManagedUser, "role" | "session">,
): Promise<AuthActionResponse> {
  return await authRequest(`users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  }) as AuthActionResponse;
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
