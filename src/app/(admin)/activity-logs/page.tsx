"use client";

import { canPerformShipmentAction } from "@/config/shipmentActionPermissions";
import { useAuth } from "@/context/AuthContext";
import { getActivityLogs, type ActivityLog } from "@/services/activityLogApi";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

const ACTION_LABELS: Record<string, string> = {
  CREATE_SHIPMENT: "Tạo đơn hàng",
  UPLOAD_DOCUMENT: "Upload chứng từ",
  ARCHIVE_DOCUMENTS: "Lưu trữ chứng từ",
  EDIT_RETURN_ITEM: "Sửa thông tin hạ rỗng",
  EDIT_SHIPMENT_DETAILS: "Sửa chi tiết đơn hàng",
  CANCEL_SHIPMENT: "Hủy đơn hàng",
};

function getActionLabel(action: string): string {
  const normalized = action.trim().toUpperCase();
  return ACTION_LABELS[normalized] || action || "Không xác định";
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getActor(log: ActivityLog): string {
  return log.userName || log.username || (log.userId ? `User #${log.userId}` : "—");
}

function getPageNumbers(currentPage: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "…"> = [1];
  if (currentPage > 3) pages.push("…");
  for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page += 1) {
    pages.push(page);
  }
  if (currentPage < totalPages - 2) pages.push("…");
  pages.push(totalPages);
  return pages;
}

export default function ActivityLogsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canViewLogs = canPerformShipmentAction(user, "viewActivityLogs");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const loadLogs = useCallback(async () => {
    if (!canViewLogs) return;
    setLoading(true);
    setError("");
    try {
      setLogs(await getActivityLogs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải nhật ký hoạt động");
    } finally {
      setLoading(false);
    }
  }, [canViewLogs]);

  useEffect(() => {
    if (!canViewLogs) {
      router.replace("/");
      return;
    }
    void loadLogs();
  }, [canViewLogs, loadLogs, router]);

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!keyword) return logs;
    return logs.filter((log) =>
      [getActor(log), log.role, log.session, log.action, getActionLabel(log.action), log.location, log.detail]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(keyword),
    );
  }, [logs, query]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const displayedLogs = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!canViewLogs) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Nhật ký hoạt động</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Theo dõi các thao tác đã thực hiện trên hệ thống.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10"
        >
          <svg className={loading ? "animate-spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {loading ? "Đang tải..." : "Tải lại"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90">Lịch sử thao tác</h2>
            <p className="mt-0.5 text-xs text-gray-400">{filteredLogs.length} bản ghi</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm người dùng, hành động, nội dung..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-500"
            />
          </div>
        </div>

        {error ? (
          <div className="m-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : displayedLogs.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-400">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 12h6" /><path d="M9 16h6" /><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
            </svg>
            Không tìm thấy nhật ký hoạt động.
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 lg:hidden">
              {displayedLogs.map((log) => (
                <article key={log.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                      {getActionLabel(log.action)}
                    </span>
                    <time className="text-right text-xs text-gray-400">{formatDateTime(log.createdAt)}</time>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">{getActor(log)}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Role: {log.role || "—"}
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Session: {log.session || "—"}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{log.detail || "Không có nội dung chi tiết"}</p>
                  {log.location && <p className="mt-2 break-all text-xs text-gray-400">{log.location}</p>}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1100px] table-fixed">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th className="w-[15%] px-5 py-3">Thời gian</th>
                    <th className="w-[13%] px-5 py-3">Người thực hiện</th>
                    <th className="w-[8%] px-5 py-3">Role</th>
                    <th className="w-[8%] px-5 py-3">Session</th>
                    <th className="w-[15%] px-5 py-3">Hành động</th>
                    <th className="w-[14%] px-5 py-3">Vị trí</th>
                    <th className="w-[27%] px-5 py-3">Nội dung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {displayedLogs.map((log) => (
                    <tr key={log.id} className="align-top transition-colors hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDateTime(log.createdAt)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{getActor(log)}</td>
                      <td className="break-words px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{log.role || "—"}</td>
                      <td className="break-words px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{log.session || "—"}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="break-all px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{log.location || "—"}</td>
                      <td className="break-words px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{log.detail || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && filteredLogs.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-gray-400">
              Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredLogs.length)} / {filteredLogs.length} bản ghi
            </p>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {getPageNumbers(safePage, totalPages).map((pageNumber, index) =>
                pageNumber === "…" ? (
                  <span key={`ellipsis-${index}`} className="flex h-9 w-9 shrink-0 items-center justify-center text-sm text-gray-400">…</span>
                ) : (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    aria-label={`Đến trang ${pageNumber}`}
                    aria-current={pageNumber === safePage ? "page" : undefined}
                    className={`h-9 w-9 shrink-0 rounded-lg border text-sm font-semibold transition-colors ${
                      pageNumber === safePage
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
