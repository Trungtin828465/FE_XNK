"use client";

import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { analyzeDocument, editSummary, uploadDocument } from "@/services/shipmentApi";
import { useAuth } from "@/context/AuthContext";
import { canPerformShipmentAction } from "@/config/shipmentActionPermissions";
import { recordActivity } from "@/services/activityLogApi";

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
}

const EMPTY_FIELDS: ReviewFields = {
  orderCode: "",
  orderDate: "",
  supplier: "",
  origin: "",
  product: "",
  totalPrice: "",
};

function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

  useEffect(() => {
    if (isOpen && !file) {
      const timer = window.setTimeout(() => inputRef.current?.click(), 150);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, file]);

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
      setFields(mapOcrFields(result.data));
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

  const normalizedOrderCode = fields.orderCode.trim().toUpperCase().replace(/\s+/g, "");
  const duplicateOrderCode = Boolean(normalizedOrderCode && existingOrderCodes.some(
    (code) => code.trim().toUpperCase().replace(/\s+/g, "") === normalizedOrderCode,
  ));

  const handleConfirm = async () => {
    if (!canCreateShipment || !file || !fileData || isSaving) return;
    if (duplicateOrderCode) {
      setError(`Mã PI ${fields.orderCode.trim()} đã tồn tại trong danh sách đơn hàng.`);
      return;
    }
    if (!fields.orderCode.trim() || !fields.product.trim() || !fields.supplier.trim()) {
      setError("Vui lòng bổ sung Mã đơn hàng, Tên sản phẩm và Nhà cung cấp.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await uploadDocument({
        action: "uploadDocument",
        orderCode: fields.orderCode.trim(),
        documentCode: "PI",
        fileName: file.name,
        fileData,
      });

      const data: Record<string, string | number> = {
        "Ngày HĐ PI": fields.orderDate.trim(),
        "Nhà cung cấp": fields.supplier.trim(),
        "XUẤT XỨ": fields.origin.trim(),
        "Tên hàng": fields.product.trim(),
        "Giá tổng": fields.totalPrice.trim(),
      };
      await editSummary({ action: "editSummary", orderCode: fields.orderCode.trim(), data });
      recordActivity(user, {
        action: "CREATE_SHIPMENT",
        location: "ShipmentDashboard/CreateShipmentModal",
        detail: `Tạo đơn hàng ${fields.orderCode.trim()}`,
      });
      await onCreated();
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
  ];

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} className="mx-2 flex max-h-[96vh] max-w-5xl flex-col overflow-hidden sm:mx-4 sm:max-h-[94vh]">
      <div className="border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tạo đơn hàng mới</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Chọn file PI để hệ thống OCR phân tích thông tin.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar">
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={!canCreateShipment || isAnalyzing || isSaving} className="rounded-xl border border-dashed border-brand-300 bg-brand-50 px-4 py-5 text-sm font-semibold text-brand-600 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300">
          {file ? file.name : "Chọn file PI (PDF)"}
        </button>

        {isAnalyzing && <p className="text-center text-sm text-gray-500">Đang phân tích PI bằng OCR...</p>}
        {duplicateOrderCode && <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-600">Mã PI <strong>{fields.orderCode.trim()}</strong> đã tồn tại trong Sheet Summary. Vui lòng kiểm tra lại file PI.</p>}
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
                    {label}
                    <input type="text" value={fields[key]} onChange={(event) => updateField(key, event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
        {filePreviewUrl && <button type="button" onClick={() => setIsFilePanelOpen(true)} className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">Xem file PI</button>}
        <button type="button" onClick={handleClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Hủy</button>
        <button type="button" onClick={handleConfirm} disabled={!canCreateShipment || !file || isAnalyzing || isSaving || duplicateOrderCode} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Đang lưu..." : "Xác nhận tạo đơn"}</button>
      </div>
    </Modal>
      {isFilePanelOpen && filePreviewUrl && (
        <aside className={`fixed right-0 top-0 z-[100000] flex h-screen flex-col border-l border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-gray-700 dark:bg-gray-900 ${isFilePanelMaximized ? "w-full" : "w-[min(92vw,620px)]"}`}>
          <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-white">{file?.name || "File PI"}</p>
            <button type="button" onClick={() => setIsFilePanelMaximized((current) => !current)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">{isFilePanelMaximized ? "Thu nhỏ" : "Phóng to"}</button>
            <button type="button" onClick={() => setIsFilePanelOpen(false)} className="rounded-lg px-2 text-xl leading-none text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Đẩy panel sang phải">→</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gray-100 p-2 custom-scrollbar dark:bg-gray-950">
            <iframe title={`Xem ${file?.name || "File PI"}`} src={filePreviewUrl} className="h-full min-h-[calc(100vh-5rem)] w-full rounded-lg bg-white" />
          </div>
        </aside>
      )}
    </>
  );
}
