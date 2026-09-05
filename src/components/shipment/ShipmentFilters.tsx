"use client";
import React from "react";
import type { ShipmentFilter, ShipmentFilterStatus } from "@/types/shipment";

interface ShipmentFiltersProps {
  filter: ShipmentFilter;
  onChange: (filter: ShipmentFilter) => void;
}

const SUPPLIER_OPTIONS = [
  "Seara",
  "Tonnies",
  "Patel",
  "Vetracom",
  "Frival",
  "Reixach",
  "Fribin",
  "Elpozo",
  "Raiha",
  "Agrobelogie",
  "CCV",
  "NWT",
  "Profood",
  "Corral",
];

const PORT_OPTIONS = ["HCM", "HP"];

const VESSEL_OPTIONS = [
  "YML",
  "COSCO",
  "CMA",
  "HAPP",
  "MAERSK",
  "FESCO",
  "EVER",
  "PIL",
  "ONE",
  "MSC",
  "OOCL",
  "HMM",
  "SINOKOR",
  "CKLINE",
];

const STATUS_OPTIONS: { value: ShipmentFilterStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "shipping", label: "Đang vận chuyển" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đơn hủy" },
];

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-500 dark:focus:ring-brand-500/20";
const labelCls = "mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400";

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function ShipmentFilters({
  filter,
  onChange,
}: ShipmentFiltersProps) {
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filter, search: e.target.value });
  };

  const handleStatus = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filter, status: e.target.value as ShipmentFilterStatus | "all" });
  };

  const handleSupplier = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filter, supplier: e.target.value || undefined });
  };

  const handlePort = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filter, port: e.target.value || undefined });
  };

  const handleVessel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filter, vessel: e.target.value || undefined });
  };

  const handleDateFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filter, dateFrom: e.target.value });
  };

  const handleDateTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filter, dateTo: e.target.value });
  };

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.focus();
    }
  };

  const handleClear = () => {
    onChange({ status: "all", search: "", dateFrom: "", dateTo: "", dateField: "eta", supplier: undefined, port: undefined, vessel: undefined });
  };

  const hasActiveFilter =
    filter.search ||
    filter.dateFrom ||
    filter.dateTo ||
    (filter.status && filter.status !== "all") ||
    filter.supplier ||
    filter.port ||
    filter.vessel;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Row 1: Search + Status */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
        {/* Search: mã đơn + tên hàng */}
        <div className="flex-1 min-w-[200px]">
          <label className={labelCls}>Tìm kiếm (Mã đơn / Tên hàng)</label>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              id="filter-search"
              value={filter.search || ""}
              onChange={handleSearch}
              placeholder="Nhập mã đơn hàng hoặc tên hàng..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:placeholder-gray-500 dark:focus:border-brand-500 dark:focus:ring-brand-500/20"
            />
          </div>
        </div>

        {/* Trạng thái */}
        <div className="w-full md:w-48">
          <label className={labelCls}>Trạng thái</label>
          <select id="filter-status" value={filter.status || "all"} onChange={handleStatus} className={inputCls}>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Nhà cung cấp */}
        <div className="w-full md:w-44">
          <label className={labelCls}>Nhà cung cấp</label>
          <select id="filter-supplier" value={filter.supplier || ""} onChange={handleSupplier} className={inputCls}>
            <option value="">Tất cả</option>
            {SUPPLIER_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Cảng */}
        <div className="w-full md:w-36">
          <label className={labelCls}>Cảng</label>
          <select id="filter-port" value={filter.port || ""} onChange={handlePort} className={inputCls}>
            <option value="">Tất cả</option>
            {PORT_OPTIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Hãng tàu */}
        <div className="w-full md:w-36">
          <label className={labelCls}>Hãng tàu</label>
          <select id="filter-vessel" value={filter.vessel || ""} onChange={handleVessel} className={inputCls}>
            <option value="">Tất cả</option>
            {VESSEL_OPTIONS.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Date range */}
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
        {/* Lọc theo */}
        <div className="w-full md:w-28">
          <label className={labelCls}>Lọc theo</label>
          <div id="filter-datefield" className={inputCls}>ETA</div>
        </div>

        {/* Từ ngày */}
        <div className="w-full md:w-44">
          <label className={labelCls}>Từ ngày</label>
          <div className="relative">
            <input
              id="filter-date-from"
              type="date"
              value={filter.dateFrom || ""}
              onChange={handleDateFrom}
              className={`${inputCls} input-date-icon pr-10`}
            />
            <button
              type="button"
              aria-label="Chọn ngày bắt đầu"
              onClick={() => openDatePicker(document.getElementById("filter-date-from") as HTMLInputElement | null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-gray-700"
            >
              <CalendarIcon />
            </button>
          </div>
        </div>

        {/* Đến ngày */}
        <div className="w-full md:w-44">
          <label className={labelCls}>Đến ngày</label>
          <div className="relative">
            <input
              id="filter-date-to"
              type="date"
              value={filter.dateTo || ""}
              onChange={handleDateTo}
              className={`${inputCls} input-date-icon pr-10`}
            />
            <button
              type="button"
              aria-label="Chọn ngày kết thúc"
              onClick={() => openDatePicker(document.getElementById("filter-date-to") as HTMLInputElement | null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-gray-700"
            >
              <CalendarIcon />
            </button>
          </div>
        </div>

        {/* Clear button */}
        {hasActiveFilter && (
          <button
            id="filter-clear"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-100 hover:text-red-600 dark:border-red-800/40 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Xóa bộ lọc
          </button>
        )}

        {/* Nhanh */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400">Nhanh:</span>
          {(["today", "week", "month"] as const).map((p) => {
            const now = new Date();
            const today = now.toISOString().split("T")[0];
            let fromDate = today;
            if (p === "week") {
              const w = new Date(now);
              w.setDate(w.getDate() - 7);
              fromDate = w.toISOString().split("T")[0];
            } else if (p === "month") {
              const m = new Date(now);
              m.setMonth(m.getMonth() - 1);
              fromDate = m.toISOString().split("T")[0];
            }
            return (
              <button
                key={p}
                onClick={() => onChange({ ...filter, dateFrom: fromDate, dateTo: today, dateField: filter.dateField || "eta" })}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-400 transition-colors"
              >
                {p === "today" ? "Hôm nay" : p === "week" ? "7 ngày" : "30 ngày"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
