import type { Metadata } from "next";
import React from "react";
import ShipmentDashboard from "@/components/shipment/ShipmentDashboard";

export const metadata: Metadata = {
  title: "Dashboard Xuất Nhập Khẩu | Quản lý Shipment",
  description: "Hệ thống theo dõi và quản lý lô hàng xuất nhập khẩu, hải quan và vận chuyển.",
};

export default function DashboardPage() {
  return <ShipmentDashboard />;
}
