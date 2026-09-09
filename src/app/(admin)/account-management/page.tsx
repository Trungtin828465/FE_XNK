"use client";

import { canPerformShipmentAction } from "@/config/shipmentActionPermissions";
import { useAuth } from "@/context/AuthContext";
import { useSystemConfirm } from "@/context/SystemConfirmContext";
import { useSystemNotification } from "@/context/SystemNotificationContext";
import { recordActivity } from "@/services/activityLogApi";
import {
  getUserById,
  getUsers,
  registerUser,
  updateUser,
  updateUserPassword,
  type ManagedUser,
} from "@/services/authApi";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;
const ROLE_OPTIONS = ["xnk", "mua hàng"];
const SESSION_OPTIONS = ["all", "edit", "view"];
type TabKey = "users" | "register" | "password";

const EMPTY_REGISTER = {
  username: "",
  name: "",
  password: "",
  confirmPassword: "",
  role: "xnk",
  session: "view",
};

export default function AccountManagementPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { confirm } = useSystemConfirm();
  const { notify } = useSystemNotification();
  const canManage = canPerformShipmentAction(user, "manageUsers");
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState("xnk");
  const [editSession, setEditSession] = useState("view");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError("");
    try {
      setUsers(await getUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải danh sách tài khoản");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!canManage) {
      router.replace("/");
      return;
    }
    void loadUsers();
  }, [canManage, loadUsers, router]);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!keyword) return users;
    return users.filter((item) =>
      [item.username, item.name, item.role, item.session]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(keyword),
    );
  }, [query, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const displayedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openEdit = async (selected: ManagedUser) => {
    setError("");
    try {
      const latest = await getUserById(selected.id);
      setEditing(latest);
      setEditRole(ROLE_OPTIONS.includes(latest.role.toLocaleLowerCase("vi")) ? latest.role.toLocaleLowerCase("vi") : "xnk");
      setEditSession(SESSION_OPTIONS.includes(latest.session.toLowerCase()) ? latest.session.toLowerCase() : "view");
    } catch (loadError) {
      notify(loadError instanceof Error ? loadError.message : "Không thể tải thông tin tài khoản", "error");
    }
  };

  const savePermission = async () => {
    if (!editing) return;
    const approved = await confirm({
      title: "Xác nhận sửa quyền",
      message: `Cập nhật tài khoản ${editing.username} thành role ${editRole}, session ${editSession}?`,
      confirmText: "Cập nhật",
    });
    if (!approved) return;

    setSavingEdit(true);
    try {
      await updateUser(editing.id, { role: editRole, session: editSession });
      const changes = [
        editing.role !== editRole ? `role: ${editing.role || "trống"} → ${editRole}` : "",
        editing.session !== editSession ? `session: ${editing.session || "trống"} → ${editSession}` : "",
      ].filter(Boolean).join("; ");
      recordActivity(user, {
        action: "UPDATE_USER_PERMISSION",
        location: `/account-management/users/${editing.id}`,
        detail: `Tài khoản ${editing.username}; ${changes || "không thay đổi quyền"}`,
      });
      setUsers((current) => current.map((item) =>
        item.id === editing.id ? { ...item, role: editRole, session: editSession } : item,
      ));
      setEditing(null);
      notify(`Đã cập nhật quyền cho ${editing.username}`, "success");
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "Không thể cập nhật quyền", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  if (!canManage) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner /></div>;
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Quản lý tài khoản</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Đăng ký, phân quyền và đặt lại mật khẩu người dùng trong một màn hình.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 dark:border-gray-800 dark:bg-white/[0.03]">
        <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")}>Danh sách tài khoản</TabButton>
        <TabButton active={activeTab === "register"} onClick={() => setActiveTab("register")}>Đăng ký tài khoản</TabButton>
        <TabButton active={activeTab === "password"} onClick={() => setActiveTab("password")}>Đặt lại mật khẩu</TabButton>
      </div>

      {activeTab === "users" && (
        <UserList
          users={displayedUsers}
          total={filteredUsers.length}
          loading={loading}
          error={error}
          query={query}
          page={safePage}
          totalPages={totalPages}
          onQueryChange={(value) => { setQuery(value); setPage(1); }}
          onPageChange={setPage}
          onReload={() => void loadUsers()}
          onEdit={(selected) => void openEdit(selected)}
        />
      )}
      {activeTab === "register" && <RegisterPanel currentUser={user} onCreated={() => void loadUsers()} />}
      {activeTab === "password" && <PasswordPanel currentUser={user} />}

      {editing && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-950/55 px-4" onMouseDown={() => !savingEdit && setEditing(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sửa quyền tài khoản</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{editing.name || editing.username} · @{editing.username}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <SelectField label="Role" value={editRole} options={ROLE_OPTIONS} onChange={setEditRole} />
              <SelectField label="Session" value={editSession} options={SESSION_OPTIONS} onChange={setEditSession} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={savingEdit} onClick={() => setEditing(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">Hủy</button>
              <button type="button" disabled={savingEdit} onClick={() => void savePermission()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{savingEdit ? "Đang lưu..." : "Lưu quyền"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function UserList({ users, total, loading, error, query, page, totalPages, onQueryChange, onPageChange, onReload, onEdit }: {
  users: ManagedUser[]; total: number; loading: boolean; error: string; query: string; page: number; totalPages: number;
  onQueryChange: (value: string) => void; onPageChange: (page: number) => void; onReload: () => void; onEdit: (user: ManagedUser) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-gray-800 dark:text-white/90">Người dùng hệ thống</h2><p className="text-xs text-gray-400">{total} tài khoản</p></div>
        <div className="flex w-full gap-2 sm:w-auto">
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm tên, role, session..." className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-72" />
          <button type="button" onClick={onReload} disabled={loading} className="rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300">Tải lại</button>
        </div>
      </div>
      {error ? <Feedback message={error} type="error" /> : loading ? <div className="flex min-h-64 items-center justify-center"><Spinner /></div> : users.length === 0 ? <div className="flex min-h-64 items-center justify-center text-sm text-gray-400">Không tìm thấy tài khoản.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/50 dark:text-gray-400"><tr><th className="px-5 py-3">ID</th><th className="px-5 py-3">Tên đăng nhập</th><th className="px-5 py-3">Tên hiển thị</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Session</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((item) => {
                const isAdmin = item.role.trim().toLowerCase() === "admin";
                return <tr key={item.id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"><td className="px-5 py-4 text-sm text-gray-500">#{item.id}</td><td className="px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{item.username || "—"}</td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{item.name || "—"}</td><td className="px-5 py-4"><Badge>{item.role || "—"}</Badge></td><td className="px-5 py-4"><Badge>{item.session || "—"}</Badge></td><td className="px-5 py-4 text-right"><button type="button" disabled={isAdmin} title={isAdmin ? "Không sửa quyền tài khoản Admin tại đây" : "Sửa role và session"} onClick={() => onEdit(item)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 dark:border-brand-500/30 dark:text-brand-400">Sửa quyền</button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && totalPages > 1 && <Pagination current={page} total={totalPages} onChange={onPageChange} />}
    </div>
  );
}

function RegisterPanel({ currentUser, onCreated }: { currentUser: ReturnType<typeof useAuth>["user"]; onCreated: () => void }) {
  const { notify } = useSystemNotification();
  const [form, setForm] = useState(EMPTY_REGISTER);
  const [submitting, setSubmitting] = useState(false);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = { ...form, username: form.username.trim(), name: form.name.trim() };
    if (!values.username || !values.name || !values.password || !values.confirmPassword) return notify("Vui lòng nhập đầy đủ thông tin bắt buộc", "warning");
    if (values.password.length < 6) return notify("Mật khẩu phải có ít nhất 6 ký tự", "warning");
    if (values.password !== values.confirmPassword) return notify("Mật khẩu xác nhận không khớp", "warning");
    setSubmitting(true);
    try {
      const result = await registerUser({ username: values.username, name: values.name, password: values.password, role: values.role, session: values.session });
      recordActivity(currentUser, { action: "REGISTER_USER", location: "/account-management", detail: `Tạo tài khoản ${values.username}; role ${values.role}; session ${values.session}` });
      notify(result.message || `Đã tạo tài khoản ${values.username}`, "success");
      setForm(EMPTY_REGISTER);
      onCreated();
    } catch (submitError) { notify(submitError instanceof Error ? submitError.message : "Không thể tạo tài khoản", "error"); }
    finally { setSubmitting(false); }
  };
  return <FormCard title="Đăng ký tài khoản" description="Tạo người dùng mới và cấp quyền sử dụng ban đầu."><form onSubmit={submit} autoComplete="off" className="grid gap-4 sm:grid-cols-2"><TextField label="Tên đăng nhập" value={form.username} onChange={(value) => update("username", value)} /><TextField label="Tên hiển thị" value={form.name} onChange={(value) => update("name", value)} /><SelectField label="Role" value={form.role} options={ROLE_OPTIONS} onChange={(value) => update("role", value)} /><SelectField label="Session" value={form.session} options={SESSION_OPTIONS} onChange={(value) => update("session", value)} /><TextField label="Mật khẩu" type="password" value={form.password} onChange={(value) => update("password", value)} /><TextField label="Xác nhận mật khẩu" type="password" value={form.confirmPassword} onChange={(value) => update("confirmPassword", value)} /><div className="sm:col-span-2 flex justify-end"><SubmitButton loading={submitting} text="Tạo tài khoản" /></div></form></FormCard>;
}

function PasswordPanel({ currentUser }: { currentUser: ReturnType<typeof useAuth>["user"] }) {
  const { notify } = useSystemNotification();
  const { confirm } = useSystemConfirm();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = username.trim();
    if (!account || !password || !confirmation) return notify("Vui lòng nhập đầy đủ thông tin", "warning");
    if (password.length < 6) return notify("Mật khẩu phải có ít nhất 6 ký tự", "warning");
    if (password !== confirmation) return notify("Mật khẩu xác nhận không khớp", "warning");
    if (!await confirm({ title: "Xác nhận đặt lại mật khẩu", message: `Đặt mật khẩu mới cho tài khoản ${account}?`, confirmText: "Cập nhật" })) return;
    setSubmitting(true);
    try {
      const result = await updateUserPassword(account, password);
      recordActivity(currentUser, { action: "UPDATE_USER_PASSWORD", location: "/account-management", detail: `Cập nhật mật khẩu tài khoản ${account}` });
      notify(result.message || `Đã cập nhật mật khẩu cho ${account}`, "success");
      setUsername(""); setPassword(""); setConfirmation("");
    } catch (submitError) { notify(submitError instanceof Error ? submitError.message : "Không thể cập nhật mật khẩu", "error"); }
    finally { setSubmitting(false); }
  };
  return <FormCard title="Đặt lại mật khẩu" description="Nhập đúng tên đăng nhập và xác nhận mật khẩu mới."><form onSubmit={submit} autoComplete="off" className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><TextField label="Tên đăng nhập" value={username} onChange={setUsername} /></div><TextField label="Mật khẩu mới" type="password" value={password} onChange={setPassword} /><TextField label="Xác nhận mật khẩu" type="password" value={confirmation} onChange={setConfirmation} /><div className="sm:col-span-2 flex justify-end"><SubmitButton loading={submitting} text="Cập nhật mật khẩu" /></div></form></FormCard>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${active ? "bg-brand-500 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}>{children}</button>; }
function FormCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2><p className="mb-6 mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p><div className="max-w-2xl">{children}</div></div>; }
function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}<span className="text-error-500"> *</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}<span className="text-error-500"> *</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
function SubmitButton({ loading, text }: { loading: boolean; text: string }) { return <button type="submit" disabled={loading} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Đang xử lý..." : text}</button>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{children}</span>; }
function Spinner() { return <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />; }
function Feedback({ message }: { message: string; type: "error" }) { return <div className="m-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{message}</div>; }
function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) { return <div className="flex flex-wrap justify-center gap-1 border-t border-gray-100 px-4 py-3 dark:border-gray-800">{Array.from({ length: total }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => onChange(number)} aria-current={number === current ? "page" : undefined} className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${number === current ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-600 hover:bg-brand-50 dark:border-gray-700 dark:text-gray-300"}`}>{number}</button>)}</div>; }
