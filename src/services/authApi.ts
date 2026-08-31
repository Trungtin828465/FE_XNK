import type { AuthUser, LoginResponse } from "@/types/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const AUTH_STORAGE_KEY = "dashboard_auth_user";
const FALLBACK_ADMIN_USERNAME = "admin";
const FALLBACK_ADMIN_PASSWORD = "123456789";

const fallbackAdmin: AuthUser = {
  username: FALLBACK_ADMIN_USERNAME,
  name: "Administrator",
  role: "Admin",
};

function isFallbackAdminLogin(username: string, password: string): boolean {
  return username.trim().toLowerCase() === FALLBACK_ADMIN_USERNAME
    && password === FALLBACK_ADMIN_PASSWORD;
}

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
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const json = (await res.json().catch(() => ({}))) as LoginResponse;

    // Chỉ fallback khi backend/database gặp lỗi server, không fallback khi sai mật khẩu.
    if (res.status >= 500 && isFallbackAdminLogin(username, password)) {
      return storeUser(fallbackAdmin);
    }

    if (!res.ok) {
      throw new Error(json.message || "Login failed");
    }

    return storeUser(extractUser(json, username));
  } catch (error) {
    // Khi backend/PostgreSQL không kết nối được, cho phép tài khoản dự phòng đăng nhập.
    if (error instanceof TypeError && isFallbackAdminLogin(username, password)) {
      return storeUser(fallbackAdmin);
    }
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
