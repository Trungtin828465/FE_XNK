"use client";

import { canPerformShipmentAction } from "@/config/shipmentActionPermissions";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getActivityLogs, type ActivityLog } from "@/services/activityLogApi";
import { activityLogSummary } from "@/utils/activityLogSummary";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;
const ACTION_LABEL_KEYS: Record<string, string> = {
  CREATE_SHIPMENT: "logCreateShipment",
  UPLOAD_DOCUMENT: "logUploadDocument",
  UPLOAD_OCR_DOCUMENT: "logUploadOcrDocument",
  PASS_DOCUMENT: "logPassDocument",
  ARCHIVE_DOCUMENTS: "logArchiveDocuments",
  EDIT_RETURN_ITEM: "logEditContainerTransport",
  EDIT_SHIPMENT_DETAILS: "logEditShipmentDetails",
  CANCEL_SHIPMENT: "logCancelShipment",
  CREATE_MASTER_DATA: "logCreateMasterData",
  UPDATE_MASTER_DATA: "logUpdateMasterData",
  REGISTER_USER: "logRegisterUser",
  UPDATE_USER_PERMISSION: "logUpdatePermission",
  UPDATE_USER_PASSWORD: "logResetPassword",
};

function actionLabel(action: string, t: (key: string) => string): string {
  const key = ACTION_LABEL_KEYS[action.trim().toUpperCase()];
  return key ? t(key) : action || t("unknown");
}

function dateTime(value: string, language: "vi" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString(language === "en" ? "en-GB" : "vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function actor(log: ActivityLog): string {
  return log.userName || log.username || (log.userId ? `User #${log.userId}` : "—");
}

function pageNumbers(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: Array<number | "…"> = [1];
  if (current > 3) pages.push("…");
  for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page += 1) pages.push(page);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

export default function ActivityLogsPage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
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
    try { setLogs(await getActivityLogs()); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : t("activityLogLoadError")); }
    finally { setLoading(false); }
  }, [canViewLogs, t]);

  useEffect(() => {
    if (!canViewLogs) { router.replace("/"); return; }
    void loadLogs();
  }, [canViewLogs, loadLogs, router]);

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!keyword) return logs;
    return logs.filter((log) => [actor(log), log.role, log.session, log.action, actionLabel(log.action, t), activityLogSummary(log.action, log.detail, log.location, language), log.location, log.detail]
      .join(" ").toLocaleLowerCase("vi").includes(keyword));
  }, [logs, query, t, language]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const displayedLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!canViewLogs) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{t("activityLogs")}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("activityLogsDescription")}</p>
        </div>
        <button type="button" onClick={() => void loadLogs()} disabled={loading} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">{loading ? t("loading") : t("refreshData")}</button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white/90">{t("operationHistory")}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t("recordCount", { count: filteredLogs.length })}</p>
          </div>
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("searchActivityLogs")} aria-label={t("searchActivityLogs")} className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:max-w-sm" />
        </div>
        {error ? (
          <div className="m-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{error}</div>
        ) : loading ? (
          <div className="flex min-h-52 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>
        ) : displayedLogs.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center px-4 text-center text-sm text-gray-500">{t("noActivityLogs")}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {displayedLogs.map((log, index) => {
              const summary = activityLogSummary(log.action, log.detail, log.location, language);
              const hasMore = Boolean(log.location || (log.detail && log.detail !== summary));
              return (
                <article key={log.id || `log-${currentPage}-${index}`} className="px-4 py-4 transition-colors hover:bg-gray-50/60 dark:hover:bg-white/[0.02] sm:px-5">
                  <div className="flex gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">{actor(log).charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-gray-800 dark:text-white/90">{actor(log)}</span>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{actionLabel(log.action, t)}</span>
                        <time dateTime={log.createdAt} className="text-xs text-gray-500 sm:ml-auto">{dateTime(log.createdAt, language)}</time>
                      </div>
                      {summary && <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{summary}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                        {(log.role || log.session) && <span>{[log.role, log.session].filter(Boolean).join(" · ")}</span>}
                        {hasMore && (
                          <details className="group w-full pt-1">
                            <summary className="w-fit cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-400">{t("logViewDetails")}</summary>
                            <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                              {log.detail && log.detail !== summary && <p className="break-words">{log.detail}</p>}
                              {log.location && <p className="break-all text-gray-400">{log.location}</p>}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && !error && filteredLogs.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-gray-500">{t("showingRecords", { from: (currentPage - 1) * PAGE_SIZE + 1, to: Math.min(currentPage * PAGE_SIZE, filteredLogs.length), total: filteredLogs.length })}</p>
            <nav aria-label={t("operationHistory")} className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {pageNumbers(currentPage, totalPages).map((number, index) => number === "…" ? (
                <span key={`ellipsis-${index}`} className="flex h-9 w-9 shrink-0 items-center justify-center text-sm text-gray-400">…</span>
              ) : (
                <button key={number} type="button" onClick={() => setPage(number)} aria-label={t("goToPage", { page: number })} aria-current={number === currentPage ? "page" : undefined} className={`h-9 min-w-9 shrink-0 rounded-lg border px-2 text-sm font-semibold ${number === currentPage ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"}`}>{number}</button>
              ))}
            </nav>
          </div>
        )}
      </div>
    </section>
  );
}
