import type { Shipment, ShipmentMetricsSummary, DriveDataResponse, SheetTotalRow, SheetSummaryRow, ArchivedDocumentsResponse } from "@/types/shipment";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

function parseDate(val: unknown): string | undefined {
  if (!val || val === "") return undefined;
  const raw = String(val).trim().split(",")[0].trim();
  const usDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = usDate
    ? new Date(Number(usDate[3]), Number(usDate[1]) - 1, Number(usDate[2]))
    : new Date(raw);
  return isNaN(d.getTime()) ? undefined : d.toISOString().split("T")[0];
}

const DOCS = ["PI", "INV", "PKL", "BL", "CO", "HC", "DON_KD", "BB_LM", "PHI_TK", "THUE_NK", "TK", "15B", "QDTQ", "MV", "TRA_CONG"] as const;

type FlowStageKey = "buying" | "shipping" | "arrived" | "declared" | "fifteenb" | "customs" | "delivered";

function normalizeText(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function normalizeOrderCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function getSellOrderCode(row: unknown): string {
  if (typeof row === "string" || typeof row === "number") return normalizeOrderCode(row);
  if (!row || typeof row !== "object") return "";

  const raw = row as Record<string, unknown>;
  const candidateKeys = [
    "Số HĐ", "Sá»‘ HÄ", "SO HD", "SỐ HĐ", "orderCode", "order_code",
    "order", "maDonHang", "Mã đơn hàng", "MÃ ĐƠN HÀNG",
  ];

  for (const key of candidateKeys) {
    const value = raw[key];
    if (value != null && String(value).trim()) return normalizeOrderCode(value);
  }

  const matchedKey = Object.keys(raw).find((key) => {
    const normalizedKey = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return normalizedKey === "SOHD" || normalizedKey.includes("ORDERCODE") || normalizedKey.includes("MADONHANG");
  });

  return matchedKey ? normalizeOrderCode(raw[matchedKey]) : "";
}

function pickRowString(row: SheetSummaryRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text !== "") return text;
  }
  const normalizeHeader = (value: string) => {
    const normalize = (text: string) => text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const variants = [normalize(value)];
    // Hỗ trợ dữ liệu cũ bị giải mã UTF-8 sai thành chuỗi dạng "TÃªn hÃ ng".
    if (/[ÃÂ]/.test(value)) {
      try {
        const repaired = new TextDecoder("utf-8").decode(
          Uint8Array.from(value, (character) => character.charCodeAt(0)),
        );
        variants.push(normalize(repaired));
      } catch {
        // Dùng giá trị gốc nếu môi trường không có TextDecoder.
      }
    }
    return variants.join("|");
  };
  const normalizedRow = new Map(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [normalizeHeader(key), value]),
  );
  for (const key of keys) {
    const value = normalizedRow.get(normalizeHeader(key));
    if (value == null) continue;
    const text = String(value).trim();
    if (text !== "") return text;
  }
  return "";
}

function pickFieldFromRow(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text !== "") return text;
  }
  return "";
}

function inferEmailFromText(text: string): string {
  const direct = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (direct) return direct;
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;
  return "";
}

function inferNameFromEmail(email: string): string {
  if (!email) return "";
  const localPart = email.split("@")[0] || "";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  return cleaned || email;
}

function buildUploaderContact(row: SheetSummaryRow, docKey: string): { email?: string; name?: string } {
  const raw = row as Record<string, unknown>;
  const candidates = [
    `${docKey}_email`,
    `${docKey} email`,
    `email_${docKey}`,
    `${docKey}Email`,
    `${docKey}_name`,
    `${docKey} name`,
    `name_${docKey}`,
    `${docKey}Name`,
    `up_${docKey}`,
    `upload_${docKey}`,
    `${docKey}_up`,
    `${docKey} up`,
  ];
  const text = pickFieldFromRow(raw, candidates);
  const email = inferEmailFromText(text);
  const name = pickFieldFromRow(raw, [
    `${docKey}_name`,
    `${docKey} name`,
    `name_${docKey}`,
    `${docKey}Name`,
  ]) || inferNameFromEmail(email);
  return {
    email: email || undefined,
    name: name || undefined,
  };
}

function hasDoc(documents: import("@/types/shipment").ShipmentDocument[], key: string): boolean {
  return documents.some((d) => d.status === "ok" && normalizeText(d.name).includes(key));
}

function buildDocuments(
  totalDocs: number,
  receivedDocs: number,
  missingDocsText: string,
  row?: SheetSummaryRow,
  totalRow?: SheetTotalRow
): import("@/types/shipment").ShipmentDocument[] {
  const missingSet = new Set(
    missingDocsText
      .split(/[,;\n]/)
      .map((v) => normalizeText(v.trim()))
      .filter(Boolean)
  );

  return DOCS.map((key, idx) => {
    const fileUrl = totalRow?.[key as keyof SheetTotalRow];
    const hasUrl = typeof fileUrl === "string" && fileUrl.trim().length > 0;
    const missing = totalRow ? !hasUrl : missingSet.has(key) || idx >= receivedDocs || idx >= totalDocs;
    const contact = row ? buildUploaderContact(row, key) : {};
    return {
      id: key,
      name: `Chứng từ ${key}`,
      type: "file",
      status: missing ? "missing" : "ok",
      url: typeof fileUrl === "string" && fileUrl.trim() ? fileUrl.trim() : undefined,
      fileId: typeof fileUrl === "string" && fileUrl.trim() ? fileUrl.trim() : undefined,
      note: missing ? "Thiếu theo getSheetTotal" : undefined,
      uploaderEmail: contact.email,
      uploaderName: contact.name,
    } as import("@/types/shipment").ShipmentDocument;
  }).reverse();
}


function deriveFlowStage(
  documents: import("@/types/shipment").ShipmentDocument[],
  eta?: string
): { key: FlowStageKey; label: string; isLate?: boolean } {

  const has = (k: string) => hasDoc(documents, k);

  const today = new Date();

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const etaLate = Boolean(
    eta && new Date(`${eta}T00:00:00`) < todayStart
  );

  /**
   * =========================================================
   * GIAI ĐOẠN 1
   * Lên đơn hàng
   *
   * Điều kiện hoàn thành:
   * PI
   * =========================================================
   */

  const stage1Complete = has("PI");

  if (!stage1Complete) {
    return {
      key: "buying",
      label: "Lên đơn hàng",
      isLate: etaLate
    };
  }


  /**
   * =========================================================
   * GIAI ĐOẠN 2
   * Đang vận chuyển biển
   *
   * Điều kiện hoàn thành:
   * INV + PKL + CO + HC + BL
   *
   * Nếu thiếu bất kỳ chứng từ nào thì vẫn dừng ở đây.
   * =========================================================
   */

  const stage2Required = [
    "INV",
    "PKL",
    "CO",
    "HC",
    "BL"
  ];

  const stage2Complete = stage2Required.every(has);

  if (!stage2Complete) {
    return {
      key: "shipping",
      label: "Đang vận chuyển biển",
      isLate: etaLate
    };
  }


  /**
   * =========================================================
   * GIAI ĐOẠN 3
   * Đã đến cảng
   *
   * Điều kiện hoàn thành:
   * DON_KD
   *
   * Nếu thiếu DON_KD thì vẫn dừng ở đây.
   * =========================================================
   */

  const stage3Required = [
    "DON_KD"
  ];

  const stage3Complete = stage3Required.every(has);

  if (!stage3Complete) {
    return {
      key: "arrived",
      label: "Đã đến cảng",
      isLate: etaLate
    };
  }


  /**
   * =========================================================
   * GIAI ĐOẠN 4
   * Nộp tờ khai
   *
   * Điều kiện hoàn thành:
   * BB_LM + PHI_TK + THUE_NK + TK
   *
   * Nếu thiếu bất kỳ chứng từ nào thì vẫn dừng ở đây.
   * =========================================================
   */

  const stage4Required = [
    "BB_LM",
    "PHI_TK",
    "THUE_NK",
    "TK"
  ];

  const stage4Complete = stage4Required.every(has);

  if (!stage4Complete) {
    return {
      key: "declared",
      label: "Nộp tờ khai",
      isLate: etaLate
    };
  }


  /**
   * =========================================================
   * GIAI ĐOẠN 5
   * Thông quan
   *
   * Điều kiện hoàn thành:
   * QDTQ + MV
   * =========================================================
   */

  const stage5Required = [
    "QDTQ",
    "MV"
  ];

  const stage5Complete = stage5Required.every(has);

  if (!stage5Complete) {
    return {
      key: "customs",
      label: "Thông quan",
      isLate: etaLate
    };
  }


  /**
   * =========================================================
   * GIAI ĐOẠN 6
   * Giao hàng thành công
   *
   * Điều kiện:
   * TRA_CONG
   * =========================================================
   */

  if (!has("TRA_CONG")) {
    return {
      key: "customs",
      label: "Thông quan",
      isLate: etaLate
    };
  }

  return {
    key: "delivered",
    label: "Giao hàng thành công"
  };
}
// function deriveFlowStage(
//   documents: import("@/types/shipment").ShipmentDocument[],
//   eta?: string
// ): { key: FlowStageKey; label: string; isLate?: boolean } {
//   const has = (k: string) => hasDoc(documents, k);
//   const today = new Date();
//   const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//   const etaLate = Boolean(eta && new Date(`${eta}T00:00:00`) < todayStart);

//   if (has("TRA_CONG")) return { key: "delivered", label: "Giao hàng thành công" };
//   if (has("QDTQ") || has("MV")) return { key: "customs", label: "Thông quan", isLate: etaLate };
//   if (has("15B")) return { key: "fifteenb", label: "Mẫu 15B", isLate: etaLate };
//   if (has("BB_LM") || has("PHI_TK") || has("THUE_NK") || has("TK")) return { key: "declared", label: "Nộp tờ khai", isLate: etaLate };
//   if (has("DON_KD")) return { key: "arrived", label: "Đã đến cảng", isLate: etaLate };
//   if (has("INV") || has("PKL") || has("BL") || has("CO") || has("HC")|| has("BL")) {
//     return { key: "shipping", label: "Đang vận chuyển biển", isLate: etaLate };
//   }
//   return { key: "buying", label: "Lên đơn hàng", isLate: etaLate };
// }

function mapToShipmentLegacy(row: SheetSummaryRow, totalMap: Map<string, SheetTotalRow>, index: number): Shipment {
  const orderCode = String(row["Số HĐ"] ?? "").trim();
  const docInfo = totalMap.get(orderCode);
  const totalDocs = docInfo ? (docInfo.requist_docs ?? DOCS.length) : 0;
  const receivedDocs = docInfo?.total_docs ?? (docInfo ? DOCS.filter((key) => Boolean(String(docInfo[key] ?? "").trim())).length : 0);
  const missingDocs = docInfo?.mis_docs ?? "";
  const traCong = pickRowString(row, ["TRA_CONG", "TRA CONG", "TRA-CONG", "TRA CÔNG", "Trả công"]);
  const telex = pickRowString(row, ["LỆNH GIAO HÀNG", "LENH GIAO HANG", "TELEX", "TELEX NO.", "TELEX NUMBER"]);
  const eta = parseDate(pickRowString(row, ["ETA", "Eta"]));
  const ata = parseDate(pickRowString(row, ["ATA", "Ata"]));
  const documents = docInfo ? buildDocuments(totalDocs, receivedDocs, missingDocs, row, docInfo) : [];
  const flowStage = deriveFlowStage(documents, eta);
  const hasCompletedDocs = totalDocs > 0 && receivedDocs >= totalDocs;
  // Chỉ xác định đã giao khi bộ chứng từ trong thư mục có TRA_CONG.
  // Không dùng cột TRA_CONG từ getSheetSummary để quyết định trạng thái.
  const isDelivered = flowStage.key === "delivered";
  const isCompleted = hasCompletedDocs || isDelivered;
  const finalFlowStageKey: FlowStageKey = isDelivered ? "delivered" : flowStage.key;
  const finalFlowStageLabel = isDelivered ? "Giao hàng thành công" : flowStage.label;
  const isLate = !isCompleted && flowStage.isLate;
  const shipmentStatus: Shipment["status"] = isDelivered || isCompleted
    ? "completed"
    : flowStage.key === "buying"
      ? "missing_docs"
      : "shipping";

  return {
    id: `SH-${orderCode}-${index}`,
    orderCode,
    shipName: String(row["Tên hàng"] ?? "").trim(),
    supplier: String(row["KHÁCH HÀNG"] ?? "").trim(),
    factory: String(row["Nhà cung cấp"] ?? "").trim() || undefined,
    factoryCode: String(row["MÃ NHÀ MÁY"] ?? "").trim() || undefined,
    origin: String(row["XUẤT XỨ"] ?? "").trim() || undefined,
    vessel: String(row["Hãng tàu"] ?? "").trim() || undefined,
    bill: String(row["BL NO."] ?? "").trim() || undefined,
    etd: parseDate(row["ETD"]),
    eta,
    ata,
    port: String(row["Cảng"] ?? "").trim() || undefined,
    contCount: typeof row["Cont"] === "number" ? row["Cont"] : undefined,
    status: shipmentStatus,
    docStatus: docInfo?.status ?? 0,
    traCong: traCong || undefined,
    telex: telex || undefined,
    flowStageKey: finalFlowStageKey,
    flowStageLabel: finalFlowStageLabel,
    flowStageLate: isLate || undefined,
    totalDocs,
    receivedDocs,
    missingDocs,
    driveUrl: docInfo?.["folder url"] || undefined,
    timeUpdate: docInfo?.time_update,
    documents,
    thuong: typeof row["Thùng"] === "number" ? row["Thùng"] : undefined,
    trlg: typeof row["Trlg"] === "number" ? row["Trlg"] : undefined,
    giaB: typeof row["Giá bán($)"] === "number" ? row["Giá bán($)"] : undefined,
    thanhTien: typeof row["Thành tiền ($)"] === "number" ? row["Thành tiền ($)"] : undefined,
    updatedAt: docInfo?.time_update ?? new Date().toISOString(),
    createdAt: parseDate(pickRowString(row, ["Ngày HĐ", "NGÀY HĐ", "Ngay HD"])) ?? new Date().toISOString(),
  };
}

function mapToShipment(row: SheetSummaryRow, totalMap: Map<string, SheetTotalRow>, index: number): Shipment {
  const orderCode = pickRowString(row, ["Số HĐ", "Order_code", "Order code"]);
  const docInfo = totalMap.get(orderCode);
  const totalDocs = docInfo ? (docInfo.requist_docs ?? DOCS.length) : 0;
  const receivedDocs = docInfo?.total_docs ?? (docInfo ? DOCS.filter((key) => Boolean(String(docInfo[key] ?? "").trim())).length : 0);
  const documents = docInfo ? buildDocuments(totalDocs, receivedDocs, docInfo.mis_docs ?? "", row, docInfo) : [];
  const eta = parseDate(pickRowString(row, ["ETA"]));
  const ata = parseDate(pickRowString(row, ["ATA"]));
  const flowStage = deriveFlowStage(documents, eta);
  const isCompleted = totalDocs > 0 && receivedDocs >= totalDocs;
  const isDelivered = flowStage.key === "delivered";

  return {
    id: `SH-${orderCode}-${index}`,
    orderCode,
    shipName: pickRowString(row, ["Tên hàng"]),
    supplier: pickRowString(row, ["Nhà cung cấp"]),
    origin: pickRowString(row, ["XUẤT XỨ"]) || undefined,
    vessel: pickRowString(row, ["Hãng tàu"]) || undefined,
    bill: pickRowString(row, ["BL NO."]) || undefined,
    etd: parseDate(pickRowString(row, ["ETD"])),
    eta,
    ata,
    port: pickRowString(row, ["Cảng đến"]) || undefined,
    contCount: undefined,
    status: isDelivered || isCompleted ? "completed" : flowStage.key === "buying" ? "missing_docs" : "shipping",
    docStatus: docInfo?.status ?? 0,
    flowStageKey: isDelivered ? "delivered" : flowStage.key,
    flowStageLabel: isDelivered ? "Giao hàng thành công" : flowStage.label,
    flowStageLate: !isCompleted && !isDelivered && flowStage.isLate || undefined,
    totalDocs,
    receivedDocs,
    missingDocs: docInfo?.mis_docs ?? "",
    driveUrl: docInfo?.["folder url"] as string | undefined,
    timeUpdate: docInfo?.time_update,
    documents,
    thuong: Number(pickRowString(row, ["Số hộp"])) || undefined,
    trlg: Number(pickRowString(row, ["Trọng lượng"])) || undefined,
    giaB: Number(pickRowString(row, ["Giá tổng"]).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) || undefined,
    updatedAt: docInfo?.time_update ?? new Date().toISOString(),
    createdAt: parseDate(pickRowString(row, ["Ngày HĐ PI"])) ?? new Date().toISOString(),
  };
}

export async function fetchSheetTotalMap(): Promise<Map<string, SheetTotalRow>> {
  console.log("[fetchSheetTotalMap] API_BASE =", API_BASE);
  console.log(
    "[fetchSheetTotalMap] URL =",
    `${API_BASE}/api/getSheetTotal`
  );
  const res = await fetch(`${API_BASE}/api/getSheetTotal`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getSheetTotal lỗi: ${res.status}`);
  const json = await res.json();
  const map = new Map<string, SheetTotalRow>();
  for (const row of (json.data ?? []) as SheetTotalRow[]) {
    const key = String(row.Order_code ?? row.order_code ?? row.foldername ?? "").trim();
    if (key) map.set(key, row);
  }
  return map;
}

export async function fetchSheetSummaryRows(): Promise<{ rows: SheetSummaryRow[]; updatedAt: string }> {
  const res = await fetch(`${API_BASE}/api/getSheetSummary`, { cache: "no-store" });
  const json = await res.json().catch(() => null) as {
    data?: SheetSummaryRow[];
    updatedAt?: string;
    message?: string;
    error?: string;
  } | null;

  if (!res.ok) {
    const reason = json?.error || json?.message;
    throw new Error(`getSheetSummary lỗi: ${res.status}${reason ? ` - ${reason}` : ""}`);
  }

  const rows: SheetSummaryRow[] = json?.data ?? []; /*
    (r: SheetSummaryRow) => r["Số HĐ"] != null && r["Số HĐ"] !== "" && r["Tên hàng"] != null && r["Tên hàng"] !== ""
  ); */
  return { rows, updatedAt: json?.updatedAt ?? new Date().toISOString() };
}

export async function fetchSheetSellOrderCodes(): Promise<Set<string>> {
  try {
    const res = await fetch(`${API_BASE}/api/getSheetSell`, { cache: "no-store" });
    if (!res.ok) return new Set();

    const json = await res.json().catch(() => null) as {
      data?: unknown[];
      rows?: unknown[];
      orders?: unknown[];
    } | null;
    const rows = Array.isArray(json) ? json : json?.data || json?.rows || json?.orders || [];

    return new Set(rows.map(getSellOrderCode).filter(Boolean));
  } catch (error) {
    console.warn("Không lấy được danh sách getSheetSell", error);
    return new Set();
  }
}

export async function fetchShipments() {
  const [summaryResult, totalMap, sellOrderCodes] = await Promise.all([
    fetchSheetSummaryRows(),
    fetchSheetTotalMap(),
    fetchSheetSellOrderCodes(),
  ]);
  const { rows, updatedAt } = summaryResult;
  const shipments = rows
    .map((row, idx) => {
      const shipment = mapToShipment(row, totalMap, idx);
      return {
        ...shipment,
        soldAtSea: sellOrderCodes.has(normalizeOrderCode(shipment.orderCode)),
      };
    })
    .filter((s) => s.orderCode !== "");
  return { shipments, lastUpdated: updatedAt, updatedBy: "Admin hệ thống" };
}

export async function triggerUpdateAll(): Promise<DriveDataResponse> {
  const res = await fetch(`${API_BASE}/api/updateAll`, { method: "GET", cache: "no-store" });
  if (!res.ok) return { success: false, message: "updateAll lỗi", updatedAt: new Date().toISOString() };
  return await res.json();
}

type BackendResponse<T> = { success?: boolean; data?: T; message?: string; error?: string };

const backendUrl = (path: string) => `${API_BASE}/api/${path.replace(/^\//, "")}`;

async function callBackend<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(backendUrl(path), { cache: "no-store", ...init });
    const json = await response.json().catch(() => ({})) as BackendResponse<T> & T;
    if (!response.ok || json.success === false) {
      throw new Error(json.message || json.error || "Yêu cầu tới máy chủ thất bại");
    }
    return (json.data ?? json) as T;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Không thể kết nối đến máy chủ");
    throw error;
  }
}

export interface SheetNotification {
  name?: string;
  order_code?: string;
  type?: string;
  mss_docs?: string;
  status?: string | number;
  update_by?: string;
  date?: string;
}

export async function getSheetNoti(): Promise<SheetNotification[]> {
  const result = await callBackend<SheetNotification[] | { data?: SheetNotification[] }>("getSheetNoti");
  return Array.isArray(result) ? result : result.data || [];
}

export function getArchivedDocuments(orderCode: string): Promise<ArchivedDocumentsResponse> {
  return callBackend<ArchivedDocumentsResponse>(`getArchivedDocuments?orderCode=${encodeURIComponent(orderCode)}`);
}

export function moveCompletedOrder(orderCode: string): Promise<{ success: boolean; moved?: boolean; targetFolderUrl?: string }> {
  return callBackend(`moveCompletedOrder?orderCode=${encodeURIComponent(orderCode)}`, { method: "POST" });
}

export function checkDocumentsAndSaveStatus(): Promise<DriveDataResponse> {
  return callBackend("checkDocumentsAndSaveStatus", { method: "POST" });
}

export function updateNotifications(): Promise<DriveDataResponse> {
  return callBackend("updateNotifications", { method: "POST" });
}

export function updateNotificationStatus(): Promise<DriveDataResponse> {
  return callBackend("updateStatusNotification", { method: "PUT" });
}

export interface UploadDocumentPayload {
  action: "uploadDocument";
  orderCode: string;
  documentCode: string;
  fileName: string;
  fileData: string;
}

export function uploadDocument(payload: UploadDocumentPayload): Promise<DriveDataResponse> {
  return callBackend("uploadDocument", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface EditSummaryPayload {
  action: "editSummary";
  orderCode: string;
  data: Record<string, string | number>;
}

export function editSummary(payload: EditSummaryPayload): Promise<DriveDataResponse> {
  return callBackend("editSummary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface AnalyzeDocumentResponse {
  success: boolean;
  documentType: "PI" | "INV" | "PKL" | "BL";
  fileName: string;
  data: Record<string, string>;
  _confidence: number;
  _reason?: string;
  model?: string;
}

export async function analyzeDocument(payload: {
  documentType: "PI";
  file: File;
}): Promise<AnalyzeDocumentResponse> {
  try {
    const formData = new FormData();
    formData.append("documentType", payload.documentType);
    formData.append("file", payload.file, payload.file.name);

    const response = await fetch(backendUrl("ocr/analyze"), {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({})) as AnalyzeDocumentResponse & { message?: string; error?: string };
    if (!response.ok || json.success === false) {
      throw new Error(json.message || json.error || "Không thể phân tích file OCR");
    }
    return json;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Không thể kết nối đến máy chủ OCR");
    throw error;
  }
}

export function computeMetrics(shipments: Shipment[]): ShipmentMetricsSummary {
  return {
    total: shipments.length,
    completed: shipments.filter((s) => s.status === "completed").length,
    shipping: shipments.filter((s) => s.status === "shipping").length,
    missing_docs: shipments.filter((s) => s.status === "missing_docs").length,
  };
}
