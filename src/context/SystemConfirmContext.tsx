"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface SystemConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const SystemConfirmContext = createContext<SystemConfirmContextValue | undefined>(undefined);

export function SystemConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    // Nếu có confirm cũ chưa xử lý, đóng nó trước khi mở confirm mới.
    pendingRef.current?.resolve(false);
    const next = { ...options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  useEffect(() => {
    if (!pending) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finish, pending]);

  return (
    <SystemConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-gray-950/55 px-4 backdrop-blur-[2px]" onMouseDown={() => finish(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="system-confirm-title" aria-describedby="system-confirm-message" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:p-6">
            <h2 id="system-confirm-title" className="text-base font-semibold text-gray-900 dark:text-white">
              {pending.title || "Xác nhận thao tác"}
            </h2>
            <p id="system-confirm-message" className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300">
              {pending.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => finish(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                {pending.cancelText || "Hủy"}
              </button>
              <button type="button" autoFocus onClick={() => finish(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${pending.tone === "danger" ? "bg-error-500 hover:bg-error-600" : "bg-brand-500 hover:bg-brand-600"}`}>
                {pending.confirmText || "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SystemConfirmContext.Provider>
  );
}

export function useSystemConfirm(): SystemConfirmContextValue {
  const context = useContext(SystemConfirmContext);
  if (!context) throw new Error("useSystemConfirm must be used within SystemConfirmProvider");
  return context;
}
