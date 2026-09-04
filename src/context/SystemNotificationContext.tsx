"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

export type SystemNotificationType = "success" | "error" | "info" | "warning";

interface SystemNotificationItem {
  id: number;
  message: string;
  type: SystemNotificationType;
}

interface SystemNotificationContextValue {
  notify: (message: string, type?: SystemNotificationType) => void;
}

const SystemNotificationContext = createContext<SystemNotificationContextValue | undefined>(undefined);

const STYLE_MAP: Record<SystemNotificationType, { container: string; dot: string }> = {
  success: {
    container: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-gray-900 dark:text-success-400",
    dot: "bg-success-500",
  },
  error: {
    container: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-gray-900 dark:text-error-400",
    dot: "bg-error-500",
  },
  warning: {
    container: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-gray-900 dark:text-warning-400",
    dot: "bg-warning-500",
  },
  info: {
    container: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-gray-900 dark:text-brand-400",
    dot: "bg-brand-500",
  },
};

export function SystemNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<SystemNotificationItem[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((message: string, type: SystemNotificationType = "info") => {
    const id = ++nextId.current;
    setNotifications((current) => [...current, { id, message, type }].slice(-4));
    window.setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <SystemNotificationContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100000] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {notifications.map((item) => {
          const style = STYLE_MAP[item.type];
          return (
            <div key={item.id} role={item.type === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${style.container}`}>
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
              <span className="min-w-0 flex-1 break-words">{item.message}</span>
              <button type="button" onClick={() => remove(item.id)} aria-label="Đóng thông báo" className="shrink-0 text-current opacity-60 transition-opacity hover:opacity-100">×</button>
            </div>
          );
        })}
      </div>
    </SystemNotificationContext.Provider>
  );
}

export function useSystemNotification(): SystemNotificationContextValue {
  const context = useContext(SystemNotificationContext);
  if (!context) throw new Error("useSystemNotification must be used within SystemNotificationProvider");
  return context;
}
