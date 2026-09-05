"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { canPerformShipmentAction } from "../config/shipmentActionPermissions";
import { useAuth } from "../context/AuthContext";
import { useSidebar } from "../context/SidebarContext";
import { GridIcon, HorizontaLDots } from "../icons/index";

const AppSidebar: React.FC = () => {
  const { user } = useAuth();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const showText = isExpanded || isHovered || isMobileOpen;
  const canViewLogs = canPerformShipmentAction(user, "viewActivityLogs");

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0
        ${isExpanded || isMobileOpen || isHovered ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex py-8 ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link
          href="/"
          aria-label="Trang quản lý xuất nhập khẩu"
          className="flex h-10 items-center gap-3 font-semibold text-gray-900 dark:text-white"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            XNK
          </span>
          {showText && <span>Quản lý xuất nhập khẩu</span>}
        </Link>
      </div>

      <nav className="mb-6">
        <h2
          className={`mb-4 flex text-xs uppercase leading-5 text-gray-400 ${
            !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
          }`}
        >
          {showText ? "Chức năng" : <HorizontaLDots />}
        </h2>

        <ul className="flex flex-col gap-4">
          <li>
            <Link
              href="/"
              className={`menu-item group ${
                pathname === "/" ? "menu-item-active" : "menu-item-inactive"
              } ${!showText ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span
                className={
                  pathname === "/"
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }
              >
                <GridIcon />
              </span>
              {showText && <span className="menu-item-text">Xuất nhập khẩu</span>}
            </Link>
          </li>
          {canViewLogs && (
            <li>
              <Link
                href="/activity-logs"
                className={`menu-item group ${
                  pathname === "/activity-logs" ? "menu-item-active" : "menu-item-inactive"
                } ${!showText ? "lg:justify-center" : "lg:justify-start"}`}
              >
                <span className={pathname === "/activity-logs" ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="16" y2="17" />
                  </svg>
                </span>
                {showText && <span className="menu-item-text">Nhật ký hoạt động</span>}
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
};

export default AppSidebar;
