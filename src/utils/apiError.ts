type ApiPayload = Record<string, unknown>;

export interface ParsedApiResponse {
  data: unknown;
  nonJsonPreview: string;
}

function isRecord(value: unknown): value is ApiPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function parseApiResponse(response: Response): Promise<ParsedApiResponse> {
  const text = await response.text();
  if (!text.trim()) return { data: null, nonJsonPreview: "" };
  try {
    return { data: JSON.parse(text) as unknown, nonJsonPreview: "" };
  } catch {
    return { data: null, nonJsonPreview: text.replace(/\s+/g, " ").trim().slice(0, 180) };
  }
}

export function getApiPayloadMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";
  return String(payload.message ?? payload.error ?? payload.detail ?? "").trim();
}

export function createHttpApiError(
  scope: string,
  method: string,
  path: string,
  response: Response,
  payload: unknown,
  nonJsonPreview = "",
): Error {
  const message = getApiPayloadMessage(payload);
  const detail = message
    || (nonJsonPreview ? `Backend trả dữ liệu không phải JSON: ${nonJsonPreview}` : response.statusText)
    || "Không có nội dung lỗi từ backend";
  return new Error(`[${scope}] ${method} ${path} thất bại (HTTP ${response.status}): ${detail}`);
}

export function createInvalidResponseError(scope: string, method: string, path: string, preview: string): Error {
  const detail = preview ? `Nội dung nhận được: ${preview}` : "Response rỗng";
  return new Error(`[${scope}] ${method} ${path} trả về response không phải JSON. ${detail}`);
}

export function createNetworkApiError(scope: string, method: string, path: string, error: TypeError): Error {
  return new Error(
    `[${scope}] Không thể kết nối khi gọi ${method} ${path}. Kiểm tra backend, NEXT_PUBLIC_API_BASE_URL và CORS. Chi tiết: ${error.message}`,
  );
}
