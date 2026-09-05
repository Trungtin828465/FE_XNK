"use client";

import { Modal } from "@/components/ui/modal";
import {
  getSheetNoti,
  markAllNotificationsRead,
  NOTIFICATIONS_SYNC_EVENT,
} from "@/services/shipmentApi";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

type NotificationKind = "missing_docs" | "delivered" | "route_warning";

type NotificationRow = {
  id?: string | number;
  name?: string;
  order_code?: string;
  type?: string;
  missing_docs?: string;
  mss_docs?: string;
  message?: string;
  updated_by?: string;
  update_by?: string;
  status?: string | number;
  created_at?: string;
  date?: string;
};

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  orderCode: string;
  missingDocs?: string;
  updatedBy?: string;
  status: string;
  time: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractNotificationRows(value: unknown): { found: boolean; rows: NotificationRow[] } {
  if (Array.isArray(value)) {
    return { found: true, rows: value.filter(isRecord) as NotificationRow[] };
  }
  if (!isRecord(value)) return { found: false, rows: [] };
  if (Array.isArray(value.data)) {
    return { found: true, rows: value.data.filter(isRecord) as NotificationRow[] };
  }
  if (Array.isArray(value.notifications)) {
    return { found: true, rows: value.notifications.filter(isRecord) as NotificationRow[] };
  }
  if (isRecord(value.data)) return extractNotificationRows(value.data);
  if (isRecord(value.notifications)) return extractNotificationRows(value.notifications);
  return { found: false, rows: [] };
}

function normalizeType(value?: string): string {
  return String(value || "").trim().toUpperCase();
}

function mapRows(rows: NotificationRow[]): NotificationItem[] {
  return rows
    .map((row, index) => {
      const type = normalizeType(row.type || row.name);
      const orderCode = String(row.order_code || "").trim();
      const missingDocs = String(row.missing_docs || row.mss_docs || "").trim();
      const message = String(row.message || "").trim();
      const time = String(row.created_at || row.date || "").trim();
      const updatedBy = String(row.updated_by || row.update_by || "").trim();
      const delivered = ["HOAN_THANH", "GIAO_THANH_CONG", "DELIVERED", "COMPLETED"].includes(type);
      const routeWarning = type === "VUOT_LO_TRINH";
      const kind: NotificationKind = delivered ? "delivered" : routeWarning ? "route_warning" : "missing_docs";
      const title = delivered
        ? "Giao hàng thành công"
        : routeWarning
          ? "Cảnh báo vượt lộ trình"
          : "Cảnh báo chứng từ";
      const body = message || (delivered
        ? `Đơn hàng ${orderCode} đã giao hàng thành công`
        : routeWarning
          ? `Đơn hàng ${orderCode} vượt lộ trình${missingDocs ? `. Còn thiếu: ${missingDocs}` : ""}`
          : `Đơn hàng ${orderCode} đang thiếu chứng từ${missingDocs ? `: ${missingDocs}` : ""}`);

      return {
        id: String(row.id ?? `${type}-${orderCode}-${time}-${index}`),
        kind,
        title,
        body,
        orderCode,
        missingDocs: missingDocs || undefined,
        updatedBy: updatedBy || undefined,
        status: String(row.status ?? ""),
        time,
      };
    })
    .sort((a, b) => {
      const timeA = Date.parse(a.time);
      const timeB = Date.parse(b.time);
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
    });
}

function isUnread(item: NotificationItem): boolean {
  return item.status === "0";
}

function formatTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationKey(item: NotificationItem, index: number): string {
  return `${item.id}-${item.orderCode}-${item.time}-${index}`;
}

function badgeTone(kind: NotificationKind): string {
  if (kind === "delivered") return "bg-success-500";
  if (kind === "route_warning") return "bg-warning-500";
  return "bg-error-500";
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const applyRows = useCallback((rows: NotificationRow[], announce = false) => {
    const mapped = mapRows(rows);
    setNotifications(mapped);
    setError("");
    setLoading(false);
    if (announce && mapped.some(isUnread)) setHasNewNotification(true);
  }, []);

  const refreshNotifications = useCallback(async (announce = false) => {
    try {
      const rows = await getSheetNoti();
      applyRows(rows as NotificationRow[], announce);
      setSyncWarning("");
    } catch (refreshError) {
      setLoading(false);
      setError(refreshError instanceof Error ? refreshError.message : "Không thể tải thông báo");
    }
  }, [applyRows]);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    const handleUploadSync = (event: Event) => {
      const sync = (event as CustomEvent<unknown>).detail;
      const notificationPayload = isRecord(sync) ? sync.notifications : undefined;
      const parsed = extractNotificationRows(notificationPayload);
      const syncErrors = isRecord(sync) && Array.isArray(sync.errors) ? sync.errors : [];

      if (parsed.found) applyRows(parsed.rows, true);
      else void refreshNotifications(true);

      setSyncWarning(syncErrors.length > 0
        ? `Upload thành công nhưng đồng bộ chưa hoàn tất: ${syncErrors.map(String).join(", ")}`
        : "");
    };

    window.addEventListener(NOTIFICATIONS_SYNC_EVENT, handleUploadSync);
    return () => window.removeEventListener(NOTIFICATIONS_SYNC_EVENT, handleUploadSync);
  }, [applyRows, refreshNotifications]);

  const latestThree = useMemo(() => notifications.slice(0, 3), [notifications]);
  const unreadCount = useMemo(() => notifications.filter(isUnread).length, [notifications]);

  const markNotificationsAsViewed = async () => {
    if (isMarkingRead) return;
    setHasNewNotification(false);
    setIsMarkingRead(true);
    setError("");
    try {
      await markAllNotificationsRead();
      // Chỉ cập nhật status từ dữ liệu backend sau khi POST thành công.
      const rows = await getSheetNoti();
      const notificationRows = rows as NotificationRow[];
      applyRows(notificationRows);
      if (mapRows(notificationRows).some(isUnread)) {
        setError("Backend đã nhận yêu cầu nhưng Sheet vẫn còn thông báo status = 0. Kiểm tra hàm markAllNotificationsRead phía Backend/Apps Script.");
      }
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Không thể đánh dấu thông báo đã đọc");
    } finally {
      setIsMarkingRead(false);
    }
  };

  const handleToggle = () => {
    const willOpen = !isOpen;
    setHasNewNotification(false);
    setIsOpen(willOpen);
    if (willOpen && unreadCount > 0) void markNotificationsAsViewed();
  };

  const handleViewAll = async () => {
    setIsModalOpen(true);
    setIsOpen(false);
    await markNotificationsAsViewed();
  };

  const renderNotification = (item: NotificationItem, index: number, compact = false) => (
    <div key={getNotificationKey(item, index)} className="flex gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <span className={`h-2.5 w-2.5 rounded-full ${badgeTone(item.kind)}`} />
        {isUnread(item) && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-800" />}
      </span>
      <span className="block min-w-0 flex-1">
        <span className="mb-1 block text-sm font-medium text-gray-800 dark:text-white/90">{item.title}</span>
        <span className={`block text-xs text-gray-500 dark:text-gray-400 ${compact ? "line-clamp-2" : ""}`}>{item.body}</span>
        {item.updatedBy && !compact && (
          <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">Giai đoạn: {item.updatedBy}</span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span className="font-medium text-gray-600 dark:text-gray-300">{item.orderCode || "—"}</span>
          <span className="h-1 w-1 rounded-full bg-gray-400" />
          <span>{formatTime(item.time)}</span>
        </span>
      </span>
    </div>
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        title="Thông báo"
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z" />
        </svg>
      </button>

      <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)} className="absolute -right-[240px] mt-[17px] flex w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0">
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Thông báo</h5>
            <p className="text-xs text-gray-500 dark:text-gray-400">{unreadCount} thông báo chưa đọc</p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} aria-label="Đóng thông báo" className="text-2xl leading-none text-gray-500 hover:text-gray-700 dark:text-gray-400">×</button>
        </div>

        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {hasNewNotification && <div className="mb-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">Có thông báo mới từ lần upload gần nhất.</div>}
          {syncWarning && <div className="mb-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">{syncWarning}</div>}
          {error && <div className="mb-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs font-medium text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">{error}</div>}

          {loading ? (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">Đang tải thông báo...</div>
          ) : latestThree.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">Chưa có thông báo.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {latestThree.map((item, index) => (
                <DropdownItem key={getNotificationKey(item, index)} onItemClick={() => setIsOpen(false)} className="block rounded-xl p-0 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  {renderNotification(item, index, true)}
                </DropdownItem>
              ))}
            </div>
          )}

          {notifications.length > 0 && (
            <button type="button" onClick={() => void handleViewAll()} disabled={isMarkingRead} className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              {isMarkingRead ? "Đang cập nhật..." : "Xem tất cả thông báo"}
            </button>
          )}
        </div>
      </Dropdown>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="mx-4 my-4 flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <div className="border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tất cả thông báo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{notifications.length} thông báo từ hệ thống</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
          {error && (
            <div className="mb-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {notifications.length > 0
              ? notifications.map((item, index) => renderNotification(item, index))
              : <p className="py-8 text-center text-sm text-gray-400">Chưa có thông báo.</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
