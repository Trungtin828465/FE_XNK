import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Đổi mật khẩu | XNK", description: "Cập nhật mật khẩu tài khoản hệ thống XNK" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
