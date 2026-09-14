"use client";

import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { analyzeDocument, uploadDocument } from "@/services/shipmentApi";
import { createDatabaseRow, databaseEndpoints, listDatabaseRows } from "@/services/postgresShipmentApi";
import type { PurchaseDetailRecord, PurchaseItemCodeRecord, PurchaseRecord, SupplierRecord } from "@/types/postgresShipment";
import { useAuth } from "@/context/AuthContext";
import { canPerformShipmentAction } from "@/config/shipmentActionPermissions";
import { recordActivity } from "@/services/activityLogApi";
import { useSystemNotification } from "@/context/SystemNotificationContext";
import { useLanguage } from "@/context/LanguageContext";
import { findBestCatalogMatch, normalizeCatalogText } from "@/utils/masterDataMatching";

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  existingOrderCodes: string[];
}

interface ReviewFields {
  orderCode: string;
  orderDate: string;
  supplier: string;
  origin: string;
  product: string;
  totalPrice: string;
  unitPrice: string;
  itemCode: string;
  factoryCode: string;
}

const REQUIRED_REVIEW_FIELDS: Array<{ key: keyof ReviewFields; label: string }> = [
  { key: "orderCode", label: "Mã đơn hàng" },
  { key: "orderDate", label: "Ngày PI" },
  { key: "supplier", label: "Nhà cung cấp" },
  { key: "origin", label: "Xuất xứ" },
  { key: "product", label: "Tên sản phẩm" },
  { key: "totalPrice", label: "Giá tổng" },
  { key: "unitPrice", label: "Đơn giá" },
];

const EMPTY_FIELDS: ReviewFields = {
  orderCode: "",
  orderDate: "",
  supplier: "",
  origin: "",
  product: "",
  totalPrice: "",
  unitPrice: "",
  itemCode: "",
  factoryCode: "",
};

function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
}

function normalizeDatabaseDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!local) return raw;
  return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
}

function normalizeDatabaseNumber(value: string): number | null {
  const raw = value.trim().replace(/[^\d,.-]/g, "");
  if (!raw) return null;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma >= 0) {
    normalized = raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readField(data: Record<string, string>, names: string[]): string {
  const wanted = names.map(normalizeKey);
  const entry = Object.entries(data).find(([key]) => wanted.includes(normalizeKey(key)));
  return entry?.[1] || "";
}

function mapOcrFields(data: Record<string, string>): ReviewFields {
  return {
    orderCode: readField(data, ["Số HĐ", "Order_code", "Order code"]),
    orderDate: readField(data, ["Ngày HĐ PI", "Ngày HĐ", "Order date"]),
    supplier: readField(data, ["Nhà cung cấp", "Nha_cung_cap"]),
    origin: readField(data, ["XUẤT XỨ", "Xuat_xu"]),
    product: readField(data, ["Tên hàng", "Ten_hang"]),
    totalPrice: readField(data, ["Giá tổng", "Gia"]),
    unitPrice: readField(data, ["Đơn giá", "Don gia", "Unit price"]),
    itemCode: readField(data, ["Item code", "Item Code"]),
    factoryCode: readField(data, ["Mã nhà máy", "Ma nha may", "Factory code"]),
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("Không đọc được file PI"));
      resolve(reader.result.includes(",") ? reader.result.split(",", 2)[1] : reader.result);
    };
    reader.onerror = () => reject(new Error("Không đọc được file PI"));
    reader.readAsDataURL(file);
  });
}

export default function CreateShipmentModal({ isOpen, onClose, onCreated, existingOrderCodes }: CreateShipmentModalProps) {
  const { user } = useAuth();
  const { notify } = useSystemNotification();
  const { t } = useLanguage();
  const canCreateShipment = canPerformShipmentAction(user, "createShipment");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(false);
  const [isFilePanelMaximized, setIsFilePanelMaximized] = useState(false);
  const [fileData, setFileData] = useState("");
  const [fields, setFields] = useState<ReviewFields>(EMPTY_FIELDS);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  useEffect(() => {
    if (isOpen && !file) {
      const timer = window.setTimeout(() => inputRef.current?.click(), 150);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, file]);

  useEffect(() => {
    if (!isOpen) return;
    void listDatabaseRows<SupplierRecord>(databaseEndpoints.suppliers)
      .then(setSuppliers)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách nhà cung cấp"));
  }, [isOpen]);

  useEffect(() => {
    if (suppliers.length === 0) return;
    setFields((current) => {
      if (!current.supplier) return current;
      const supplier = findBestCatalogMatch(current.supplier, suppliers, "ten_ncc");
      if (!supplier) return current;
      return {
        ...current,
        supplier: supplier.ten_ncc,
        origin: String(supplier.quoc_gia || ""),
      };
    });
  }, [suppliers]);

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setIsFilePanelOpen(false);
    setIsFilePanelMaximized(false);
    setFileData("");
    setFields(EMPTY_FIELDS);
    setError("");
    setIsAnalyzing(false);
    setIsSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canCreateShipment) return;
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setError("OCR PI chỉ hỗ trợ file PDF.");
      return;
    }

    setFile(selected);
    setError("");
    setIsAnalyzing(true);
    try {
      const base64 = await fileToBase64(selected);
      setFileData(base64);
      const result = await analyzeDocument({ documentType: "PI", file: selected });
      const mapped = mapOcrFields(result.data);
      const supplier = findBestCatalogMatch(mapped.supplier, suppliers, "ten_ncc");
      setFields(supplier
        ? { ...mapped, supplier: supplier.ten_ncc, origin: String(supplier.quoc_gia || "") }
        : mapped);
    } catch (err) {
      setFile(null);
      setFileData("");
      setError(err instanceof Error ? err.message : "Không thể phân tích file PI");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateField = (key: keyof ReviewFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const handleSupplierChange = (supplierName: string) => {
    const supplier = suppliers.find((item) => item.ten_ncc === supplierName);
    setFields((current) => ({
      ...current,
      supplier: supplierName,
      origin: String(supplier?.quoc_gia || ""),
    }));
  };

  const normalizedOrderCode = fields.orderCode.trim().toUpperCase().replace(/\s+/g, "");
  const duplicateOrderCode = Boolean(normalizedOrderCode && existingOrderCodes.some(
    (code) => code.trim().toUpperCase().replace(/\s+/g, "") === normalizedOrderCode,
  ));
  const missingRequiredFields = REQUIRED_REVIEW_FIELDS
    .filter(({ key }) => {
      if (!fields[key].trim()) return true;
      if (key === "supplier") return !suppliers.some((supplier) => supplier.ten_ncc === fields.supplier);
      return false;
    })
    .map(({ label }) => label);
  const hasMissingRequiredFields = missingRequiredFields.length > 0;

  const handleConfirm = async () => {
    if (!canCreateShipment || !file || !fileData || isSaving) return;
    if (duplicateOrderCode) {
      setError(`Mã PI ${fields.orderCode.trim()} đã tồn tại trong danh sách đơn hàng.`);
      return;
    }
    if (hasMissingRequiredFields) {
      setError(`Vui lòng bổ sung đầy đủ: ${missingRequiredFields.join(", ")}.`);
      return;
    }
    if (normalizedOrderCode.length > 100) {
      setError("Mã đơn hàng không được vượt quá 100 ký tự.");
      return;
    }
    const supplier = suppliers.find((item) => normalizeKey(item.ten_ncc) === normalizeKey(fields.supplier));
    if (!supplier) {
      setError(`Nhà cung cấp ${fields.supplier.trim()} chưa có trong danh mục PostgreSQL.`);
      return;
    }
    if (Boolean(fields.itemCode.trim()) !== Boolean(fields.factoryCode.trim())) {
      setError("Item code và mã nhà máy phải được nhập cùng nhau.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await createDatabaseRow<PurchaseRecord>(databaseEndpoints.purchases, {
        ma_hop_dong: normalizedOrderCode,
        ngay_hop_dong: normalizeDatabaseDate(fields.orderDate),
        ma_inv: null,
        ngay_inv: null,
        id_ncc: supplier.id_ncc,
        is_deleted: false,
      });
      const createdDetail = await createDatabaseRow<PurchaseDetailRecord>(databaseEndpoints.purchaseDetails, {
        ma_hop_dong: normalizedOrderCode,
        ten_hang: fields.product.trim(),
        net_weight: null,
        so_kien: null,
        don_vi_kien: null,
        don_gia: normalizeDatabaseNumber(fields.unitPrice),
        tong_gia: normalizeDatabaseNumber(fields.totalPrice),
      });
      if (fields.itemCode.trim() && fields.factoryCode.trim()) {
        if (!createdDetail.id_chi_tiet) throw new Error("Backend không trả id_chi_tiet sau khi tạo chi tiết mua hàng");
        await createDatabaseRow<PurchaseItemCodeRecord>(databaseEndpoints.itemCodes, {
          id_chi_tiet: createdDetail.id_chi_tiet,
          ma_nha_may: fields.factoryCode.trim(),
          item_code: fields.itemCode.trim(),
        });
      }
      await uploadDocument({
        action: "uploadDocument",
        orderCode: normalizedOrderCode,
        documentCode: "PI",
        fileName: file.name,
        fileData,
      });
      recordActivity(user, {
        action: "CREATE_SHIPMENT",
        location: "ShipmentDashboard/CreateShipmentModal",
        detail: `Tạo đơn hàng ${fields.orderCode.trim()}`,
      });
      await onCreated();
      notify(`Đã tạo đơn hàng ${fields.orderCode.trim()}`, "success");
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo đơn hàng mới");
    } finally {
      setIsSaving(false);
    }
  };

  const reviewFields: Array<[keyof ReviewFields, string]> = [
    ["orderCode", "Mã đơn hàng"],
    ["orderDate", "Ngày PI"],
    ["supplier", "Nhà cung cấp"],
    ["origin", "Xuất xứ"],
    ["product", "Tên sản phẩm"],
    ["totalPrice", "Giá tổng"],
    ["unitPrice", "Đơn giá"],
    ["itemCode", "Item code"],
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        className={`mx-2 my-2 flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl flex-col overflow-hidden transition-[width,transform] duration-300 sm:mx-4 sm:my-4 sm:max-h-[94vh] sm:w-full ${isFilePanelOpen && !isFilePanelMaximized ? "md:w-[calc(50vw-1.5rem)] md:max-w-none md:-translate-x-1/2" : ""}`}
      >
      <div className="border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("createNewShipment")}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Chọn file PI để hệ thống OCR phân tích thông tin.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar">
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={!canCreateShipment || isAnalyzing || isSaving} className="rounded-xl border border-dashed border-brand-300 bg-brand-50 px-4 py-5 text-sm font-semibold text-brand-600 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300">
          {file ? file.name : t("selectPi")}
        </button>

        {isAnalyzing && <p className="text-center text-sm text-gray-500">{t("analyzingPi")}</p>}
        {duplicateOrderCode && <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600">Mã đơn <strong>{fields.orderCode.trim()}</strong> đã tồn tại trong PostgreSQL. Vui lòng kiểm tra lại file PI.</p>}
        {error && !duplicateOrderCode && <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600">{error}</p>}

        {file && !isAnalyzing && !error && (
          <>
            <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
              Vui lòng kiểm tra lại thông tin OCR trước khi xác nhận tạo đơn.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="hidden">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">File PI đã chọn</p>
                {filePreviewUrl && <button type="button" onClick={() => setIsFilePanelOpen(true)} className="mt-3 inline-flex w-fit items-center rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600">Xem file PI</button>}
              </div>
              <div className="col-span-full grid content-start gap-3 sm:grid-cols-2">
                {reviewFields.map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <span>{label} <span className="text-error-500">*</span></span>
                    {key === "supplier" ? (
                      <select value={fields.supplier} onChange={(event) => handleSupplierChange(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                        <option value="">Chọn nhà cung cấp</option>
                        {fields.supplier && !suppliers.some((supplier) => normalizeCatalogText(supplier.ten_ncc) === normalizeCatalogText(fields.supplier)) && (
                          <option value={fields.supplier} disabled>OCR chưa khớp: {fields.supplier}</option>
                        )}
                        {suppliers.map((supplier) => <option key={supplier.id_ncc} value={supplier.ten_ncc}>{supplier.ten_ncc}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={fields[key]} readOnly={key === "origin"} onChange={(event) => updateField(key, event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 read-only:cursor-not-allowed read-only:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:read-only:bg-gray-800" />
                    )}
                  </label>
                ))}
              </div>
            </div>
            {hasMissingRequiredFields && (
              <p className="text-xs text-error-600 dark:text-error-400">
                {t("requiredMissing", { fields: missingRequiredFields.join(", ") })}
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
        {filePreviewUrl && <button type="button" onClick={() => setIsFilePanelOpen(true)} className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">Xem file PI</button>}
        <button type="button" onClick={handleClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">{t("cancel")}</button>
        <button type="button" onClick={handleConfirm} disabled={!canCreateShipment || !file || isAnalyzing || isSaving || duplicateOrderCode || hasMissingRequiredFields} title={hasMissingRequiredFields ? t("requiredMissing", { fields: missingRequiredFields.join(", ") }) : undefined} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? t("saving") : t("confirmCreate")}</button>
      </div>
    </Modal>
      {isFilePanelOpen && filePreviewUrl && (
        <aside className={`fixed right-0 top-0 z-[100000] flex h-screen min-h-0 flex-col border-l border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-gray-700 dark:bg-gray-900 ${isFilePanelMaximized ? "w-full" : "w-[92vw] md:w-1/2"}`}>
          <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-white">{file?.name || "File PI"}</p>
            <button type="button" onClick={() => setIsFilePanelMaximized((current) => !current)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">{isFilePanelMaximized ? "Thu nhỏ" : "Phóng to"}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-100 p-2 custom-scrollbar dark:bg-gray-950">
            <iframe title={`Xem ${file?.name || "File PI"}`} src={filePreviewUrl} className="block h-[calc(100vh-4.5rem)] min-h-[720px] w-full rounded-lg bg-white" />
          </div>
        </aside>
      )}
      {filePreviewUrl && isFilePanelOpen && (
        <button type="button" onClick={() => { setIsFilePanelOpen(false); setIsFilePanelMaximized(false); }} className="fixed right-0 top-1/2 z-[100001] -translate-y-1/2 rounded-l-xl border border-r-0 border-brand-200 bg-brand-500 px-3 py-4 text-sm font-semibold text-white shadow-lg hover:bg-brand-600" aria-label="Đóng file PI">
          → File
        </button>
      )}
      {filePreviewUrl && !isFilePanelOpen && file && !isAnalyzing && (
        <button type="button" onClick={() => setIsFilePanelOpen(true)} className="fixed right-0 top-1/2 z-[100000] -translate-y-1/2 rounded-l-xl border border-r-0 border-brand-200 bg-brand-500 px-3 py-4 text-sm font-semibold text-white shadow-lg hover:bg-brand-600" aria-label="Mở file PI">
          ← File
        </button>
      )}
    </>
  );
}
