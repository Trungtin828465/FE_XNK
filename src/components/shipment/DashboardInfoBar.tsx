"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface DashboardInfoBarProps {
  lastUpdated: string;
  updatedBy?: string;
  onRefresh: () => Promise<void>;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardInfoBar({ lastUpdated, updatedBy, onRefresh }: DashboardInfoBarProps) {
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const isAdmin = user?.role?.trim().toLowerCase() === "admin";
  const updaterName = user?.name?.trim() || updatedBy || "Admin hệ thống";

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setShowRefreshSuccess(false);
    try {
      await onRefresh();
      setShowRefreshSuccess(true);
      window.setTimeout(() => setShowRefreshSuccess(false), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Cập nhật lần cuối: {formatRelativeTime(lastUpdated)} · {formatDateTime(lastUpdated)}
          <span className="text-gray-400"> bởi {updaterName}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        {showRefreshSuccess && <span className="text-xs font-medium text-success-600">✓ Đã cập nhật!</span>}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing || !isAdmin}
          title={isAdmin ? "Cập nhật dữ liệu hệ thống" : "Chỉ admin mới có quyền cập nhật dữ liệu"}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-600 transition-all hover:border-brand-300 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isRefreshing ? "animate-spin" : ""}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {isRefreshing ? "Đang cập nhật..." : "Cập nhật dữ liệu"}
        </button>
      </div>
    </div>
  );
}
