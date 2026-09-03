// ============================================================
// Shipment Domain Types
// ============================================================

export type ShipmentStatus =
  | "shipping"      // Đang vận chuyển (chưa đến ETA)
  | "completed"     // Hoàn thành (đã qua ETA + đủ giấy tờ)
  | "missing_docs"; // Thiếu chứng từ (status = 0 từ getSheetTotal)

export type DocumentStatus = "ok" | "missing" | "pending" | "expired";
export type ShipmentFilterStatus = ShipmentStatus | "sold_at_sea";

export type JourneyStage =
  | "origin_port"       // Cảng xuất phát (A)
  | "transit_port"      // Cảng trung chuyển (B)
  | "destination_port"  // Cảng đến (VN)
  | "customs_clearance" // Thông quan
  | "delivered";        // Đã giao

export interface ShipmentDocument {
  id: string;
  name: string;
  type: string;
  status: DocumentStatus;
  fileId?: string;
  url?: string;
  updatedAt?: string;
  note?: string;
  uploaderEmail?: string;
  uploaderName?: string;
}

export interface ArchivedDocumentFile {
  fileId: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  createdTime?: string;
  updatedTime?: string;
}

export interface ArchivedDocumentsResponse {
  success: boolean;
  archived: boolean;
  orderCode?: string;
  folderId?: string;
  folderName?: string;
  folderUrl?: string;
  totalFiles?: number;
  files?: ArchivedDocumentFile[];
  message?: string;
}

export interface ShipmentTimeline {
  id: string;
  stage: JourneyStage;
  label: string;
  timestamp?: string;
  isCompleted: boolean;
  isCurrent: boolean;
  portName?: string;
  note?: string;
}

export interface ShipmentStatusHistory {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  user?: string;
}

export interface Shipment {
  id: string;
  orderCode: string;           // Số HĐ
  shipName: string;            // Tên hàng
  supplier: string;            // KHÁCH HÀNG (người mua)
  factory?: string;            // NHÀ MÁY (nhà sản xuất / xuất xứ)
  factoryCode?: string;        // MÃ NHÀ MÁY
  origin?: string;             // XUẤT XỨ
  vessel?: string;             // Hãng tàu
  bill?: string;               // BL NO.
  etd?: string;                // ETD
  eta?: string;                // ETA
  ata?: string;                // Actual Time of Arrival (nếu có)
  telex?: string;              // Telex
  port?: string;               // Cảng
  contCount?: number;          // Số cont
  status: ShipmentStatus;
  soldAtSea?: boolean;         // Có trong sheet đơn hàng đã bán (getSheetSell)
  docStatus: number;           // 0 = thiếu, 1 = đủ (từ getSheetTotal)
  traCong?: string;           // Cột TRA_CONG từ sheet summary
  flowStageKey?: "buying" | "shipping" | "arrived" | "declared" | "fifteenb" | "customs" | "delivered";
  flowStageLabel?: string;
  flowStageLate?: boolean;
  totalDocs: number;           // requist_docs
  receivedDocs: number;        // total_docs (đã có)
  missingDocs: string;         // mis_docs (danh sách tên giấy tờ thiếu)
  driveUrl?: string;           // folder url từ getSheetTotal
  timeUpdate?: string;         // time_update từ getSheetTotal
  // Financial fields
  thuong?: number;             // Thùng
  trlg?: number;               // Trlg
  giaB?: number;               // Giá bán($)
  thanhTien?: number;          // Thành tiền ($)
  documents?: ShipmentDocument[];
  timeline?: ShipmentTimeline[];
  statusHistory?: ShipmentStatusHistory[];
  /** Các cột nguyên bản của tab Summary, dùng cho tab Chi tiết và chỉnh sửa. */
  summaryFields?: Record<string, string>;
  updatedAt: string;
  createdAt: string;
}

export interface ShipmentMetricsSummary {
  total: number;
  completed: number;
  shipping: number;
  missing_docs: number;
}

export interface ShipmentFilter {
  status?: ShipmentFilterStatus | "all";
  search?: string;            // lọc mã đơn hàng + tên hàng
  supplier?: string;          // lọc nhà cung cấp (KHÁCH HÀNG)
  port?: string;              // lọc cảng
  vessel?: string;            // lọc hãng tàu
  dateFrom?: string;
  dateTo?: string;
  dateField?: "eta" | "etd";
}

export interface DriveDataResponse {
  success: boolean;
  message?: string;
  updatedAt?: string;
}

export interface SheetDataResponse {
  shipments: Shipment[];
  lastUpdated: string;
  updatedBy?: string;
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  lastSeen: string;
}

// Raw API types from backend
export interface SheetTotalRow {
  foldername?: string | number;
  "folder url"?: string;
  Order_code?: string | number;
  order_code?: string | number;
  PI?: string;
  PKL?: string;
  INV?: string;
  BL?: string;
  CO?: string;
  HC?: string;
  TRA_CONG?: string;
  requist_docs?: number;
  total_docs?: number;
  mis_docs?: string;
  status?: number;
  time_update?: string;
  [key: string]: string | number | undefined;
}

export interface SheetSummaryRow {
  STT: string | number;
  "Số HĐ": string | number;
  "KHÁCH HÀNG": string;
  "Ngày HĐ": string;
  INV: string | number;
  "Ngày IV": string;
  GP: string;
  "Tên hàng": string;
  "NHÀ MÁY": string;
  "MÃ NHÀ MÁY": string;
  "XUẤT XỨ": string;
  Cont: number;
  "Cảng": string;
  "BL NO.": string;
  "Hãng tàu": string;
  ETD: string;
  ETA: string;
  ATA?: string;
  "LỆNH GIAO HÀNG": string;
  TRA_CONG?: string;
  Thùng: number;
  Trlg: number;
  "Giá bán($)": number;
  "Thành tiền ($)": number;
  [key: string]: unknown;
}

export interface ReturnItem {
  ngay: string;
  soCont: string;
  soHd: string;
  nhaXe: string;
  xeTai: string;
  noiLayHang: string;
  noiTraHang: string;
  noiHaRong: string;
  nhapXuat: string;
}
