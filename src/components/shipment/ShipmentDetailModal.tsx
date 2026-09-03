"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { Shipment } from "@/types/shipment";
import ShipmentStatusBar, { type ShipmentFlowStage } from "./ShipmentStatusBar";
import { useAuth } from "@/context/AuthContext";
import { checkDocumentsAndSaveStatus, editSummary, getArchivedDocuments, moveCompletedOrder, uploadDocument } from "@/services/shipmentApi";
import type { ArchivedDocumentsResponse } from "@/types/shipment";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

interface ShipmentDetailModalProps {
  shipment: Shipment | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}

type ModalTab = "overview" | "journey" | "documents" | "history" | "folder";

const TAB_LIST: { key: ModalTab; label: string; icon: React.ReactNode }[] = [
  {
    key: "overview",
    label: "Tổng quan",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    key: "journey",
    label: "Hành trình",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  },
  {
    key: "documents",
    label: "Chứng từ",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
  },
  // {
  //   key: "history",
  //   label: "Lịch sử",
  //   icon: (
  //     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  //       <polyline points="12 8 12 12 14 14"/>
  //       <path d="M3.05 11a9 9 0 1 0 .5-4H1"/>
  //       <polyline points="1 2 1 7 6 7"/>
  //     </svg>
  //   ),
  // },
  {
    key: "folder",
    label: "Lưu trữ",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  shipping:     { label: "Đang vận chuyển", color: "text-blue-light-600",   bg: "bg-blue-light-50 dark:bg-blue-light-500/10", dot: "bg-blue-light-500" },
  completed:    { label: "Hoàn thành",       color: "text-success-600",      bg: "bg-success-50 dark:bg-success-500/10", dot: "bg-success-500" },
  missing_docs: { label: "Thiếu giấy tờ",   color: "text-error-600",        bg: "bg-error-50 dark:bg-error-500/10", dot: "bg-error-500" },
};


const DOC_STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  ok:      { label: "Đã có",      color: "text-success-600", dot: "bg-success-500" },
  missing: { label: "Còn thiếu",  color: "text-error-600",   dot: "bg-error-500" },
  pending: { label: "Đang chờ",   color: "text-warning-600", dot: "bg-warning-500" },
  expired: { label: "Hết hạn",    color: "text-gray-500",    dot: "bg-gray-400" },
};

const FLOW_STAGES: ShipmentFlowStage[] = [
  { key: "buying", label: "Lên đơn hàng", shortLabel: "PI" },
  { key: "shipping", label: "Xin giấy phép / Vận chuyển biển", shortLabel: "INV..." },
  { key: "arrived", label: "Đã đến cảng", shortLabel: "Cảng" },
  { key: "declared", label: "Nộp tờ khai", shortLabel: "Tờ khai" },
  { key: "fifteenb", label: "Mẫu 15B", shortLabel: "15B" },
  { key: "customs", label: "Thông quan", shortLabel: "MV/QDTQ" },
  { key: "delivered", label: "Giao hàng thành công", shortLabel: "Trả công" },
];

const STAGE_DOC_GROUPS: Record<Exclude<ShipmentFlowStage["key"], "delivered">, string[]> = {
  buying: ["PI"],
  shipping: ["INV", "BL", "PKL", "CO", "HC"],
  arrived: ["DON_KD"],
  declared: ["BB_LM", "PHI_TK", "THUE_NK", "TK"],
  fifteenb: ["15B"],
  customs: ["QDTQ", "MV"],
};

type CarrierTrackingLink = {
  name: string;
  aliases: string[];
  requiresManualCode: boolean;
  usesBackendApi?: boolean;
  buildUrl: (trackingCode: string) => string;
};

type TrackingApiResponse = {
  success?: boolean;
  message?: string;
};

function buildBackendTrackingUrl(endpoint: string, trackingCode: string): string {
  const normalizedApiBase = API_BASE.replace(/\/+$/, "");
  return `${normalizedApiBase}${endpoint}/${encodeURIComponent(trackingCode)}`;
}

function buildMscTrackingUrl(trackingCode: string): string {
  const params = btoa(`trackingNumber=${trackingCode}&trackingMode=0`);
  return `https://www.msc.com/en/track-a-shipment?params=${encodeURIComponent(params)}`;
}

// Chỉ hiển thị link cho các hãng đã được cấu hình. Có thể bổ sung URL tại đây
// khi có thêm danh sách tracking chính thức từ các hãng tàu.
const CARRIER_TRACKING_LINKS: CarrierTrackingLink[] = [
  {
    name: "Hapag-Lloyd",
    aliases: ["happ","hapag", "hapag-lloyd", "hapag lloyd"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=${trackingCode}`,
  },
  {
    name: "Maersk",
    aliases: ["maersk", "a.p. moller", "apm"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://www.maersk.com/tracking/${trackingCode}`,
  },
  {
    name: "MSC",
    aliases: ["msc", "mediterranean shipping"],
    requiresManualCode: false,
    buildUrl: buildMscTrackingUrl,
  },
  {
    name: "CMA CGM",
    aliases: ["cma", "cma cgm"],
    requiresManualCode: false,
    usesBackendApi: true,
    buildUrl: (trackingCode) => buildBackendTrackingUrl("/api/tracking/cma", trackingCode),
  },
  {
    name: "COSCO",
    aliases: ["cosco", "cosco shipping"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BOOKING&number=${trackingCode}`,
  },
  {
    name: "HMM",
    aliases: ["hmm", "hyundai merchant marine"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://www.hmm21.com/e-service/search/index.do?query=${trackingCode}`,
  },
  {
    name: "FESCO",
    aliases: ["fesco"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://my.fesco.com/tracking?tab=${trackingCode}`,
  },
  {
    name: "Yang Ming",
    aliases: ["yang ming", "yangming", "yml"],
    requiresManualCode: false,
    usesBackendApi: true,
    buildUrl: (trackingCode) => buildBackendTrackingUrl("/api/tracking/yangming", trackingCode),
  },
  {
    name: "CKLINE",
    aliases: ["ckline", "ck line", "ckl"],
    requiresManualCode: false,
    usesBackendApi: true,
    buildUrl: (trackingCode) => buildBackendTrackingUrl("/api/tracking/ckline", trackingCode),
  },
  {
    name: "EVERGREEN",
    aliases: ["evergreen", "evergreen marine", "ever", "emc", "shipmentlink"],
    requiresManualCode: false,
    usesBackendApi: true,
    buildUrl: (trackingCode) => buildBackendTrackingUrl("/api/tracking/shipmentlink", trackingCode),
  },
  {
    name: "ONE",
    aliases: ["one",
      "ONE", "one cargo"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam=${trackingCode}&trakNoTpCdParam=B`,
  },
  {
    name: "OOCL",
    aliases: ["oocl", "oocl shipping"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://www.oocl.com/Pages/ExpressLink.aspx?eltype=ct&businessType=bookingNumber&businessNumber=${trackingCode}&language=en`,
  },
  {
    name: "PIL",
    aliases: ["pil", "pacific international lines"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://www.pilship.com/digital-solutions/?tab=customer&id=track-trace&label=containerTandT&module=TrackTraceBL&refNo=${trackingCode}`,
  },
  {
    name: "SINOKOR",
    aliases: ["sinokor", "sinokor shipping"],
    requiresManualCode: false,
    buildUrl: (trackingCode) => `https://ebiz.sinokor.co.kr/BLDetail?blno=${trackingCode}`,
  }
];

function findCarrierTrackingLink(vessel?: string): CarrierTrackingLink | null {
  const normalizedVessel = (vessel || "").toLowerCase().trim();
  if (!normalizedVessel) return null;
  return CARRIER_TRACKING_LINKS.find((carrier) =>
    carrier.aliases.some((alias) => normalizedVessel.includes(alias))
  ) || null;
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start">
      <span className="w-full sm:w-40 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{label}</span>
      <span className={`min-w-0 break-words text-sm font-medium text-gray-800 dark:text-white/90 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatAtaDelta(eta?: string, ata?: string): string | null {
  if (!eta || !ata) return null;
  const etaDate = new Date(`${eta}T00:00:00`);
  const ataDate = new Date(`${ata}T00:00:00`);
  const diffDays = Math.round((ataDate.getTime() - etaDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Giao đúng hạn";
  if (diffDays < 0) return `Giao sớm ${Math.abs(diffDays)} ngày`;
  return `Giao muộn ${diffDays} ngày`;
}

function normalizeDocKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function getStageOrder(stage: ShipmentFlowStage["key"]): number {
  return FLOW_STAGES.findIndex((s) => s.key === stage);
}

function hasOutOfOrderDocuments(shipment: Shipment): boolean {
  const documents = shipment.documents || [];
  const activeStage = shipment.flowStageKey || "buying";
  if (activeStage === "delivered") return false;

  const currentIndex = getStageOrder(activeStage);
  if (currentIndex < 0) return false;

  const currentStageKeys = STAGE_DOC_GROUPS[activeStage];
  const laterStageKeys = FLOW_STAGES.slice(currentIndex + 1)
    .map((stage) => (stage.key === "delivered" ? ["TRA_CONG"] : STAGE_DOC_GROUPS[stage.key as Exclude<ShipmentFlowStage["key"], "delivered">]))
    .flat();

  const hasMissingCurrentStageDocs = currentStageKeys.some((key) =>
    documents.some((doc) => normalizeDocKey(doc.name).includes(key) && doc.status !== "ok")
  );

  const hasLaterStageDocs = laterStageKeys.some((key) =>
    documents.some((doc) => normalizeDocKey(doc.name).includes(key) && doc.status === "ok")
  );

  return hasMissingCurrentStageDocs && hasLaterStageDocs;
}

function buildFallbackName(email: string): string {
  const localPart = email.split("@")[0] || "";
  const parts = localPart.replace(/[._-]+/g, " ").trim();
  return parts || "Người nhận";
}

function toReadableName(email?: string, ownerName?: string): string {
  if (ownerName && ownerName.trim()) return ownerName.trim();
  if (email) return buildFallbackName(email);
  return "";
}

async function fetchPIRecipient(orderCode: string): Promise<{ email: string; name: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/getPIFiles`, {
      cache: "no-store",
    });

    if (!res.ok) return null;

    const json = await res.json();
    const files = Array.isArray(json?.files) ? json.files : [];
    const matchedFile = files.find((file: { fileName?: string; ownerEmail?: string; ownerName?: string }) => {
      const fileName = String(file?.fileName || "").toUpperCase();
      return fileName.includes(orderCode.toUpperCase()) && (file?.ownerEmail || file?.ownerName);
    });

    const firstFile = matchedFile || files.find((file: { ownerEmail?: string; ownerName?: string }) => file?.ownerEmail || file?.ownerName);
    if (!firstFile) return null;

    const email = String(firstFile.ownerEmail || "").trim();
    const name = toReadableName(email, String(firstFile.ownerName || "").trim());
    if (!email) return null;

    return { email, name };
  } catch (error) {
    console.warn("Không lấy được PI recipient", error);
    return null;
  }
}

function pickRecipient(shipment: Shipment) {
  const docs = shipment.documents || [];
  const missingDocs = docs.filter((doc) => doc.status === "missing" || doc.status === "pending");
  const okDocs = docs.filter((doc) => doc.status === "ok");

  const relatedCandidates = [
    ["INV", "BL", "CO", "HC", "PKL"],
    ["BL", "CO", "HC", "PKL", "INV"],
    ["QDTQ", "MV", "15B"],
    ["DON_KD"],
    ["BB_LM", "PHI_TK", "THUE_NK", "TK"],
    ["TRA_CONG", "QDTQ", "MV"],
  ];

  const pickFromDocs = (docList: typeof docs, keys: string[]) => {
    for (const key of keys) {
      const match = docList.find((doc) => normalizeDocKey(doc.name).includes(key));
      if (match?.uploaderEmail) {
        return {
          email: match.uploaderEmail,
          name: match.uploaderName || buildFallbackName(match.uploaderEmail),
        };
      }
    }
    return null;
  };

  for (const missing of missingDocs) {
    const missingKey = normalizeDocKey(missing.name);
    const candidateKeys = relatedCandidates.find((group) => group.some((k) => missingKey.includes(k))) || ["INV", "BL", "CO", "HC", "PKL", "QDTQ", "MV", "15B", "DON_KD", "BB_LM", "PHI_TK", "THUE_NK", "TK"];
    const recipient = pickFromDocs(okDocs, candidateKeys);
    if (recipient?.email) return recipient;
  }

  const anyRecipient = docs.find((doc) => doc.uploaderEmail);
  if (anyRecipient?.uploaderEmail) {
    return {
      email: anyRecipient.uploaderEmail,
      name: anyRecipient.uploaderName || buildFallbackName(anyRecipient.uploaderEmail),
    };
  }

  return { email: "", name: "" };
}

export default function ShipmentDetailModal({ shipment, isOpen, onClose, onRefresh }: ShipmentDetailModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role?.trim().toLowerCase() === "admin";
  const [activeTab, setActiveTab] = useState<ModalTab>("overview");
  const [archived, setArchived] = useState<ArchivedDocumentsResponse | null>(null);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [localUploads, setLocalUploads] = useState<Record<string, string>>({});
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({ product: "", carrier: "" });
  const [selectedMissingDocIds, setSelectedMissingDocIds] = useState<string[]>([]);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isOpeningTracking, setIsOpeningTracking] = useState(false);
  const [trackingFeedback, setTrackingFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (shipment) {
      setEditForm({
        product: shipment.shipName || "",
        carrier: shipment.vessel || "",
      });
      setIsEditing(false);
    }
  }, [shipment?.id]);

  useEffect(() => {
    if (activeTab === "documents") {
      setPreviewUrl(null);
    }
    if (activeTab === "journey") {
      setTrackingFeedback(null);
    }
  }, [activeTab, shipment?.id]);

  useEffect(() => {
    if (!isOpen || !shipment) return;
    setArchived(null);
    void getArchivedDocuments(shipment.orderCode)
      .then((result) => setArchived(result.archived ? result : { success: true, archived: false }))
      .catch(() => setArchived({ success: true, archived: false }));
  }, [isOpen, shipment]);

  if (!shipment) return null;

  const statusInfo = STATUS_MAP[shipment.status];
  const flowLabel = shipment.flowStageLabel || statusInfo?.label;
  const hasStageWarning = hasOutOfOrderDocuments(shipment);
  // const flowColor = shipment.flowStageKey === "delivered"
  //   ? "text-success-600 bg-success-50 dark:bg-success-500/10"
  //   : shipment.flowStageKey === "buying"
  //   ? hasStageWarning
  //     ? "text-error-600 bg-error-50 dark:bg-error-500/10"
  //     : "text-amber-700 bg-amber-50 dark:bg-amber-500/10"
  //   : hasStageWarning || shipment.flowStageLate
  //   ? "text-error-600 bg-error-50 dark:bg-error-500/10"
  //   : "text-blue-light-600 bg-blue-light-50 dark:bg-blue-light-500/10";

  const flowColor = shipment.flowStageKey === "delivered"
  ? "text-success-600 bg-success-50 dark:bg-success-500/10"

  : shipment.flowStageKey === "buying"
  ? hasStageWarning
    ? "text-blue-light-600 bg-blue-light-50 dark:bg-blue-light-500/10"
    : "text-amber-700 bg-amber-50 dark:bg-amber-500/10"

  : hasStageWarning || shipment.flowStageLate
  ? "text-blue-light-600 bg-blue-light-50 dark:bg-blue-light-500/10"
  : "text-blue-light-600 bg-blue-light-50 dark:bg-blue-light-500/10";
  const missingDocsCount = shipment.totalDocs - shipment.receivedDocs;
  const documentsSorted = [...(shipment.documents || [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "ok" ? -1 : 1;
    return a.name.localeCompare(b.name, "vi");
  });
  const missingDocs = documentsSorted.filter(d => d.status === "missing" || d.status === "pending");
  const selectedMissingDocs = missingDocs.filter((doc) => selectedMissingDocIds.includes(doc.id));
  const selectedMissingIds = selectedMissingDocIds;
  const carrierTrackingLink = findCarrierTrackingLink(shipment.vessel);
  // Tất cả hãng dùng chuỗi trước dấu phẩy trong cột BL NO.
  const trackingCode = shipment.bill?.split(",")[0].trim() || "";
  const carrierTrackingUrl = carrierTrackingLink && trackingCode
    ? carrierTrackingLink.buildUrl(trackingCode)
    : null;

  const handleOpenCarrierTracking = async () => {
    if (!carrierTrackingLink?.usesBackendApi || !carrierTrackingUrl) return;

    setIsOpeningTracking(true);
    setTrackingFeedback(null);

    try {
      const response = await fetch(carrierTrackingUrl, {
        method: "GET",
        cache: "no-store",
      });
      const result = await response
        .json()
        .catch(() => ({})) as TrackingApiResponse;
      const message = result.message?.trim();

      if (!response.ok || result.success !== true) {
        throw new Error(
          message || `Không thể mở tracking ${carrierTrackingLink.name}.`,
        );
      }

      setTrackingFeedback({
        type: "success",
        message: message || `Đã mở tracking ${carrierTrackingLink.name}.`,
      });
    } catch (error) {
      setTrackingFeedback({
        type: "error",
        message: error instanceof Error
          ? error.message
          : `Không thể mở tracking ${carrierTrackingLink.name}.`,
      });
    } finally {
      setIsOpeningTracking(false);
    }
  };

  const toggleMissingDocument = (docId: string) => {
    setSelectedMissingDocIds(
      selectedMissingIds.includes(docId)
        ? selectedMissingIds.filter((id) => id !== docId)
        : [...selectedMissingIds, docId]
    );
  };

  const handlePickUpload = (docId: string) => {
    if (!isAdmin || archived?.archived) return;
    setSelectedMissingDocIds([docId]);
    window.setTimeout(() => document.getElementById("shipment-document-upload")?.click(), 0);
  };

  const handleUploadSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const docId = selectedMissingDocIds[0];
    if (!file || !docId || !isAdmin || archived?.archived || uploadingDocId) return;
    event.target.value = "";

    setUploadingDocId(docId);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Không đọc được file"));
        reader.onerror = () => reject(new Error("Không đọc được file"));
        reader.readAsDataURL(file);
      });
      const fileData = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : dataUrl;

      await uploadDocument({
        action: "uploadDocument",
        orderCode: shipment.orderCode,
        documentCode: docId,
        fileName: file.name,
        fileData,
      });
      await checkDocumentsAndSaveStatus();
      setLocalUploads((current) => ({ ...current, [docId]: URL.createObjectURL(file) }));
      await onRefresh?.();
      alert(`Đã bổ sung chứng từ ${docId} thành công`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể upload chứng từ");
    } finally {
      setUploadingDocId(null);
      setSelectedMissingDocIds([]);
    }
  };

  const handleArchive = async () => {
    if (!isAdmin || shipment.docStatus !== 1 || archived?.archived || isArchiveLoading) return;
    setIsArchiveLoading(true);
    try {
      await moveCompletedOrder(shipment.orderCode);
      const result = await getArchivedDocuments(shipment.orderCode);
      setArchived(result);
      setActiveTab("folder");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể lưu trữ hồ sơ");
    } finally {
      setIsArchiveLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!isAdmin || isSavingEdit) return;
    const data: Record<string, string | number> = {};
    if (editForm.product !== (shipment.shipName || "")) data["Tên hàng"] = editForm.product;
    if (editForm.carrier !== (shipment.vessel || "")) data["Hãng tàu"] = editForm.carrier;
    if (Object.keys(data).length === 0) {
      setIsEditing(false);
      return;
    }

    setIsSavingEdit(true);
    try {
      await editSummary({ action: "editSummary", orderCode: shipment.orderCode, data });
      await onRefresh?.();
      setIsEditing(false);
      alert("Đã cập nhật thông tin đơn hàng");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể cập nhật đơn hàng");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-2 my-2 flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl flex-col overflow-hidden sm:mx-4 sm:my-4 sm:max-h-[92vh] sm:w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 pb-4 pt-5 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pb-4 sm:pt-6">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            className="absolute right-14 top-3 z-10 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300 sm:right-20 sm:top-6"
          >
            {isEditing ? "Đóng sửa" : "Edit"}
          </button>
        )}
        <div className="min-w-0 flex flex-col gap-1 pr-10 sm:pr-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="min-w-0 break-all text-base font-bold tracking-wide text-gray-900 dark:text-white sm:text-lg font-mono">
              {shipment.orderCode}
            </h2>
            <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${flowColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo?.dot || "bg-current"}`} />
              <span className="truncate">{flowLabel}</span>
            </span>
          </div>
          {shipment.soldAtSea && (
            <span className="text-xs font-semibold text-success-600 dark:text-success-400">
              Đã bán trên biển
            </span>
          )}
          <p className="break-words text-sm text-gray-500 dark:text-gray-400">{shipment.shipName}</p>
          <p className="break-words text-xs text-gray-400">Nhà cung cấp: <span className="font-medium text-gray-600 dark:text-gray-300">{shipment.supplier}</span></p>
        </div>

        {/* Missing docs badge */}
        {missingDocsCount > 0 && (
          <div className="flex w-fit max-w-full flex-shrink-0 items-center gap-1.5 rounded-xl border border-error-100 bg-error-50 px-3 py-1.5 dark:border-error-500/20 dark:bg-error-500/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error-500">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="text-xs font-semibold text-error-600 dark:text-error-400">
              {missingDocsCount} giấy tờ thiếu
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1 border-b border-gray-100 px-3 py-2 no-scrollbar dark:border-gray-800 sm:flex-nowrap sm:overflow-x-auto sm:px-6">
        {TAB_LIST.filter((tab) => tab.key !== "folder" || archived?.archived).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex min-w-0 basis-[calc(50%-0.25rem)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium transition-all duration-150 sm:basis-auto sm:flex-shrink-0 sm:flex-none sm:justify-start sm:px-3 sm:py-1.5 ${
              activeTab === tab.key
                ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        {isAdmin && shipment.docStatus === 1 && !archived?.archived && (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isArchiveLoading}
            className="inline-flex min-w-0 basis-[calc(50%-0.25rem)] flex-1 items-center justify-center gap-1.5 rounded-lg bg-success-500 px-2 py-2 text-xs font-semibold text-white hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-60 sm:basis-auto sm:flex-none sm:px-3 sm:py-1.5"
          >
            {isArchiveLoading ? "Đang lưu..." : "Lưu trữ"}
          </button>
        )}
      </div>

      <input id="shipment-document-upload" type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" onChange={handleUploadSelected} />

      {/* Tab Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 custom-scrollbar sm:px-6 sm:py-5">

        {isEditing && (
          <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Chỉnh sửa thông tin đơn hàng</p>
              <span className="text-[11px] text-gray-500">Order: {shipment.orderCode}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ["product", "Tên sản phẩm", "text"],
                ["carrier", "Hãng tàu", "text"],
              ] as const).map(([key, label, type]) => (
                <label key={key} className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                  {label}
                  <span className="relative block">
                    <input
                      id={`shipment-edit-${key}`}
                      type={type}
                      value={editForm[key]}
                      onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIsEditing(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Hủy</button>
              <button type="button" onClick={handleSaveEdit} disabled={isSavingEdit} className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{isSavingEdit ? "Đang lưu..." : "Lưu thay đổi"}</button>
            </div>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div className="flex min-h-0 max-h-[calc(100dvh-13rem)] min-w-0 flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[calc(92vh-180px)] sm:gap-6 sm:pr-1">
            {/* Key info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Thông tin vận chuyển</p>
                <div className="flex flex-col gap-2">
                  <InfoRow label="Hãng tàu" value={shipment.vessel} />
                  <InfoRow label="Bill of Lading" value={shipment.bill} mono />
                  <InfoRow label="Cảng đến" value={shipment.port} />
                  <InfoRow label="Số cont" value={shipment.contCount?.toString()} />
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Thời gian</p>
                <div className="flex flex-col gap-2">
                  <InfoRow label="ETD (Dự kiến xuất)" value={formatDate(shipment.etd)} />
                  <InfoRow label="ETA (Dự kiến đến)" value={formatDate(shipment.eta)} />
                  <InfoRow label="ATA (Thực tế đến)" value={shipment.ata ? formatDate(shipment.ata) : "Chưa đến"} />
                  {shipment.ata && shipment.eta && (
                    <InfoRow label="So với ETA" value={formatAtaDelta(shipment.eta, shipment.ata) || undefined} />
                  )}
                  <InfoRow label="Lệnh thả hàng" value={shipment.telex} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Trạng thái đơn hàng</p>
              <ShipmentStatusBar
                activeStage={shipment.flowStageKey || "buying"}
                stages={FLOW_STAGES}
                isLate={shipment.flowStageLate}
                hasOutOfOrderDocs={hasStageWarning}
              />
              <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-800 dark:bg-gray-900 dark:text-white">
                {flowLabel}
              </div>
            </div>

            {/* Supplier / Factory info */}
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-white font-semibold text-sm">
                {(shipment.supplier || "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{shipment.supplier || "Chưa có"}</p>
                {shipment.factory && <p className="text-xs text-gray-400">{shipment.factory}{shipment.origin ? ` • ${shipment.origin}` : ""}</p>}
              </div>
            </div>

            {/* Docs summary */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Giấy tờ / Chứng từ</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-success-400 to-success-500 transition-all duration-700"
                    style={{ width: shipment.totalDocs > 0 ? `${(shipment.receivedDocs / shipment.totalDocs) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-800 mb-4 dark:text-white whitespace-nowrap">
                  {shipment.receivedDocs} / {shipment.totalDocs}
                </span>
              </div>
              {missingDocsCount > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-error-600 dark:text-error-400">
                    ⚠️ Còn thiếu {missingDocsCount} giấy tờ
                  </p>
                  {shipment.missingDocs && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
                      {shipment.missingDocs}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── JOURNEY ── */}
        {activeTab === "journey" && (
          <div className="flex min-h-0 max-h-[calc(100dvh-13rem)] flex-col gap-6 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[calc(92vh-180px)]">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02] sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Tra cứu lịch trình
                  </p>
                  <p className="mt-2 text-sm font-medium text-gray-800 dark:text-white/90">
                    {shipment.vessel || "Chưa xác định hãng tàu"}
                  </p>
                    <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                    Mở trang tra cứu chính thức của hãng để xem vị trí và lịch trình container.
                  </p>
                  {trackingCode && (
                    <p className="mt-1 text-xs font-mono text-gray-400 dark:text-gray-500">
                      Mã tra cứu: {trackingCode}
                    </p>
                  )}
                </div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-brand-500">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>

              {carrierTrackingLink && carrierTrackingUrl ? (
                <>
                  {carrierTrackingLink.requiresManualCode && (
                    <p className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
                      Hãy copy mã tra cứu ở trên trước khi ấn vào link.
                    </p>
                  )}
                  {carrierTrackingLink.usesBackendApi ? (
                    <button
                      type="button"
                      onClick={handleOpenCarrierTracking}
                      disabled={isOpeningTracking}
                      className="mt-4 flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-500 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-wait disabled:opacity-70 dark:border-brand-500/30 sm:px-4"
                    >
                      <span className="min-w-0 break-words text-left leading-5">
                        {isOpeningTracking
                          ? `Đang mở tracking ${carrierTrackingLink.name}...`
                          : `Tra cứu lịch trình ${carrierTrackingLink.name}`}
                      </span>
                      {isOpeningTracking ? (
                        <svg className="flex-shrink-0 animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      ) : (
                        <svg className="flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <a
                      href={carrierTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${carrierTrackingLink.requiresManualCode ? "mt-2" : "mt-4"} flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-500 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 dark:border-brand-500/30 sm:px-4`}
                    >
                      <span className="min-w-0 break-words text-left leading-5">Tra cứu lịch trình {carrierTrackingLink.name}</span>
                      <svg className="flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                  {carrierTrackingLink.usesBackendApi && trackingFeedback && (
                    <p
                      role={trackingFeedback.type === "error" ? "alert" : "status"}
                      className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                        trackingFeedback.type === "success"
                          ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
                          : "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
                      }`}
                    >
                      {trackingFeedback.message}
                    </p>
                  )}
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-warning-200 bg-warning-50/70 px-4 py-3 dark:border-warning-500/30 dark:bg-warning-500/10">
                  <p className="text-sm font-semibold text-warning-700 dark:text-warning-300">
                    {carrierTrackingLink ? "Chưa có mã tra cứu để mở lịch trình" : "Hãng tàu chưa cung cấp lịch trình"}
                  </p>
                  <p className="mt-1 text-xs text-warning-600 dark:text-warning-400">
                    {carrierTrackingLink ? "Vui lòng bổ sung mã BL/container trong dữ liệu shipment." : "Hiện chưa có link tra cứu cho hãng tàu này."}
                  </p>
                </div>
              )}
            </div>

            {/* Journey detail cards */}
            {shipment.timeline && (
              <div className="flex flex-col gap-3">
                {shipment.timeline.map((stage, idx) => (
                  <div
                    key={stage.id}
                    className={`flex min-w-0 gap-3 rounded-xl border p-3 transition-all sm:gap-4 sm:p-4 ${
                      stage.isCompleted
                        ? "border-success-100 bg-success-50/50 dark:border-success-500/20 dark:bg-success-500/5"
                        : stage.isCurrent
                        ? "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10"
                        : "border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-white/[0.01]"
                    }`}
                  >
                    <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                      stage.isCompleted ? "bg-success-500 text-white" : stage.isCurrent ? "bg-brand-500 text-white" : "bg-gray-200 text-gray-500 dark:bg-gray-700"
                    }`}>
                      {stage.isCompleted ? "✓" : idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`min-w-0 break-words text-sm font-semibold ${
                          stage.isCompleted ? "text-success-700 dark:text-success-400" : stage.isCurrent ? "text-brand-700 dark:text-brand-300" : "text-gray-500"
                        }`}>{stage.label}</p>
                        {stage.isCurrent && (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-500 dark:bg-brand-500/10">Đang ở đây</span>
                        )}
                      </div>
                      {stage.portName && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">📍 {stage.portName}</p>}
                      {stage.timestamp && <p className="text-xs text-gray-400 mt-0.5">🕐 {formatDateTime(stage.timestamp)}</p>}
                      {stage.note && (
                        <p className="mt-1.5 text-xs text-warning-700 dark:text-warning-300 bg-warning-50 dark:bg-warning-500/10 rounded-lg px-2 py-1">
                          ⚠️ {stage.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {activeTab === "documents" && (
          <div className="flex min-h-0 max-h-[calc(100dvh-13rem)] flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[calc(92vh-180px)]">
            {/* Missing docs alert */}
            {missingDocs.length > 0 && (
              <div className="rounded-xl border border-error-200 bg-error-50 p-3 dark:border-error-500/20 dark:bg-error-500/10 sm:p-4">
                <div className="flex items-start gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error-500 mt-0.5 flex-shrink-0">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-error-700 dark:text-error-400">
                      Còn thiếu {missingDocs.length} chứng từ
                    </p>
                    <p className="mt-2 text-[11px] text-error-600 dark:text-error-300">
                      Bấm vào chứng từ để bổ sung file (Admin):
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {missingDocs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handlePickUpload(doc.id)}
                          disabled={!isAdmin || Boolean(archived?.archived) || Boolean(uploadingDocId)}
                          aria-label={`Bổ sung ${doc.name}`}
                          className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                            localUploads[doc.id]
                              ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
                              : "border-error-100 bg-white/70 text-error-600 hover:border-error-200 dark:border-error-500/20 dark:bg-error-500/5 dark:text-error-300"
                          }`}
                        >
                          {doc.name.replace(/^Chứng từ\s*/i, "")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Email alert button */}
            {missingDocs.length > 0 && (
              <button
                onClick={() => undefined}
                disabled={isSendingEmail || emailSent || selectedMissingDocs.length === 0}
                className={`hidden flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center text-sm font-semibold leading-5 transition-all duration-200 sm:px-4 ${
                  emailSent
                    ? "border-success-200 bg-success-50 text-success-600 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
                    : "border-brand-200 bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                }`}
              >
                {emailSent ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Đã gửi email thành công!
                  </>
                ) : isSendingEmail ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                      <polyline points="23 4 23 10 17 10"/>
                      <polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Đang gửi email...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Gửi email cảnh báo ({selectedMissingDocs.length} chứng từ)
                  </>
                )}
              </button>
            )}

            {/* Document list */}
            <div className="max-h-[320px] overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-2">
              {documentsSorted.map(doc => {
                const docStatus = DOC_STATUS_MAP[doc.status];
                return (
                  <div
                    key={doc.id}
                    className={`flex flex-col items-stretch gap-3 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:p-3.5 ${
                      doc.status === "missing"
                        ? "border-error-100 bg-error-50/50 dark:border-error-500/20 dark:bg-error-500/5"
                        : doc.status === "pending"
                        ? "border-warning-100 bg-warning-50/50 dark:border-warning-500/20 dark:bg-warning-500/5"
                        : "border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-white/[0.02]"
                    }`}
                  >
                    {/* Icon */}
                    <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg ${
                      doc.status === "ok" ? "bg-success-100 dark:bg-success-500/10" :
                      doc.status === "missing" ? "bg-error-100 dark:bg-error-500/10" :
                      "bg-warning-100 dark:bg-warning-500/10"
                    }`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={
                        doc.status === "ok" ? "text-success-600" :
                        doc.status === "missing" ? "text-error-600" : "text-warning-600"
                      }>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">{doc.name}</p>
                      <p className="text-xs text-gray-400">{doc.type.toUpperCase()}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className={`flex items-center gap-1 text-xs font-semibold ${docStatus?.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${docStatus?.dot}`} />
                        {docStatus?.label}
                      </span>
                      {(doc.url || localUploads[doc.id]) && (
                        <button
                          type="button"
                          onClick={() => { setPreviewUrl(localUploads[doc.id] || doc.url || null); setPreviewName(doc.name); }}
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </button>
                      )}
                      {doc.status !== "ok" && !archived?.archived && (
                        <button type="button" disabled={!isAdmin || Boolean(uploadingDocId)} onClick={() => handlePickUpload(doc.id)} className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
                          {uploadingDocId === doc.id ? "Đang upload..." : localUploads[doc.id] ? "Đã chọn file" : "Bổ sung file"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {(!shipment.documents || shipment.documents.length === 0) && (
                <p className="py-8 text-center text-sm text-gray-400">Chưa có chứng từ nào</p>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
        {activeTab === "history" && (
          <div className="flex min-h-0 max-h-[calc(100dvh-13rem)] flex-col gap-1 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[calc(92vh-180px)]">
            {(shipment.statusHistory || []).length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Chưa có lịch sử cập nhật</p>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="flex flex-col gap-0">
                  {[...(shipment.statusHistory || [])].reverse().map((h) => (
                    <div key={h.id} className="relative flex gap-4 pb-5 pl-10">
                      {/* Dot */}
                      <div className="absolute left-2.5 top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-brand-500 dark:border-gray-900 shadow-sm" />
                      <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{h.action}</p>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(h.timestamp)}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{h.description}</p>
                        {h.user && (
                          <p className="mt-1 text-xs text-gray-400">
                            👤 {h.user}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FOLDER ── */}
        {activeTab === "folder" && (
          <div className="flex min-h-0 max-h-[calc(100dvh-13rem)] flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar sm:max-h-[calc(92vh-180px)]">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02] sm:p-5">
              <div className="mb-4 flex items-start gap-3 sm:items-center sm:gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning-100 dark:bg-warning-500/10 sm:h-12 sm:w-12">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning-600">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-gray-800 dark:text-white">Hồ sơ lưu trữ</p>
                  <p className="mt-0.5 break-words text-xs text-gray-400">Các chứng từ đã lưu trữ của {shipment.orderCode}</p>
                </div>
              </div>

              {archived?.folderUrl ? (
                <a
                  href={archived.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                className="flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-500 px-3 py-3 text-center text-sm font-semibold leading-5 text-white transition-colors hover:bg-brand-600 sm:px-4"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Mở hồ sơ lưu trữ
                </a>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center dark:border-gray-700 sm:p-6">
                  <p className="text-sm text-gray-400">Chưa có thư mục Drive được liên kết</p>
                </div>
              )}

              {archived?.files && archived.files.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  {archived.files.map((file) => (
                    <button key={file.fileId} type="button" onClick={() => { setPreviewUrl(file.fileUrl); setPreviewName(file.fileName); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      {file.fileName}
                    </button>
                  ))}
                </div>
              )}

              {shipment.timeUpdate && (
                <p className="mt-3 break-words text-center text-xs text-gray-400">
                  Cập nhật lần cuối: {new Date(shipment.timeUpdate).toLocaleString("vi-VN")}
                </p>
              )}
            </div>

            {/* Quick email from folder tab */}
            {/* {missingDocsCount > 0 && (
              <button
                onClick={() => undefined}
                disabled={isSendingEmail || emailSent || selectedMissingDocs.length === 0}
                className={`flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-center text-sm font-semibold leading-5 transition-all sm:px-4 ${
                  emailSent
                    ? "border-success-200 bg-success-50 text-success-600 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
                    : "border-error-200 bg-error-50 text-error-600 hover:bg-error-100 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400 disabled:opacity-60"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                {emailSent ? "Đã gửi!" : `Gửi email cảnh báo (${selectedMissingDocs.length} chứng từ)`}
              </button>
            )} */}
          </div>
        )}
      </div>
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{previewName}</p>
              <button type="button" onClick={() => setPreviewUrl(null)} className="text-xl text-gray-500 hover:text-gray-800 dark:hover:text-white">×</button>
            </div>
            <iframe title={previewName} src={previewUrl} className="min-h-0 flex-1" />
          </div>
        </div>
      )}
    </Modal>
  );
}
