"use client";

import { Modal } from "@/components/ui/modal";
import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { getSheetNoti, type SheetNotification } from "@/services/shipmentApi";

type NotificationKind = "missing_docs" | "delivered";

type NotificationRow = {
  id?: string;
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
  status?: string;
  time: string;
};

function getNotificationKey(item: NotificationItem, index: number) {
  return `${item.id}-${item.orderCode}-${item.time}-${index}`;
}

function isDeliveredType(type?: string) {
  const normalized = String(type || "").toUpperCase();
  return normalized === "HOAN_THANH" || normalized === "GIAO_THANH_CONG" || normalized === "DELIVERED" || normalized === "COMPLETED";
}

function isMissingDocsType(type?: string) {
  const normalized = String(type || "").toUpperCase();
  return normalized === "THIEU_CHUNG_TU" || normalized === "MISSING_DOCS" || normalized === "MISSING";
}

function mapRows(rows: NotificationRow[]): NotificationItem[] {
  return rows
    .map((row) => {
      const type = String(row.type || row.name || "").trim();
      const orderCode = String(row.order_code || "").trim();
      const missingDocs = String(row.missing_docs || row.mss_docs || "").trim();
      const message = String(row.message || "").trim();
      const createdAt = String(row.created_at || row.date || new Date().toISOString());
      const updatedBy = String(row.updated_by || row.update_by || "").trim();
      const delivered = isDeliveredType(type);
      const missing = isMissingDocsType(type) || (!delivered && Boolean(missingDocs || message));

      return {
        id: String(row.id || `${type}-${orderCode}-${createdAt}`),
        kind: delivered ? "delivered" : "missing_docs",
        title: delivered ? "Giao hàng thành công" : "Cảnh báo chứng từ",
        body:
          message ||
          (delivered
            ? `Đơn hàng ${orderCode} đã giao hàng thành công`
            : `Đơn hàng ${orderCode} đang thiếu chứng từ ${missingDocs}`),
        orderCode,
        missingDocs: missing ? missingDocs : undefined,
        updatedBy,
        status: String(row.status ?? ""),
        time: createdAt,
      } as NotificationItem;
    })
    .sort((a, b) => +new Date(b.time) - +new Date(a.time));
}

function isUnread(item: NotificationItem) {
  return item.status === "0";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [badgeCount, setBadgeCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void getSheetNoti().then((rows: SheetNotification[]) => {
      if (cancelled) return;
      const mapped = mapRows(rows as NotificationRow[]);
      setNotifications(mapped);
      setBadgeCount(mapped.filter(isUnread).length);
      setLoading(false);
      setError("");
    }).catch((err) => {
      if (cancelled) return;
      setLoading(false);
      setError(err instanceof Error ? err.message : "Không thể tải thông báo");
    });
    return () => { cancelled = true; };
  }, []);
  /*

    const handleNotification = (event: MessageEvent<string>) => {
      try {
        const json = JSON.parse(event.data) as NotificationApiResponse;
        const rows = parseRows(json);
        const mapped = mapRows(rows);
        const isInitialPayload = !hasReceivedInitialPayloadRef.current;
        const nextStatusMap = new Map<string, string>();
        let receivedNewNotification = false;

        mapped.forEach((item) => {
          const identity = getNotificationIdentity(item);
          const previousStatus = notificationStatusRef.current.get(identity);
          nextStatusMap.set(identity, item.status || "");

          if (!isInitialPayload && isUnread(item) && previousStatus !== "0") {
            receivedNewNotification = true;
          }
        });

        notificationStatusRef.current = nextStatusMap;
        hasReceivedInitialPayloadRef.current = true;
        const unreadCount = mapped.filter(isUnread).length;

        setNotifications(mapped);
        setBadgeCount(unreadCount);
        if (receivedNewNotification) setHasNewNotification(true);
        setLoading(false);
        setError("");
      } catch {
        setError("Không thể xử lý dữ liệu thông báo realtime");
      }
    };

    eventSource.addEventListener("notification", handleNotification);
    // Fallback for proxies/clients that strip the custom SSE event name.
    eventSource.onmessage = handleNotification;
    eventSource.onerror = () => {
      setError("Mất kết nối realtime thông báo");
    };

    return () => {
      eventSource.removeEventListener("notification", handleNotification);
      eventSource.onmessage = null;
      eventSource.close();
    };
  }, [API_BASE]);
  */

  const latestThree = useMemo(() => notifications.slice(0, 3), [notifications]);
  const hasUnread = badgeCount > 0;
  const badgeTone = (kind: NotificationKind) => (kind === "delivered" ? "bg-success-500" : "bg-error-500");

  const handleToggleNotifications = () => {
    setIsOpen((prev) => {
      const next = !prev;
      return next;
    });
  };

  return (
    <div className="relative">
      <button
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleToggleNotifications}
        title="Thông báo"
      >
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
        <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Thông báo</h5>
            <p className="text-xs text-gray-500 dark:text-gray-400">{badgeCount} thông báo từ hệ thống</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {false ? (
            <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              Có thông báo mới
            </div>
          ) : null}
          {loading ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
              Đang tải thông báo...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-600 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          ) : latestThree.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
              Chưa có thông báo mới.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {latestThree.map((item, index) => (
                <li key={getNotificationKey(item, index)}>
                  <DropdownItem
                    onItemClick={() => setIsOpen(false)}
                    className="flex gap-3 rounded-xl border border-gray-100 p-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"
                  >
                    <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <span className={`h-2.5 w-2.5 rounded-full ${badgeTone(item.kind)}`} />
                    </span>

                    <span className="block min-w-0 flex-1">
                      <span className="mb-1 block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                        {item.title}
                      </span>
                      <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{item.body}</span>
                      <span className="mt-1 flex items-center gap-2 text-theme-xs text-gray-400 dark:text-gray-500">
                        <span className="font-medium text-gray-600 dark:text-gray-300">{item.orderCode}</span>
                        {item.updatedBy ? (
                          <>
                            <span className="h-1 w-1 rounded-full bg-gray-400" />
                            <span>{item.updatedBy}</span>
                          </>
                        ) : null}
                        <span className="h-1 w-1 rounded-full bg-gray-400" />
                        <span>{formatTime(item.time)}</span>
                      </span>
                    </span>
                  </DropdownItem>
                </li>
              ))}
            </ul>
          )}

          {notifications.length > 3 && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Xem tất cả thông báo
            </button>
          )}
        </div>
      </Dropdown>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        className="mx-4 my-4 flex max-h-[90vh] max-w-3xl flex-col overflow-hidden"
      >
        <div className="border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tất cả thông báo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{notifications.length} thông báo từ hệ thống</p>
        </div>

        <div className="flex-1 overflow-hidden px-6 py-5">
          <div className="h-full max-h-[calc(90vh-140px)] overflow-y-auto pr-1 custom-scrollbar">
            <div className="flex flex-col gap-2">
              {notifications.map((item, index) => (
                <div key={getNotificationKey(item, index)} className="flex gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                  <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className={`h-2.5 w-2.5 rounded-full ${badgeTone(item.kind)}`} />
                  </span>

                  <span className="block min-w-0 flex-1">
                    <span className="mb-1 block text-sm font-medium text-gray-800 dark:text-white/90">
                      {item.title}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{item.body}</span>
                    {item.updatedBy ? (
                      <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">
                        Người thực hiện: {item.updatedBy}
                      </span>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <span className="font-medium text-gray-600 dark:text-gray-300">{item.orderCode}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-400" />
                      <span>{formatTime(item.time)}</span>
                    </div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
