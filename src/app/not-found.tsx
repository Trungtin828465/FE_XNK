import Link from "next/link";
import React from "react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-bold text-brand-500">404</p>
        <h1 className="mt-5 text-2xl font-semibold text-gray-800 dark:text-white/90">Không tìm thấy trang</h1>
        <p className="mb-6 mt-3 text-base text-gray-600 dark:text-gray-400">
          Đường dẫn bạn truy cập không tồn tại trong hệ thống.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
        >
          Quay lại trang chính
        </Link>
      </div>
    </div>
  );
}
