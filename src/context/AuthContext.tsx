"use client";

import { clearStoredUser, getStoredUser } from "@/services/authApi";
import type { AuthUser } from "@/types/auth";
import React, { createContext, useContext, useEffect, useState } from "react";

interface AuthContextValue {
  user: AuthUser | null;
  isInitialized: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Server và lần render client đầu tiên phải cùng bắt đầu với user = null.
  // localStorage chỉ được đọc sau khi component đã hydrate.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const logout = () => {
    clearStoredUser();
    setUser(null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUser(getStoredUser());
      setIsInitialized(true);
    }, 0);

    const handleExpiredSession = () => logout();
    window.addEventListener("xnk:auth-expired", handleExpiredSession);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("xnk:auth-expired", handleExpiredSession);
    };
  }, []);

  return <AuthContext.Provider value={{ user, isInitialized, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
