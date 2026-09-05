import type { AuthUser } from "@/types/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

export interface ActivityLogPayload {
  action: string;
  location?: string;
  detail?: string;
}

export interface ActivityLog {
  id: number | string;
  userId?: number;
  username?: string;
  userName?: string;
  role?: string;
  session?: string;
  action: string;
  location: string;
  detail: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findLogRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.logs)) return payload.logs;
  if (isRecord(payload.data) && Array.isArray(payload.data.logs)) return payload.data.logs;
  return [];
}

function normalizeLog(row: unknown, index: number): ActivityLog | null {
  if (!isRecord(row)) return null;
  const nestedUser = isRecord(row.user) ? row.user : {};
  const rawUserId = row.user_id ?? row.userId ?? nestedUser.id;
  const userId = Number(rawUserId);
  const createdAt = String(row.created_at ?? row.createdAt ?? "").trim();

  return {
    id: (row.id as number | string | undefined) ?? `${createdAt}-${index}`,
    userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
    username: String(row.username ?? row.user_name ?? nestedUser.username ?? "").trim() || undefined,
    userName: String(row.name ?? row.full_name ?? row.fullName ?? nestedUser.name ?? "").trim() || undefined,
    role: String(row.role ?? row.user_role ?? row.userRole ?? nestedUser.role ?? "").trim() || undefined,
    session: String(row.session ?? row.user_session ?? row.userSession ?? row.session_id ?? nestedUser.session ?? "").trim() || undefined,
    action: String(row.action ?? "").trim(),
    location: String(row.location ?? "").trim(),
    detail: String(row.detail ?? "").trim(),
    createdAt,
  };
}

export async function getActivityLogs(): Promise<ActivityLog[]> {
  const response = await fetch(`${API_BASE}/api/auth/activity-logs`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(result)
      ? String(result.message ?? result.error ?? "").trim()
      : "";
    throw new Error(message || `Không thể tải nhật ký hoạt động (${response.status})`);
  }

  return findLogRows(result)
    .map(normalizeLog)
    .filter((log): log is ActivityLog => log !== null)
    .sort((a, b) => {
      const timeA = Date.parse(a.createdAt);
      const timeB = Date.parse(b.createdAt);
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
    });
}

export async function createActivityLog(user: AuthUser | null, payload: ActivityLogPayload): Promise<void> {
  if (!user?.id) {
    console.warn("Không ghi activity log vì response đăng nhập chưa có user id.");
    return;
  }

  const response = await fetch(`${API_BASE}/api/auth/activity-logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: user.id,
      action: payload.action.slice(0, 255),
      location: (payload.location || "").slice(0, 255),
      detail: (payload.detail || "").slice(0, 255),
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(result.message || result.error || `Không thể ghi activity log (${response.status})`);
  }
}

/** Ghi log nền để lỗi log không làm người dùng lặp lại một nghiệp vụ đã thành công. */
export function recordActivity(user: AuthUser | null, payload: ActivityLogPayload): void {
  void createActivityLog(user, payload).catch((error) => {
    console.error("Activity log error:", error);
  });
}
