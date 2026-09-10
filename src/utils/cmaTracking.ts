export const CMA_TRACKING_ACTION = "https://www.cma-cgm.com/ebusiness/tracking";

export interface CmaTrackingRequest {
  method: string;
  action: string;
  fields: Record<string, unknown>;
}

export interface CmaTrackingLaunchResponse {
  success: boolean;
  carrier?: string;
  reference?: string;
  searchType?: string;
  message?: string;
  trackingRequest?: CmaTrackingRequest;
}

interface TrackingTab {
  close: () => void;
  location: { href: string };
}

interface CmaTrackingDependencies {
  requestLaunch: (reference: string) => Promise<CmaTrackingLaunchResponse>;
  showError: (message: string) => void;
  openTab?: (url: string, target: string) => TrackingTab | null;
  now?: () => number;
  onStarted?: () => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Không thể mở tracking CMA CGM";
}

export async function submitCmaTracking(
  reference: string,
  dependencies: CmaTrackingDependencies,
): Promise<boolean> {
  const targetName = `cma_tracking_${(dependencies.now || Date.now)()}`;
  const openTab = dependencies.openTab
    || ((url: string, target: string) => window.open(url, target));
  const trackingTab = openTab("about:blank", targetName);

  if (!trackingTab) {
    dependencies.showError("Trình duyệt đang chặn tab tracking. Vui lòng cho phép popup.");
    return false;
  }

  dependencies.onStarted?.();

  try {
    const response = await dependencies.requestLaunch(reference);
    const trackingRequest = response.trackingRequest;

    if (response.success !== true || !trackingRequest) {
      throw new Error(response.message || "Backend không trả về cấu hình tracking CMA CGM");
    }
    if (trackingRequest.action !== CMA_TRACKING_ACTION) {
      throw new Error("Tracking URL CMA CGM không hợp lệ");
    }
    if (!trackingRequest.fields || typeof trackingRequest.fields !== "object") {
      throw new Error("Tracking fields CMA CGM không hợp lệ");
    }

    // CMA hiện dùng trang tracking dạng GET. POST trực tiếp vào route này có thể
    // vượt CAPTCHA nhưng sau đó bị chuyển tới trang Not Found.
    const resolvedReference = String(
      response.reference
      || trackingRequest.fields["SearchViewModel.Reference"]
      || reference,
    ).trim();
    const resolvedSearchType = String(
      response.searchType
      || trackingRequest.fields["SearchViewModel.SearchBy"]
      || "",
    ).trim();

    if (!resolvedReference) {
      throw new Error("CMA CGM không trả về mã tracking hợp lệ");
    }
    if (resolvedSearchType !== "Booking" && resolvedSearchType !== "Container") {
      throw new Error("Loại tìm kiếm CMA CGM không hợp lệ");
    }

    const query = new URLSearchParams({
      Reference: resolvedReference,
      SearchBy: resolvedSearchType,
    });
    trackingTab.location.href = `${CMA_TRACKING_ACTION}?${query.toString()}`;
    return true;
  } catch (error) {
    trackingTab.close();
    dependencies.showError(getErrorMessage(error));
    return false;
  }
}
