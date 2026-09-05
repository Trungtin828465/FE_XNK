"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useSidebar } from "../context/SidebarContext";
import { GridIcon, HorizontaLDots } from "../icons/index";

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const showText = isExpanded || isHovered || isMobileOpen;
  const isActive = pathname === "/";

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
                isActive ? "menu-item-active" : "menu-item-inactive"
              } ${!showText ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span
                className={
                  isActive
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }
              >
                <GridIcon />
              </span>
              {showText && <span className="menu-item-text">Xuất nhập khẩu</span>}
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default AppSidebar;
