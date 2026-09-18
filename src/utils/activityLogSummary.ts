/** Keep the main audit line short; older, verbose records remain available in details. */
export function activityLogSummary(
  action: string,
  detail: string,
  location: string,
  language: "vi" | "en" = "vi",
): string {
  const orderCode = detail.match(/(?:^|[\s;])(?:đơn(?:\s+hàng)?|order)\s+([^\s;,]+)/i)?.[1];
  const documentCode = location.match(/\/Documents\/([A-Z0-9_]+)/i)?.[1]
    || detail.match(/chứng từ\s+([A-Z0-9_]+)/i)?.[1];
  const containerCode = detail.match(/\bcontainer\s+([^\s;,]+)/i)?.[1];

  if (orderCode) {
    const subject = `${language === "en" ? "Order" : "Đơn"} ${orderCode}`;
    if (documentCode && ["UPLOAD_DOCUMENT", "UPLOAD_OCR_DOCUMENT", "PASS_DOCUMENT"].includes(action.toUpperCase())) {
      return `${subject} · ${documentCode}`;
    }
    if (containerCode && action === "EDIT_RETURN_ITEM") return `${subject} · ${containerCode}`;
    return subject;
  }

  const account = detail.match(/tài khoản\s+([^\s;,]+)/i)?.[1];
  if (account) return `${language === "en" ? "Account" : "Tài khoản"} ${account}`;

  const firstClause = detail.split(/[;\n]/, 1)[0]?.trim() || "";
  return firstClause.length > 110 ? `${firstClause.slice(0, 107)}…` : firstClause;
}
