import type { AuthUser } from "@/types/auth";

export type ShipmentActionPermissionKey =
  | "createShipment"
  | "uploadDocument"
  | "archiveDocuments"
  | "editReturnItem"
  | "editShipmentDetails"
  | "cancelShipment"
  | "viewActivityLogs";

interface ActionPermission {
  /** Điền đúng chuỗi role do API đăng nhập trả về, ví dụ: Admin. */
  role: string;
  /** Điền đúng session/sessionId/token do API đăng nhập trả về. */
  session: string;
}

// CẤU HÌNH QUYỀN: mỗi action có thể có nhiều cặp role + session.
// Người dùng được phép nếu khớp ít nhất một cặp; cặp còn trống sẽ bị bỏ qua.
// Ví dụ: uploadDocument: [{ role: "admin", session: "all" }, { role: "xnk", session: "edit" }].
export const SHIPMENT_ACTION_PERMISSIONS: Record<ShipmentActionPermissionKey, ActionPermission[]> = {
  createShipment: [{ role: "admin", session: "all" },
    { role: "xnk", session: "edit" },],
  uploadDocument: [
    { role: "admin", session: "all" },
    { role: "xnk", session: "edit" },
  ],
  archiveDocuments: [{ role: "admin", session: "all" },
    { role: "xnk", session: "edit" },],
  editReturnItem: [{ role: "admin", session: "all" },
    { role: "xnk", session: "edit" },],
  editShipmentDetails: [{ role: "admin", session: "all" },
    { role: "xnk", session: "edit" },],
  cancelShipment: [{ role: "admin", session: "all" },
    { role: "xnk", session: "edit" },],
  viewActivityLogs: [{ role: "admin", session: "all" }],
};

function normalizeRole(value?: string): string {
  return String(value || "").trim().toLowerCase();
}

export function canPerformShipmentAction(user: AuthUser | null, action: ShipmentActionPermissionKey): boolean {
  const permissions = SHIPMENT_ACTION_PERMISSIONS[action];
  const currentSession = String(user?.session || user?.token || "").trim();
  if (!user || !currentSession) return false;
  return permissions.some((permission) => {
    const expectedRole = permission.role.trim();
    const expectedSession = permission.session.trim();
    if (!expectedRole || !expectedSession) return false;
    return normalizeRole(user.role) === normalizeRole(expectedRole) && currentSession === expectedSession;
  });
}
