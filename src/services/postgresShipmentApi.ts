import { getStoredUser } from "@/services/authApi";
import type {
  CarrierRecord,
  ContainerRecord,
  ContainerTransportRecord,
  DriveDocumentRecord,
  NotificationRecord,
  PostgresShipmentRelations,
  PostgresShipmentSnapshot,
  PurchaseDetailRecord,
  PurchaseItemCodeRecord,
  PurchaseRecord,
  SupplierRecord,
  WarehouseRecord,
  XnkRecord,
} from "@/types/postgresShipment";
import type { ReturnItem } from "@/types/shipment";
import { createHttpApiError, createInvalidResponseError, createNetworkApiError, parseApiResponse } from "@/utils/apiError";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.rows)) return value.rows as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  if (isRecord(value.data)) {
    const nested = Object.values(value.data).find(Array.isArray);
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

function unwrapRecord<T>(value: unknown): T {
  if (isRecord(value) && isRecord(value.data)) return value.data as T;
  return value as T;
}

async function databaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredUser()?.token?.trim();
  const method = String(init.method || "GET").toUpperCase();
  const apiPath = `/api/${path.replace(/^\//, "")}`;
  try {
    const response = await fetch(`${API_BASE}${apiPath}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const { data: result, nonJsonPreview } = await parseApiResponse(response);
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("xnk:auth-expired"));
    }
    if (!response.ok || (isRecord(result) && result.success === false)) {
      throw createHttpApiError("PostgreSQL", method, apiPath, response, result, nonJsonPreview);
    }
    if (result === null) throw createInvalidResponseError("PostgreSQL", method, apiPath, nonJsonPreview);
    return result as T;
  } catch (error) {
    if (error instanceof TypeError) throw createNetworkApiError("PostgreSQL", method, apiPath, error);
    throw error;
  }
}

export async function listDatabaseRows<T>(path: string): Promise<T[]> {
  return unwrapRows<T>(await databaseRequest<unknown>(path));
}

export async function getDatabaseRow<T>(path: string, id: string): Promise<T> {
  return unwrapRecord<T>(await databaseRequest<unknown>(`${path}/${encodeURIComponent(id)}`));
}

export async function createDatabaseRow<T = unknown>(path: string, data: object): Promise<T> {
  return unwrapRecord<T>(await databaseRequest(path, { method: "POST", body: JSON.stringify(data) }));
}

export async function updateDatabaseRow<T extends object>(path: string, id: string, data: Partial<T>): Promise<unknown> {
  return databaseRequest(`${path}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) });
}

/** Chỉ tải những bảng cần để dựng danh sách và modal đơn hàng ban đầu. */
export async function fetchPostgresShipmentListSnapshot(): Promise<PostgresShipmentSnapshot> {
  const [suppliers, carriers, purchases, purchaseDetails, itemCodes, bills, containers] = await Promise.all([
    listDatabaseRows<SupplierRecord>("nha-cung-cap"),
    listDatabaseRows<CarrierRecord>("hang-tau"),
    listDatabaseRows<PurchaseRecord>("mua-hang"),
    listDatabaseRows<PurchaseDetailRecord>("chi-tiet-mua-hang"),
    listDatabaseRows<PurchaseItemCodeRecord>("chi-tiet-mua-hang-item-code"),
    listDatabaseRows<XnkRecord>("xnk"),
    listDatabaseRows<ContainerRecord>("container"),
  ]);
  return {
    suppliers,
    carriers,
    purchases,
    purchaseDetails,
    itemCodes,
    bills,
    containers,
    warehouses: [],
    containerDetails: [],
    transports: [],
  };
}

export const databaseEndpoints = {
  suppliers: "nha-cung-cap",
  carriers: "hang-tau",
  warehouses: "kho",
  purchases: "mua-hang",
  purchaseDetails: "chi-tiet-mua-hang",
  itemCodes: "chi-tiet-mua-hang-item-code",
  bills: "xnk",
  containers: "container",
  containerDetails: "chi-tiet-container",
  transports: "van-chuyen-container",
  driveDocuments: "chung-tu-drive",
  notifications: "thong-bao",
} as const;

export function fetchDriveDocumentRows(): Promise<DriveDocumentRecord[]> {
  return listDatabaseRows<DriveDocumentRecord>(databaseEndpoints.driveDocuments);
}

export function fetchNotificationRows(): Promise<NotificationRecord[]> {
  return listDatabaseRows<NotificationRecord>(databaseEndpoints.notifications);
}

const DRIVE_DOCUMENT_FIELD_MAP = {
  PI: "pi",
  INV: "inv",
  PKL: "pkl",
  BL: "bl",
  CO: "co",
  HC: "hc",
  DON_KD: "don_kd",
  BB_LM: "bb_lm",
  PHI_TK: "phi_tk",
  THUE_NK: "thue_nk",
  TK: "tk",
  "15B": "15b",
  QDTQ: "qdtq",
  MV: "mv",
  TRA_CONG: "tra_cong",
} as const satisfies Record<string, keyof DriveDocumentRecord>;

export async function passDriveDocument(orderCode: string, documentCode: string): Promise<void> {
  const normalizedCode = documentCode.trim().toUpperCase() as keyof typeof DRIVE_DOCUMENT_FIELD_MAP;
  const field = DRIVE_DOCUMENT_FIELD_MAP[normalizedCode];
  if (!field) throw new Error(`Mã chứng từ không hợp lệ: ${documentCode}`);

  await updateDatabaseRow<DriveDocumentRecord>(databaseEndpoints.driveDocuments, orderCode, {
    [field]: "PASS",
  });
}

function normalizeField(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
}

function fieldValue(fields: Record<string, string | number>, names: string[]): string | undefined {
  const wanted = new Set(names.map(normalizeField));
  const found = Object.entries(fields).find(([field]) => wanted.has(normalizeField(field)));
  return found ? String(found[1] ?? "").trim() : undefined;
}

function nullable(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value || null;
}

function nullableDate(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const raw = value.trim();
  if (!raw) return null;
  const localDate = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!localDate) return raw;
  return `${localDate[3]}-${localDate[2].padStart(2, "0")}-${localDate[1].padStart(2, "0")}`;
}

function nullableNumber(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  const raw = value.trim().replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized = lastComma > lastDot
    ? raw.replace(/\./g, "").replace(",", ".")
    : lastDot > lastComma && lastComma >= 0
      ? raw.replace(/,/g, "")
      : lastComma >= 0
        ? raw.replace(",", ".")
        : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Giá trị số không hợp lệ: ${value}`);
  return parsed;
}

export async function updatePostgresShipmentFields(
  relations: PostgresShipmentRelations,
  fields: Record<string, string | number>,
): Promise<void> {
  const purchasePatch: Partial<PurchaseRecord> = {};
  const invoice = fieldValue(fields, ["INV", "Mã INV", "Số INV"]);
  const invoiceDate = fieldValue(fields, ["Ngày INV"]);
  const contractDate = fieldValue(fields, ["Ngày HĐ PI", "Ngày PI"]);
  const supplierName = fieldValue(fields, ["Nhà cung cấp"]);
  if (invoice !== undefined) purchasePatch.ma_inv = nullable(invoice);
  if (invoiceDate !== undefined) purchasePatch.ngay_inv = nullableDate(invoiceDate);
  if (contractDate !== undefined) purchasePatch.ngay_hop_dong = nullableDate(contractDate);
  if (supplierName !== undefined && supplierName !== relations.supplier?.ten_ncc) {
    const suppliers = await listDatabaseRows<SupplierRecord>(databaseEndpoints.suppliers);
    const supplier = suppliers.find((item) => normalizeField(item.ten_ncc) === normalizeField(supplierName));
    if (!supplier) throw new Error(`Nhà cung cấp ${supplierName} chưa có trong danh mục PostgreSQL`);
    purchasePatch.id_ncc = supplier.id_ncc;
  }
  if (Object.keys(purchasePatch).length > 0) {
    await updateDatabaseRow<PurchaseRecord>(databaseEndpoints.purchases, relations.purchase.ma_hop_dong, purchasePatch);
  }

  const firstDetail = relations.details[0];
  const detailPatch: Partial<PurchaseDetailRecord> = {};
  const productName = fieldValue(fields, ["Tên hàng", "Tên sản phẩm"]);
  const netWeight = fieldValue(fields, ["Trọng lượng", "Trọng lượng NET", "Net weight", "Khối lượng net"]);
  const packageCount = fieldValue(fields, ["Số hộp", "Số kiện", "Số lượng"]);
  const unitPrice = fieldValue(fields, ["Đơn giá"]);
  const totalPrice = fieldValue(fields, ["Giá tổng", "Tổng tiền"]);
  if (productName !== undefined) detailPatch.ten_hang = productName;
  if (netWeight !== undefined) detailPatch.net_weight = nullableNumber(netWeight);
  if (packageCount !== undefined) detailPatch.so_kien = nullableNumber(packageCount);
  if (unitPrice !== undefined) detailPatch.don_gia = nullableNumber(unitPrice);
  if (totalPrice !== undefined) detailPatch.tong_gia = nullableNumber(totalPrice);
  if (Object.keys(detailPatch).length > 0) {
    if (!firstDetail) throw new Error("Đơn hàng chưa có dòng chi tiết mua hàng");
    await updateDatabaseRow<PurchaseDetailRecord>(databaseEndpoints.purchaseDetails, firstDetail.id_chi_tiet, detailPatch);
  }

  const firstItem = firstDetail?.itemCodes[0];
  const itemCode = fieldValue(fields, ["Item code"]);
  const factoryCode = fieldValue(fields, ["Mã nhà máy"]);
  if (itemCode !== undefined || factoryCode !== undefined) {
    if (firstItem) {
      await updateDatabaseRow<PurchaseItemCodeRecord>(databaseEndpoints.itemCodes, firstItem.id_item_code, {
        ...(itemCode !== undefined ? { item_code: itemCode } : {}),
        ...(factoryCode !== undefined ? { ma_nha_may: factoryCode } : {}),
      });
    } else if (firstDetail && itemCode && factoryCode) {
      await createDatabaseRow<PurchaseItemCodeRecord>(databaseEndpoints.itemCodes, {
        id_chi_tiet: firstDetail.id_chi_tiet,
        item_code: itemCode,
        ma_nha_may: factoryCode,
      });
    }
  }

  const currentBill = relations.bills[0];
  const billCode = fieldValue(fields, ["BL NO.", "Mã BL"]);
  const carrierName = fieldValue(fields, ["Hãng tàu"]);
  const billPatch: Partial<XnkRecord> = {};
  const destination = fieldValue(fields, ["Cảng đến"]);
  const departure = fieldValue(fields, ["Cảng đi"]);
  const etd = fieldValue(fields, ["ETD"]);
  const eta = fieldValue(fields, ["ETA"]);
  const ata = fieldValue(fields, ["ATA"]);
  if (destination !== undefined) billPatch.cang_den = nullable(destination);
  if (departure !== undefined) billPatch.cang_di = nullable(departure);
  if (etd !== undefined) billPatch.etd = nullableDate(etd);
  if (eta !== undefined) billPatch.eta = nullableDate(eta);
  if (ata !== undefined) billPatch.ata = nullableDate(ata);
  if (carrierName !== undefined) {
    const carriers = await listDatabaseRows<CarrierRecord>(databaseEndpoints.carriers);
    const carrier = carriers.find((item) => normalizeField(item.ten_hang_tau) === normalizeField(carrierName));
    if (!carrier) throw new Error(`Hãng tàu ${carrierName} chưa có trong danh mục PostgreSQL`);
    billPatch.id_hang_tau = carrier.id_hang_tau;
  }
  if (currentBill) {
    if (billCode !== undefined) billPatch.ma_bl = billCode;
    if (Object.keys(billPatch).length > 0) {
      await updateDatabaseRow<XnkRecord>(databaseEndpoints.bills, currentBill.ma_bl, billPatch);
    }
  } else if (billCode) {
    if (!billPatch.id_hang_tau) throw new Error("Cần chọn hãng tàu trước khi tạo B/L");
    await createDatabaseRow<XnkRecord>(databaseEndpoints.bills, {
      ma_bl: billCode,
      ma_hop_dong: relations.purchase.ma_hop_dong,
      id_hang_tau: billPatch.id_hang_tau,
      cang_di: billPatch.cang_di ?? null,
      cang_den: billPatch.cang_den ?? null,
      etd: billPatch.etd ?? null,
      eta: billPatch.eta ?? null,
      ata: billPatch.ata ?? null,
    });
  }

  const containerCode = fieldValue(fields, ["Mã Container", "Số Container", "Số cont", "Container"]);
  if (containerCode !== undefined) {
    const currentContainer = currentBill?.containers[0];
    if (currentContainer) {
      await updateDatabaseRow<ContainerRecord>(databaseEndpoints.containers, currentContainer.id_bl_container, {
        ma_container: containerCode,
      });
    } else {
      const targetBill = billCode || currentBill?.ma_bl;
      if (targetBill && containerCode) {
        await createDatabaseRow<ContainerRecord>(databaseEndpoints.containers, {
          ma_bl: targetBill,
          ma_container: containerCode,
        });
      }
    }
  }
}

export function cancelPostgresShipment(contractCode: string): Promise<unknown> {
  return updateDatabaseRow<PurchaseRecord>(databaseEndpoints.purchases, contractCode, { is_deleted: true });
}

export async function fetchPostgresReturnItem(contractCode: string): Promise<ReturnItem | null> {
  const [bills, containers, transports, warehouses] = await Promise.all([
    listDatabaseRows<XnkRecord>(databaseEndpoints.bills),
    listDatabaseRows<ContainerRecord>(databaseEndpoints.containers),
    listDatabaseRows<ContainerTransportRecord>(databaseEndpoints.transports),
    listDatabaseRows<WarehouseRecord>(databaseEndpoints.warehouses),
  ]);
  const billIds = new Set(bills.filter((bill) => bill.ma_hop_dong === contractCode).map((bill) => bill.ma_bl));
  const container = containers.find((item) => billIds.has(item.ma_bl));
  if (!container) return null;
  const transport = transports.find((item) => item.id_bl_container === container.id_bl_container);
  const warehouse = transport?.id_kho
    ? warehouses.find((item) => item.id_kho === transport.id_kho)
    : undefined;
  return {
    idVanChuyen: transport?.id_van_chuyen || "",
    idBlContainer: container.id_bl_container,
    ngay: transport?.ngay_van_chuyen || "",
    soCont: container.ma_container,
    soHd: contractCode,
    nhaXe: transport?.nha_xe || "",
    tenTaiXe: transport?.ten_tai_xe || "",
    bienSoXe: transport?.bien_so_xe || "",
    noiDi: transport?.noi_di || "",
    idKho: transport?.id_kho || "",
    tenKho: warehouse?.ten_kho || "",
    ghiChu: transport?.ghi_chu || "",
  };
}

export async function savePostgresReturnItem(item: ReturnItem): Promise<void> {
  if (!item.idBlContainer) throw new Error("Đơn hàng chưa có container để cập nhật vận chuyển");
  const payload: Omit<ContainerTransportRecord, "id_van_chuyen"> = {
    id_bl_container: item.idBlContainer,
    ngay_van_chuyen: item.ngay || null,
    nha_xe: item.nhaXe || null,
    ten_tai_xe: item.tenTaiXe || null,
    bien_so_xe: item.bienSoXe || null,
    noi_di: item.noiDi || null,
    id_kho: item.idKho || null,
    ghi_chu: item.ghiChu || null,
  };
  if (item.idVanChuyen) {
    await updateDatabaseRow<ContainerTransportRecord>(databaseEndpoints.transports, item.idVanChuyen, payload);
  } else {
    await createDatabaseRow<ContainerTransportRecord>(databaseEndpoints.transports, payload);
  }
}
