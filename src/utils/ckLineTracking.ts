export const CK_LINE_CARRIER_CONFIG = {
  name: "CK LINE",
  aliases: ["ck line", "ckline", "ck"],
  trackingType: "BL" as const,
  requiresManualCode: false,
  usesBackendApi: true,
};

export interface CKLineTrackingLaunchResponse {
  success: boolean;
  message?: string;
  carrier?: string;
  code?: string;
  bl?: string;
}

export function isCKLineCarrier(carrier?: string): boolean {
  const normalized = String(carrier || "").trim().toLowerCase();
  if (!normalized) return false;
  return CK_LINE_CARRIER_CONFIG.aliases.some((alias) => normalized.includes(alias));
}

export function buildCKLineTrackingPayload(code: string): { code: string } {
  return { code: code.trim() };
}
