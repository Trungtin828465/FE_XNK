"use client";

import { canPerformShipmentAction } from "@/config/shipmentActionPermissions";
import { useAuth } from "@/context/AuthContext";
import { useSystemConfirm } from "@/context/SystemConfirmContext";
import { useSystemNotification } from "@/context/SystemNotificationContext";
import { recordActivity } from "@/services/activityLogApi";
import { createDatabaseRow, getDatabaseRow, listDatabaseRows, updateDatabaseRow } from "@/services/postgresShipmentApi";
import React, { useEffect, useMemo, useState } from "react";

type EntityKey = "suppliers" | "carriers" | "warehouses";
type DataRow = Record<string, unknown>;

interface FieldConfig {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
}

interface EntityConfig {
  title: string;
  singular: string;
  endpoint: string;
  idField: string;
  fields: FieldConfig[];
}

const PAGE_SIZE = 10;
const ENTITY_CONFIG: Record<EntityKey, EntityConfig> = {
  suppliers: {
    title: "Nhà cung cấp",
    singular: "nhà cung cấp",
    endpoint: "nha-cung-cap",
    idField: "id_ncc",
    fields: [
      { key: "id_ncc", label: "Mã nhà cung cấp", required: true },
      { key: "ten_ncc", label: "Tên nhà cung cấp", required: true },
      { key: "quoc_gia", label: "Quốc gia" },
      { key: "so_dien_thoai", label: "Số điện thoại" },
      { key: "dia_chi", label: "Địa chỉ", multiline: true },
    ],
  },
  carriers: {
    title: "Hãng tàu",
    singular: "hãng tàu",
    endpoint: "hang-tau",
    idField: "id_hang_tau",
    fields: [
      { key: "id_hang_tau", label: "Mã hãng tàu", required: true },
      { key: "ten_hang_tau", label: "Tên hãng tàu", required: true },
    ],
  },
  warehouses: {
    title: "Kho",
    singular: "kho",
    endpoint: "kho",
    idField: "id_kho",
    fields: [
      { key: "id_kho", label: "Mã kho", required: true },
      { key: "ten_kho", label: "Tên kho", required: true },
      { key: "so_dien_thoai", label: "Số điện thoại" },
      { key: "dia_chi", label: "Địa chỉ", multiline: true },
    ],
  },
};

function emptyForm(config: EntityConfig): Record<string, string> {
  return Object.fromEntries(config.fields.map((field) => [field.key, ""]));
}

export default function MasterDataPage() {
  const { user } = useAuth();
  const { notify } = useSystemNotification();
  const { confirm } = useSystemConfirm();
  const canManage = canPerformShipmentAction(user, "manageMasterData");
  const [active, setActive] = useState<EntityKey>("suppliers");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm(ENTITY_CONFIG.suppliers));
  const [editingId, setEditingId] = useState<string | null>(null);
  const config = ENTITY_CONFIG[active];

  const loadRows = async () => {
    setLoading(true);
    try {
      setRows(await listDatabaseRows<DataRow>(config.endpoint));
    } catch (error) {
      notify(error instanceof Error ? error.message : `Không thể tải danh sách ${config.title}`, "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    setForm(emptyForm(config));
    setEditingId(null);
    setQuery("");
    setPage(1);
    void loadRows();
    // Chỉ tải lại khi đổi loại danh mục hoặc quyền hiện tại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, canManage]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!keyword) return rows;
    return rows.filter((row) => config.fields.some((field) => String(row[field.key] ?? "").toLocaleLowerCase("vi").includes(keyword)));
  }, [config.fields, query, rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const displayedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const beginCreate = () => {
    setEditingId(null);
    setForm(emptyForm(config));
  };

  const beginEdit = async (row: DataRow) => {
    const id = String(row[config.idField] ?? "");
    if (!id) return;
    try {
      const latest = await getDatabaseRow<DataRow>(config.endpoint, id);
      setEditingId(id);
      setForm(Object.fromEntries(config.fields.map((field) => [field.key, String(latest[field.key] ?? row[field.key] ?? "")] )));
    } catch (error) {
      notify(error instanceof Error ? error.message : `Không thể tải ${config.singular}`, "error");
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = config.fields.filter((field) => field.required && !form[field.key]?.trim());
    if (missing.length > 0) return notify(`Vui lòng nhập ${missing.map((field) => field.label).join(", ")}`, "warning");
    const approved = await confirm({
      title: editingId ? `Xác nhận sửa ${config.singular}` : `Xác nhận thêm ${config.singular}`,
      message: editingId ? `Lưu thay đổi cho ${editingId}?` : `Thêm ${config.singular} ${form[config.idField]}?`,
      confirmText: editingId ? "Lưu thay đổi" : "Thêm mới",
    });
    if (!approved) return;
    setSaving(true);
    try {
      if (editingId) {
        const changes = Object.fromEntries(Object.entries(form).filter(([key]) => key !== config.idField));
        await updateDatabaseRow(config.endpoint, editingId, changes);
      } else {
        await createDatabaseRow(config.endpoint, form);
      }
      recordActivity(user, {
        action: editingId ? "UPDATE_MASTER_DATA" : "CREATE_MASTER_DATA",
        location: `/master-data/${config.endpoint}`,
        detail: `${editingId ? "Cập nhật" : "Tạo"} ${config.singular} ${editingId || form[config.idField]}`,
      });
      notify(`Đã ${editingId ? "cập nhật" : "thêm"} ${config.singular}`, "success");
      beginCreate();
      await loadRows();
    } catch (error) {
      notify(error instanceof Error ? error.message : `Không thể lưu ${config.singular}`, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return <div className="flex min-h-[55vh] items-center justify-center text-sm font-medium text-error-600">Chỉ tài khoản admin với session all được truy cập trang này.</div>;
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Quản lý danh mục</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Dữ liệu nền PostgreSQL dùng cho đơn mua hàng, XNK và vận chuyển container.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 dark:border-gray-800 dark:bg-white/[0.03]">
        {(Object.keys(ENTITY_CONFIG) as EntityKey[]).map((key) => (
          <button key={key} type="button" onClick={() => setActive(key)} className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold ${active === key ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}>{ENTITY_CONFIG[key].title}</button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold text-gray-800 dark:text-white">Danh sách {config.title.toLocaleLowerCase("vi")}</h2><p className="text-xs text-gray-400">{filteredRows.length} dữ liệu</p></div>
            <div className="flex gap-2"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm kiếm..." className="h-10 min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /><button type="button" onClick={() => void loadRows()} className="rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">Tải lại</button></div>
          </div>
          {loading ? <div className="flex min-h-60 items-center justify-center"><span className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/50"><tr>{config.fields.map((field) => <th key={field.key} className="px-4 py-3">{field.label}</th>)}<th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{displayedRows.map((row, rowIndex) => <tr key={`${active}-${String(row[config.idField] ?? "row")}-${rowIndex}`} className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">{config.fields.map((field) => <td key={field.key} className="max-w-56 truncate px-4 py-3 text-sm text-gray-700 dark:text-gray-300" title={String(row[field.key] ?? "")}>{String(row[field.key] ?? "—")}</td>)}<td className="px-4 py-3 text-right"><button type="button" onClick={() => void beginEdit(row)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">Sửa</button></td></tr>)}</tbody></table>{displayedRows.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Chưa có dữ liệu.</p>}</div>
          )}
          {totalPages > 1 && <div className="flex flex-wrap justify-center gap-1 border-t border-gray-100 p-3 dark:border-gray-800">{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${number === safePage ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}>{number}</button>)}</div>}
        </div>
        <form onSubmit={save} className="h-fit rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-800 dark:text-white">{editingId ? `Sửa ${config.singular}` : `Thêm ${config.singular}`}</h2><p className="mt-1 text-xs text-gray-400">{editingId ? editingId : "Nhập thông tin bên dưới"}</p></div>{editingId && <button type="button" onClick={beginCreate} className="text-xs font-semibold text-gray-500">Hủy sửa</button>}</div>
          <div className="space-y-4">{config.fields.map((field) => <label key={field.key} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}{field.required && <span className="text-error-500"> *</span>}{field.multiline ? <textarea value={form[field.key] || ""} disabled={Boolean(editingId && field.key === config.idField)} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} rows={3} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /> : <input value={form[field.key] || ""} disabled={Boolean(editingId && field.key === config.idField)} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-brand-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />}</label>)}</div>
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Thêm mới"}</button>
        </form>
      </div>
    </section>
  );
}
