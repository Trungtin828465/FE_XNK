import type { AuthUser } from "@/types/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

export interface ActivityLogPayload {
  action: string;
  location?: string;
  detail?: string;
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
