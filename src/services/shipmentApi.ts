import type {
  ArchivedDocumentsResponse,
  DriveDataResponse,
  SheetSummaryRow,
  SheetTotalRow,
  ReturnItem,
  Shipment,
  ShipmentDocument,
  ShipmentMetricsSummary,
} from "@/types/shipment";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const DOCUMENT_CODES = [
  "PI", "INV", "PKL", "BL", "CO", "HC", "DON_KD", "BB_LM",
  "PHI_TK", "THUE_NK", "TK", "15B", "QDTQ", "MV", "TRA_CONG",
] as const;

const FLOW_DOCUMENT_GROUPS: Array<{ key: Shipment["flowStageKey"]; docs: string[] }> = [
  { key: "buying", docs: ["PI"] },
  { key: "shipping", docs: ["INV", "PKL", "BL", "CO", "HC"] },
  { key: "arrived", docs: ["DON_KD"] },
  { key: "declared", docs: ["BB_LM", "PHI_TK", "THUE_NK", "TK"] },
  { key: "fifteenb", docs: ["15B"] },
  { key: "customs", docs: ["QDTQ", "MV"] },
];

export const SUMMARY_FIELDS = [
  "Số HĐ", "Ngày HĐ PI", "Nhà cung cấp", "XUẤT XỨ", "Tên hàng", "Giá tổng",
  "INV", "Ngày INV", "Số hộp", "Trọng lượng", "Trọng lượng cả bì", "BL NO.",
  "Số Container", "Hãng tàu", "Cảng đến", "ETD", "ETA",
] as const;

function endpoint(path: string): string {
  return `${API_BASE}/api/${path.replace(/^\//, "")}`;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function repairMojibake(value: string): string {
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(value, (char) => char.charCodeAt(0)));
  } catch {
    return value;
  }
}

function getSheetValue(row: Record<string, unknown>, field: string): string {
  const direct = row[field];
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const wanted = normalizeHeader(field);
  const match = Object.entries(row).find(([key]) => normalizeHeader(repairMojibake(key)) === wanted);
  return match?.[1] == null ? "" : String(match[1]).trim();
}

function parseDate(value: unknown): string | undefined {
  const raw = String(value ?? "").trim().split(",")[0].trim();
  if (!raw) return undefined;
  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    // Sheet hiện tại chủ yếu dùng MM/DD/YYYY; nếu số đầu > 12 thì nhận là DD/MM/YYYY.
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const date = new Date(year, month - 1, day);
    if (
      month < 1 || month > 12 || day < 1 || day > 31 ||
      date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    ) return undefined;
    return date.toISOString().split("T")[0];
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().split("T")[0];
}

function parseNumber(value: string): number | undefined {
  const cleaned = value.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function buildDocuments(total: SheetTotalRow | undefined): ShipmentDocument[] {
  return DOCUMENT_CODES.map((code) => {
    const url = typeof total?.[code] === "string" ? total[code].trim() : "";
    return {
      id: code,
      name: `Chứng từ ${code}`,
      type: "pdf",
      status: url ? "ok" : "missing",
      url: url || undefined,
      fileId: url || undefined,
      note: url ? undefined : "Chưa có URL trong getSheetTotal",
    };
  });
}

function mapShipment(row: SheetSummaryRow, total: SheetTotalRow | undefined, index: number): Shipment {
  const orderCode = getSheetValue(row, "Số HĐ");
  const documents = buildDocuments(total);
  const receivedDocs = documents.filter((document) => document.status === "ok").length;
  const totalDocs = documents.length;
  // Ưu tiên số lượng URL thực tế: có trường hợp sheet Total chưa kịp cập nhật
  // cột status nhưng toàn bộ 15 chứng từ đã tồn tại.
  const completeByDocuments = receivedDocs === totalDocs && totalDocs > 0;
  const docStatus = completeByDocuments ? 1 : Number(total?.status ?? 0);
  const statusValue = getSheetValue(row, "Trạng thái").trim().toLowerCase();
  const isCancelled = ["hủy", "huy", "đã hủy", "da huy", "cancelled", "canceled"].includes(statusValue);
  const completed = !isCancelled && completeByDocuments;
  const eta = parseDate(getSheetValue(row, "ETA"));
  const flowStageKey = completed
    ? "delivered"
    : FLOW_DOCUMENT_GROUPS.find((group) => group.docs.some((code) => !documents.some((document) => document.id === code && document.status === "ok")))?.key || "customs";
  // Giữ toàn bộ các cột thực tế mà backend trả về, không giới hạn ở danh sách
  // cố định để các cột mới trong sheet cũng xuất hiện trong tab Chi tiết.
  const summaryFields = Object.fromEntries(
    Object.entries(row).map(([field, value]) => [
      repairMojibake(field).trim(),
      value == null ? "" : String(value).trim(),
    ]),
  );

  return {
    id: `SH-${orderCode}-${index}`,
    orderCode,
    shipName: getSheetValue(row, "Tên hàng"),
    supplier: getSheetValue(row, "Nhà cung cấp"),
    origin: getSheetValue(row, "XUẤT XỨ") || undefined,
    vessel: getSheetValue(row, "Hãng tàu") || undefined,
    bill: getSheetValue(row, "BL NO.") || undefined,
    etd: parseDate(getSheetValue(row, "ETD")),
    eta,
    port: getSheetValue(row, "Cảng đến") || undefined,
    contCount: undefined,
    status: isCancelled ? "cancelled" : completed ? "completed" : receivedDocs === 0 ? "missing_docs" : "shipping",
    docStatus,
    totalDocs,
    receivedDocs,
    missingDocs: documents.filter((document) => document.status !== "ok").map((document) => document.id).join(", "),
    driveUrl: typeof total?.["folder url"] === "string" ? total["folder url"] : undefined,
    timeUpdate: total?.time_update,
    documents,
    thuong: parseNumber(getSheetValue(row, "Số hộp")),
    trlg: parseNumber(getSheetValue(row, "Trọng lượng")),
    giaB: parseNumber(getSheetValue(row, "Giá tổng")),
    flowStageKey,
    flowStageLabel: completed ? "Hoàn thành" : "Đang xử lý",
    updatedAt: total?.time_update || new Date().toISOString(),
    summaryFields,
    createdAt: parseDate(getSheetValue(row, "Ngày HĐ PI")) || new Date().toISOString(),
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(endpoint(path), { cache: "no-store", ...init });
    const json = await response.json().catch(() => ({})) as { success?: boolean; message?: string; error?: string; data?: T } & T;
    if (!response.ok || json.success === false) {
      throw new Error(json.message || json.error || `API lỗi ${response.status}`);
    }
    return (json.data ?? json) as T;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Không thể kết nối đến máy chủ");
    throw error;
  }
}

export async function fetchSheetTotalMap(): Promise<Map<string, SheetTotalRow>> {
  const json = await requestJson<{ data?: SheetTotalRow[] } | SheetTotalRow[]>("getSheetTotal");
  const rows = Array.isArray(json) ? json : json.data || [];
  const map = new Map<string, SheetTotalRow>();
  rows.forEach((row) => {
    const code = String(row.Order_code ?? row.order_code ?? row.foldername ?? "").trim();
    if (code) map.set(code, row);
  });
  return map;
}

export async function fetchSheetSummaryRows(): Promise<{ rows: SheetSummaryRow[]; updatedAt: string }> {
  const result = await requestJson<{ data?: SheetSummaryRow[]; updatedAt?: string } | SheetSummaryRow[]>("getSheetSummary");
  if (Array.isArray(result)) {
    return { rows: result, updatedAt: new Date().toISOString() };
  }
  return { rows: result.data || [], updatedAt: result.updatedAt || new Date().toISOString() };
}

export async function fetchShipments(): Promise<{ shipments: Shipment[]; lastUpdated: string; updatedBy: string }> {
  const [{ rows, updatedAt }, totalMap] = await Promise.all([fetchSheetSummaryRows(), fetchSheetTotalMap()]);
  const shipments = rows
    .map((row, index) => mapShipment(row, totalMap.get(getSheetValue(row, "Số HĐ")), index))
    .filter((shipment) => shipment.orderCode);
  return { shipments, lastUpdated: updatedAt, updatedBy: "" };
}

function mapReturnItem(row: Record<string, unknown>): ReturnItem {
  return {
    ngay: getSheetValue(row, "NGÀY"),
    soCont: getSheetValue(row, "SỐ CONT"),
    soHd: getSheetValue(row, "SỐ HĐ"),
    nhaXe: getSheetValue(row, "NHÀ XE"),
    xeTai: getSheetValue(row, "XE_TÀI"),
    noiLayHang: getSheetValue(row, "NƠI LẤY HÀNG"),
    noiTraHang: getSheetValue(row, "NƠI TRẢ HÀNG"),
    noiHaRong: getSheetValue(row, "NƠI HẠ RỖNG"),
    nhapXuat: getSheetValue(row, "NHẬP/XUẤT"),
  };
}

export async function fetchReturnItem(orderCode: string): Promise<ReturnItem | null> {
  const result = await requestJson<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>("getSheetReturnItem");
  const rows = Array.isArray(result) ? result : result.data || [];
  const wanted = orderCode.trim().toUpperCase();
  const row = rows.find((item) => mapReturnItem(item).soHd.trim().toUpperCase() === wanted);
  return row ? mapReturnItem(row) : null;
}

export interface EditReturnItemPayload {
  action: "editReturnItem";
  orderCode: string;
  data: Record<string, string | number>;
}

export function editReturnItem(payload: EditReturnItemPayload): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>("editReturnItem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface SheetNotification {
  name?: string; order_code?: string; type?: string; mss_docs?: string; status?: string | number; update_by?: string; date?: string;
}

export function getSheetNoti(): Promise<SheetNotification[]> {
  return requestJson<SheetNotification[]>("getSheetNoti");
}

export function getArchivedDocuments(orderCode: string): Promise<ArchivedDocumentsResponse> {
  return requestJson<ArchivedDocumentsResponse>(`getArchivedDocuments?orderCode=${encodeURIComponent(orderCode)}`);
}

export function moveCompletedOrder(orderCode: string): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>(`moveCompletedOrder?orderCode=${encodeURIComponent(orderCode)}`, { method: "POST" });
}

export function checkDocumentsAndSaveStatus(): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>("checkDocumentsAndSaveStatus", { method: "POST" });
}

export function updateNotifications(): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>("updateNotifications", { method: "POST" });
}

export function updateNotificationStatus(): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>("updateStatusNotification", { method: "PUT" });
}

export interface UploadDocumentPayload { action: "uploadDocument"; orderCode: string; documentCode: string; fileName: string; fileData: string; }
export function uploadDocument(payload: UploadDocumentPayload): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>("uploadDocument", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export interface EditSummaryPayload { action: "editSummary"; orderCode: string; data: Record<string, string | number>; }
export function editSummary(payload: EditSummaryPayload): Promise<DriveDataResponse> {
  return requestJson<DriveDataResponse>("editSummary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export interface AnalyzeDocumentResponse { success: boolean; documentType: "PI" | "INV" | "PKL" | "BL"; fileName: string; data: Record<string, string>; _confidence?: number; ocrConfidence?: number; _reason?: string; models?: Record<string, string>; }
export async function analyzeDocument(payload: { documentType: "PI" | "INV" | "PKL" | "BL"; file: File }): Promise<AnalyzeDocumentResponse> {
  const formData = new FormData();
  formData.append("documentType", payload.documentType);
  formData.append("file", payload.file, payload.file.name);
  const response = await requestJson<AnalyzeDocumentResponse | Record<string, unknown>>("ocr/analyze", { method: "POST", body: formData });
  const raw = response && typeof response === "object" ? response : {};
  const nestedData = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
    ? raw.data
    : raw;
  const data = Object.fromEntries(
    Object.entries(nestedData).map(([key, value]) => [key, value == null ? "" : String(value)]),
  );

  // requestJson đã tự unwrap json.data. Chuẩn hóa lại để các modal luôn nhận
  // được đúng dạng { success, documentType, fileName, data }.
  return {
    success: raw.success !== false,
    documentType: raw.documentType === "PI" || raw.documentType === "INV" || raw.documentType === "PKL" || raw.documentType === "BL"
      ? raw.documentType
      : payload.documentType,
    fileName: typeof raw.fileName === "string" ? raw.fileName : payload.file.name,
    data,
    _confidence: typeof raw._confidence === "number" ? raw._confidence : undefined,
    ocrConfidence: typeof raw.ocrConfidence === "number" ? raw.ocrConfidence : undefined,
    _reason: typeof raw._reason === "string" ? raw._reason : undefined,
    models: raw.models && typeof raw.models === "object" ? raw.models as Record<string, string> : undefined,
  };
}

export function computeMetrics(shipments: Shipment[]): ShipmentMetricsSummary {
  return {
    total: shipments.length,
    completed: shipments.filter((shipment) => shipment.status === "completed").length,
    shipping: shipments.filter((shipment) => shipment.status === "shipping").length,
    cancelled: shipments.filter((shipment) => shipment.status === "cancelled").length,
  };
}
