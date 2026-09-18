import assert from "node:assert/strict";
import test from "node:test";
import { activityLogSummary } from "../src/utils/activityLogSummary.ts";

test("old verbose OCR logs show only order and document in the main line", () => {
  const result = activityLogSummary(
    "UPLOAD_OCR_DOCUMENT",
    "Đơn 00129263002; thay đổi: Số kiện: (trống) → 2.592 | Trọng lượng NET: (trống) → 25.920,00",
    "ShipmentDetailModal/Documents/PKL",
  );
  assert.equal(result, "Đơn 00129263002 · PKL");
});

test("new upload logs keep the order and document", () => {
  assert.equal(activityLogSummary("UPLOAD_DOCUMENT", "Đã upload 2 file chứng từ BL cho đơn VTF008", "ShipmentDetailModal/Documents"), "Đơn VTF008 · BL");
});

test("transport and account actions keep a useful identifier", () => {
  assert.equal(activityLogSummary("EDIT_RETURN_ITEM", "Cập nhật vận chuyển Container MSCU1234567 của đơn HD001", ""), "Đơn HD001 · MSCU1234567");
  assert.equal(activityLogSummary("REGISTER_USER", "Tạo tài khoản thanh; role xnk; session edit", "", "en"), "Account thanh");
});
