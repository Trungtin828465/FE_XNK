"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { Shipment, ShipmentFilter, ShipmentStatus, ShipmentFilterStatus } from "@/types/shipment";
import { fetchShipments, computeMetrics } from "@/services/shipmentApi";
import ShipmentMetrics from "./ShipmentMetrics";
import DashboardInfoBar from "./DashboardInfoBar";
import ShipmentFilters from "./ShipmentFilters";
import ShipmentTable from "./ShipmentTable";
import ShipmentDetailModal from "./ShipmentDetailModal";
import CreateShipmentModal from "./CreateShipmentModal";
import { useAuth } from "@/context/AuthContext";

export default function ShipmentDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role?.trim().toLowerCase() === "admin";
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());
  const [updatedBy, setUpdatedBy] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [activeMetricFilter, setActiveMetricFilter] = useState<ShipmentStatus | "all">("all");
  const [filter, setFilter] = useState<ShipmentFilter>({
    status: "all",
    search: "",
    dateFrom: "",
    dateTo: "",
    dateField: "eta",
    supplier: undefined,
    port: undefined,
    vessel: undefined,
  });

  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);

    try {
      const result = await fetchShipments();
      setShipments(result.shipments);
      setSelectedShipment((current) => current
        ? result.shipments.find((item) => item.orderCode === current.orderCode) || current
        : current);
      setLastUpdated(result.lastUpdated);
      setUpdatedBy(result.updatedBy || "");
    } catch (error) {
      // Keep existing rows visible when the API is temporarily unavailable.
      setApiError(error instanceof Error ? error.message : "Không thể tải dữ liệu shipment");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // Sync metric filter → filter state
  const handleMetricFilterChange = (status: ShipmentStatus | "all") => {
    setActiveMetricFilter(status);
    setFilter(prev => ({ ...prev, status }));
  };

  // Sync filter dropdown → metric state
  const handleFilterChange = (newFilter: ShipmentFilter) => {
    setFilter(newFilter);
    if (newFilter.status !== undefined) {
      const metricStatus: ShipmentStatus | "all" =
        newFilter.status === "cancelled"
          ? "all"
          : newFilter.status as ShipmentStatus | "all";
      setActiveMetricFilter(metricStatus);
    }
  };

  // Dynamic dropdown options (unique values from data)
  const filterOptions = useMemo(() => {
    const suppliers = [...new Set(shipments.map(s => s.supplier).filter(Boolean))].sort();
    const ports = [...new Set(shipments.map(s => s.port).filter(Boolean))] as string[];
    ports.sort();
    const vessels = [...new Set(shipments.map(s => s.vessel).filter(Boolean))] as string[];
    vessels.sort();
    return { suppliers, ports, vessels };
  }, [shipments]);

  // Apply filters
  const filteredShipments = useMemo(() => {
    return shipments.filter(s => {
      // Status
      const statusOk = (() => {
        const selectedStatus = filter.status as ShipmentFilterStatus | "all" | undefined;
        if (!selectedStatus || selectedStatus === "all") return true;
        if (selectedStatus === "cancelled") return s.status === "cancelled";
        return s.status === selectedStatus;
      })();

      // Search: mã đơn + tên hàng
      const q = (filter.search || "").toLowerCase().trim();
      const searchOk = !q || [s.orderCode, s.shipName]
        .some(v => v?.toLowerCase().includes(q));

      // Supplier
      const supplierOk = !filter.supplier || s.supplier === filter.supplier;

      // Port
      const portOk = !filter.port || s.port === filter.port;

      // Vessel
      const vesselOk = !filter.vessel || s.vessel === filter.vessel;

      // Date range
      let dateOk = true;
      if (filter.dateFrom || filter.dateTo) {
        const val = s.eta;
        if (!val) {
          dateOk = false;
        } else {
          const d = new Date(val);
          if (filter.dateFrom && new Date(filter.dateFrom) > d) dateOk = false;
          if (filter.dateTo && new Date(filter.dateTo) < d) dateOk = false;
        }
      }

      return statusOk && searchOk && supplierOk && portOk && vesselOk && dateOk;
    });
  }, [shipments, filter]);

  const metrics = useMemo(() => computeMetrics(shipments), [shipments]);

  const handleRowClick = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setIsModalOpen(true);
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Page title */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Dashboard Xuất Nhập Khẩu
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Theo dõi và quản lý toàn bộ lô hàng • Hải quan & Vận chuyển
          </p>
        </div>
        <div className="flex items-center gap-3">
        {isAdmin && (
          <button type="button" onClick={() => setIsCreateModalOpen(true)} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
            + Tạo đơn hàng mới
          </button>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-brand-500">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Đang tải từ Google Sheet...
          </div>
        )}
        </div>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 dark:border-error-500/30 dark:bg-error-500/10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error-500 mt-0.5 flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-error-700 dark:text-error-400">Lỗi kết nối API</p>
            <p className="text-xs text-error-600 dark:text-error-500 mt-0.5">{apiError}</p>
          </div>
          <button onClick={() => setApiError(null)} className="text-error-400 hover:text-error-600 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Metrics */}
      <ShipmentMetrics
        metrics={metrics}
        activeFilter={activeMetricFilter}
        onFilterChange={handleMetricFilterChange}
      />

      {/* Info bar */}
      <DashboardInfoBar
        lastUpdated={lastUpdated}
        updatedBy={updatedBy}
        onRefresh={handleRefresh}
      />

      {/* Filters */}
      <ShipmentFilters
        filter={filter}
        onChange={handleFilterChange}
        suppliers={filterOptions.suppliers}
        ports={filterOptions.ports}
        vessels={filterOptions.vessels}
      />

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-12 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-gray-400">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-brand-400">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <p className="text-sm">Đang tải dữ liệu từ Google Sheet...</p>
          </div>
        </div>
      ) : (
        <ShipmentTable shipments={filteredShipments} onRowClick={handleRowClick} onReload={loadData} />
      )}

      {/* Detail modal */}
      <ShipmentDetailModal
        shipment={selectedShipment}
        isOpen={isModalOpen}
        onRefresh={loadData}
        onClose={() => { setIsModalOpen(false); setSelectedShipment(null); }}
      />
      <CreateShipmentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={loadData}
        existingOrderCodes={shipments.map((shipment) => shipment.orderCode)}
      />
    </div>
  );
}
