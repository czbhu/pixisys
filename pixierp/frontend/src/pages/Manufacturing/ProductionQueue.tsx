import React, { useEffect, useMemo, useState, useRef } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import {
    Card,
    Button,
    Space,
    Select,
    message,
    Tag,
    Tooltip,
    Popover,
    Modal,
    Input,
    Typography,
    Tabs,
    Form,
} from 'antd';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { settingsService } from '../../services/settingsService';
import { useAuth } from '../../contexts/AuthContext';
import {
    ReloadOutlined,
    PrinterOutlined,
    FieldTimeOutlined,
    MessageOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    AlertOutlined,
    SendOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { arrayMove } from '@dnd-kit/sortable';
import { CostDraggableRow, CostRowContext, dragModeRef } from '../../components/Manufacturing/CostDnd';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { useActionHistory } from '../../contexts/ActionHistoryContext';
import useUserPreference from '../../hooks/useUserPreference';
import api from '../../services/api';

const STATUS_COLORS: Record<string, string> = {
    new: 'default',
    confirmed: 'blue',
    in_production: 'orange',
    ready: 'green',
    in_delivery: 'gold',
    delivered: 'success',
    cancelled: 'red',
};
const STATUS_LABELS: Record<string, string> = {
    new: 'Új',
    confirmed: 'Megerősítve',
    in_production: 'Gyártásban',
    ready: 'Kész',
    in_delivery: 'Szállítás alatt',
    delivered: 'Kiszállítva',
    cancelled: 'Törölve',
};

interface QueueRow {
    id: number;
    queue_position: number | null;
    is_paused: boolean;
    order_id: number;
    order_number: string;
    order_date: string | null;
    deadline: string | null;
    customer_id: number | null;
    customer_name: string;
    customer_order_item_id: number | null;
    manufacturing_product_id: number;
    product_name: string;
    item_name: string;
    code: string;
    status: string;
    notes: string;
    supplier_id: number | null;
    supplier_name: string;
    is_internal: boolean;
    department_id: number | null;
    department_name: string;
    quantity: number;
    unit: string;
}

/** Drag-handle cell: long-press the order number to start a GROUP drag
 *  (moves the entire order). Long-press anywhere else on the row starts a
 *  single-row drag. */
const DragOrderCell: React.FC<{ value: string }> = ({ value }) => {
    const { listeners } = React.useContext(CostRowContext);
    return (
        <span
            {...(listeners || {})}
            onPointerDownCapture={() => { dragModeRef.current = 'group'; }}
            style={{
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none',
                display: 'inline-block',
                width: '100%',
                fontWeight: 500,
            }}
            title="Tartsa nyomva 0,4 mp-ig: az egész megrendelést mozgatja"
        >
            {value}
        </span>
    );
};

const ProductionQueue: React.FC = () => {
    const { setModalOpen: setTimerModalOpen, setPreselectedOrderId, setPreselectedItemId } = useTimeTracker();
    const [rows, setRows] = useState<QueueRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [filterCustomer, setFilterCustomer] = useState<number | null>(null);
    const [filterOrder, setFilterOrder] = useState<number | null>(null);
    const [filterSupplier, setFilterSupplier] = useState<string | null>(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [sendGroups, setSendGroups] = useState<SendGroup[]>([]);

    const load = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/manufacturing/cost-items/queue/');
            setRows(data);
        } catch (e) {
            console.error(e);
            message.error('Sor betöltése sikertelen');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const customerOptions = useMemo(() => {
        const map = new Map<number, string>();
        rows.forEach(r => { if (r.customer_id) map.set(r.customer_id, r.customer_name); });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [rows]);
    const orderOptions = useMemo(() => {
        const map = new Map<number, string>();
        rows.forEach(r => map.set(r.order_id, r.order_number));
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [rows]);
    const supplierOptions = useMemo(() => {
        const sup = new Map<number, string>();
        const dep = new Map<number, string>();
        rows.forEach(r => {
            if (r.is_internal && r.department_id) {
                dep.set(r.department_id, r.department_name || `Belső #${r.department_id}`);
            } else if (r.supplier_id) {
                sup.set(r.supplier_id, r.supplier_name);
            }
        });
        const opts: any[] = [];
        if (sup.size) {
            opts.push({
                label: 'Besállítók',
                title: 'Besállítók',
                options: Array.from(sup.entries())
                    .sort((a, b) => a[1].localeCompare(b[1], 'hu'))
                    .map(([id, name]) => ({ value: `sup:${id}`, label: name })),
            });
        }
        if (dep.size) {
            opts.push({
                label: 'Belső részlegek',
                title: 'Belső részlegek',
                options: Array.from(dep.entries())
                    .sort((a, b) => a[1].localeCompare(b[1], 'hu'))
                    .map(([id, name]) => ({ value: `dep:${id}`, label: name })),
            });
        }
        return opts;
    }, [rows]);

    const normalize = (s: any) =>
        (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const filtered = useMemo(() => {
        let r = rows;
        if (filterCustomer) r = r.filter(x => x.customer_id === filterCustomer);
        if (filterOrder) r = r.filter(x => x.order_id === filterOrder);
        if (filterSupplier) {
            const [kind, idStr] = filterSupplier.split(':');
            const id = Number(idStr);
            if (kind === 'dep') {
                r = r.filter(x => x.is_internal && x.department_id === id);
            } else {
                r = r.filter(x => !x.is_internal && x.supplier_id === id);
            }
        }
        const q = normalize(query);
        if (q) {
            r = r.filter(x => normalize([x.order_number, x.customer_name, x.product_name, x.item_name, x.code, x.notes].join(' ')).includes(q));
        }
        return r;
    }, [rows, filterCustomer, filterOrder, filterSupplier, query]);

    // ── Actions ──────────────────────────────────────────────────────────
    const handleStatusChange = async (id: number, newStatus: string) => {
        const prev = rows;
        setRows(rows.map(r => r.id === id ? { ...r, status: newStatus } : r));
        try {
            await api.patch(`/manufacturing/cost-items/${id}/`, { status: newStatus });
            message.success('Státusz frissítve');
        } catch (e) {
            console.error(e);
            message.error('Státusz frissítése sikertelen');
            setRows(prev);
        }
    };

    const handleStartTimer = (r: QueueRow) => {
        if (!r.customer_order_item_id) {
            message.warning('Nincs hozzárendelt megrendelés-tétel');
            return;
        }
        setPreselectedOrderId(r.order_id);
        setPreselectedItemId(r.customer_order_item_id);
        setTimerModalOpen(true);
    };

    const handlePrintWorksheet = async (r: QueueRow) => {
        try {
            // Per-cost-item worksheet: only the parent item's parameters
            // and its altételek (sibling cost items) with checkboxes.
            const response = await api.get(
                `/manufacturing/cost-items/${r.id}/work_sheet/`,
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch (e) {
            console.error(e);
            message.error('Hiba a munkalap letöltése során');
        }
    };

    const handleAddNote = (r: QueueRow) => {
        let value = r.notes || '';
        Modal.confirm({
            title: `Megjegyzés — ${r.item_name}`,
            width: 600,
            icon: <MessageOutlined />,
            content: (
                <Input.TextArea
                    defaultValue={r.notes || ''}
                    rows={6}
                    onChange={(e) => { value = e.target.value; }}
                    placeholder="Írja be a megjegyzést..."
                />
            ),
            okText: 'Mentés',
            cancelText: 'Mégse',
            onOk: async () => {
                try {
                    await api.patch(`/manufacturing/cost-items/${r.id}/`, { notes: value });
                    setRows(rs => rs.map(x => x.id === r.id ? { ...x, notes: value } : x));
                    message.success('Megjegyzés mentve');
                } catch (e) {
                    console.error(e);
                    message.error('Megjegyzés mentése sikertelen');
                }
            },
        });
    };

    const handlePauseToggle = async (r: QueueRow) => {
        try {
            if (r.is_paused) {
                await api.post(`/manufacturing/cost-items/${r.id}/resume/`);
                message.success('Folytatva');
            } else {
                const before = rowsRef.current.map(x => x.id);
                await api.post(`/manufacturing/cost-items/${r.id}/pause/`);
                message.success('Szüneteltetve, sor végére helyezve');
                await load();
                const after = rowsRef.current.map(x => x.id);
                registerReorderAction(`Szünet: ${r.item_name}`, before, after);
            }
        } catch (e) {
            console.error(e);
            message.error('Művelet sikertelen');
        }
    };

    const handleSos = async (r: QueueRow) => {
        try {
            const before = rowsRef.current.map(x => x.id);
            await api.post(`/manufacturing/cost-items/${r.id}/sos/`);
            message.success('Sor elejére helyezve');
            await load();
            const after = rowsRef.current.map(x => x.id);
            registerReorderAction(`SOS: ${r.item_name}`, before, after);
        } catch (e) {
            console.error(e);
            message.error('Művelet sikertelen');
        }
    };

    // ── Undo/Redo via global ActionHistory ───────────────────────────────
    // Snapshots are taken BEFORE and AFTER each reorder/SOS/pause, then
    // registered with the global header Undo/Redo buttons.
    const { addAction } = useActionHistory();
    const rowsRef = useRef<QueueRow[]>([]);
    rowsRef.current = rows;

    const applyOrder = async (ids: number[]) => {
        const map = new Map(rowsRef.current.map(r => [r.id, r]));
        const ordered = ids.map(i => map.get(i)).filter(Boolean) as QueueRow[];
        rowsRef.current.forEach(r => { if (!ids.includes(r.id)) ordered.push(r); });
        setRows(ordered);
        await api.post('/manufacturing/cost-items/reorder/', { ids: ordered.map(r => r.id) });
    };

    const registerReorderAction = (description: string, beforeIds: number[], afterIds: number[]) => {
        if (beforeIds.length === afterIds.length && beforeIds.every((v, i) => v === afterIds[i])) return;
        addAction({
            description,
            undo: async () => { await applyOrder(beforeIds); await load(); },
            redo: async () => { await applyOrder(afterIds); await load(); },
        });
    };

    // ── Drag & drop reorder ──────────────────────────────────────────────
    /**
     * Two activation modes (chosen by which DOM element the user grabbed):
     *  - 'single' (default): only this one cost-item moves.
     *  - 'group':            all cost-items belonging to the same order_id
     *                        move together (used when the user long-presses
     *                        the order-number cell).
     */
    const onRowReorder = async (activeId: string | number, overId: string | number) => {
        const activeRow = filtered.find(r => r.id === Number(activeId));
        const overRow = filtered.find(r => r.id === Number(overId));
        if (!activeRow || !overRow) return;
        if (activeRow.id === overRow.id) return;

        const mode: 'single' | 'group' = dragModeRef.current;
        let reorderedFiltered: QueueRow[];

        if (mode === 'group' && activeRow.order_id !== overRow.order_id) {
            const groupKeys: number[] = [];
            const groupMap = new Map<number, QueueRow[]>();
            filtered.forEach(r => {
                if (!groupMap.has(r.order_id)) {
                    groupMap.set(r.order_id, []);
                    groupKeys.push(r.order_id);
                }
                groupMap.get(r.order_id)!.push(r);
            });
            const fromIdx = groupKeys.indexOf(activeRow.order_id);
            const toIdx = groupKeys.indexOf(overRow.order_id);
            if (fromIdx < 0 || toIdx < 0) return;
            const movedKeys = arrayMove(groupKeys, fromIdx, toIdx);
            reorderedFiltered = movedKeys.flatMap(k => groupMap.get(k)!);
        } else {
            const oldIdx = filtered.findIndex(r => r.id === activeRow.id);
            const newIdx = filtered.findIndex(r => r.id === overRow.id);
            if (oldIdx < 0 || newIdx < 0) return;
            reorderedFiltered = arrayMove(filtered, oldIdx, newIdx);
        }

        const beforeIds = rows.map(r => r.id);
        const filteredIds = new Set(filtered.map(r => r.id));
        const others = rows.filter(r => !filteredIds.has(r.id));
        const newRows = [...reorderedFiltered, ...others];
        const afterIds = newRows.map(r => r.id);
        setRows(newRows);

        try {
            await api.post('/manufacturing/cost-items/reorder/', { ids: afterIds });
            const desc = mode === 'group'
                ? `Megrendelés mozgatás: ${activeRow.order_number}`
                : `Tétel mozgatás: ${activeRow.item_name}`;
            registerReorderAction(desc, beforeIds, afterIds);
        } catch (e) {
            console.error(e);
            message.error('Sorrend mentése sikertelen');
            await load();
        }
    };

    // ── Status Popover ───────────────────────────────────────────────────
    const renderStatus = (r: QueueRow) => {
        const cur = r.status || 'new';
        const color = STATUS_COLORS[cur] || 'default';
        const text = STATUS_LABELS[cur] || cur;
        const content = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.keys(STATUS_LABELS).map(opt => (
                    <Button
                        key={opt}
                        size="small"
                        type={opt === cur ? 'primary' : 'text'}
                        disabled={opt === cur}
                        style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(r.id, opt); }}
                    >
                        {STATUS_LABELS[opt]}
                    </Button>
                ))}
            </div>
        );
        return (
            <Popover content={content} title="Státusz váltás" trigger="click" overlayInnerStyle={{ padding: '6px 8px' }}>
                <Tag color={color} style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>{text}</Tag>
            </Popover>
        );
    };

    const columns: any[] = [
        { title: '#', key: 'pos', width: 50, render: (_: any, __: any, idx: number) => idx + 1 },
        { title: 'Megrendelés', dataIndex: 'order_number', key: 'order_number', width: 130,
            sorter: (a: QueueRow, b: QueueRow) => (a.order_number || '').localeCompare(b.order_number || ''),
            render: (v: string) => <DragOrderCell value={v} /> },
        { title: 'Ügyfél', dataIndex: 'customer_name', key: 'customer_name', width: 180, ellipsis: true,
            sorter: (a: QueueRow, b: QueueRow) => (a.customer_name || '').localeCompare(b.customer_name || '', 'hu') },
        { title: 'Megr. dátuma', dataIndex: 'order_date', key: 'order_date', width: 110,
            render: (d: string) => d ? dayjs(d).format('YYYY.MM.DD') : '-',
            sorter: (a: QueueRow, b: QueueRow) => new Date(a.order_date || 0).getTime() - new Date(b.order_date || 0).getTime() },
        { title: 'Határidő', dataIndex: 'deadline', key: 'deadline', width: 105,
            render: (d: string) => d ? dayjs(d).format('YYYY.MM.DD') : '-',
            sorter: (a: QueueRow, b: QueueRow) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime() },
        { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 110 },
        { title: 'Termék', dataIndex: 'product_name', key: 'product_name', width: 180, ellipsis: true,
            sorter: (a: QueueRow, b: QueueRow) => (a.product_name || '').localeCompare(b.product_name || '', 'hu') },
        { title: 'Tétel', dataIndex: 'item_name', key: 'item_name', width: 200, ellipsis: true,
            sorter: (a: QueueRow, b: QueueRow) => (a.item_name || '').localeCompare(b.item_name || '', 'hu') },
        { title: 'Státusz', key: 'status', width: 140, render: (_: any, r: QueueRow) => (
            <Space>
                {renderStatus(r)}
                {r.is_paused && <Tag color="default">Szünet</Tag>}
            </Space>
        ) },
        { title: 'Megjegyzés', dataIndex: 'notes', key: 'notes', width: 220, ellipsis: true,
            render: (n: string) => n
                ? <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{n}</span>}><span>{n}</span></Tooltip>
                : <span style={{ color: '#bbb' }}>—</span> },
        { title: 'Beszállító', key: 'supplier', width: 180,
            render: (_: any, r: QueueRow) => r.is_internal
                ? <Tag color="blue">{r.department_name ? `Belső: ${r.department_name}` : 'Belső'}</Tag>
                : (r.supplier_name ? <Tag color="orange">{r.supplier_name}</Tag> : <span style={{ color: '#bbb' }}>—</span>) },
        {
            title: 'Műveletek', key: 'actions', width: 230, fixed: 'right' as const,
            render: (_: any, r: QueueRow) => (
                <Space size="small" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Munkaóra indítása">
                        <Button icon={<FieldTimeOutlined />} size="small" onClick={() => handleStartTimer(r)} />
                    </Tooltip>
                    <Tooltip title="Megjegyzés hozzáadása">
                        <Button icon={<MessageOutlined />} size="small" onClick={() => handleAddNote(r)} />
                    </Tooltip>
                    <Tooltip title="Munkalap nyomtatása">
                        <Button icon={<PrinterOutlined />} size="small" onClick={() => handlePrintWorksheet(r)} />
                    </Tooltip>
                    <Tooltip title={r.is_paused ? 'Folytatás' : 'Szünet (sor végére)'}>
                        <Button
                            icon={r.is_paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                            size="small"
                            onClick={() => handlePauseToggle(r)}
                        />
                    </Tooltip>
                    <Tooltip title="SOS – sor elejére">
                        <Button danger icon={<AlertOutlined />} size="small" onClick={() => handleSos(r)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    // ── CSV export of selected (or all visible) rows ──────────────────────
    // CSV column descriptors keyed by the same `key` used in the AntD
    // columns array, so we can honour the table's visibility & order
    // preferences.
    const csvColumnDefs: Record<string, { label: string; value: (r: QueueRow, idx: number) => any }> = {
        pos:           { label: '#',                    value: (_r, idx) => idx + 1 },
        order_number:  { label: 'Megrendelés',          value: r => r.order_number },
        customer_name: { label: 'Ügyfél',               value: r => r.customer_name ?? '' },
        order_date:    { label: 'Megr. dátuma',         value: r => r.order_date ? dayjs(r.order_date).format('YYYY-MM-DD') : '' },
        deadline:      { label: 'Határidő',             value: r => r.deadline ? dayjs(r.deadline).format('YYYY-MM-DD') : '' },
        code:          { label: 'Cikkszám',             value: r => r.code ?? '' },
        product_name:  { label: 'Termék',               value: r => r.product_name ?? '' },
        item_name:     { label: 'Tétel',                value: r => r.item_name ?? '' },
        status:        { label: 'Státusz',              value: r => `${STATUS_LABELS[r.status] || r.status}${r.is_paused ? ' (Szünet)' : ''}` },
        notes:         { label: 'Megjegyzés',           value: r => (r.notes || '').replace(/\r?\n/g, ' ') },
        supplier:      { label: 'Beszállító / Részleg', value: r => r.is_internal ? `Belső: ${r.department_name || ''}`.trim() : (r.supplier_name || '') },
        // 'actions' column is intentionally omitted from CSV
    };

    // Read the same preference keys the EnhancedTable uses.
    const csvDefaultOrder = Object.keys(csvColumnDefs);
    const csvDefaultVis: Record<string, boolean> = csvDefaultOrder.reduce(
        (acc, k) => ({ ...acc, [k]: true }), {} as Record<string, boolean>,
    );
    const [colVisPref] = useUserPreference<Record<string, boolean>>(
        'manufacturingProductionQueue_colVis', csvDefaultVis,
    );
    const [colOrderPref] = useUserPreference<string[]>(
        'manufacturingProductionQueue_colOrder', csvDefaultOrder,
    );

    const exportCsv = () => {
        const source = selectedRowKeys.length > 0
            ? filtered.filter(r => selectedRowKeys.includes(r.id))
            : filtered;
        if (!source.length) { message.warning('Nincs exportálható sor.'); return; }

        // Determine the CSV column order: respect the saved column order,
        // append any new columns at the end. Then drop hidden columns and
        // any keys that don't have a CSV descriptor (e.g. 'actions').
        const savedOrder = (colOrderPref && colOrderPref.length > 0) ? colOrderPref : csvDefaultOrder;
        const orderedKeys = [
            ...savedOrder.filter(k => csvDefaultOrder.includes(k)),
            ...csvDefaultOrder.filter(k => !savedOrder.includes(k)),
        ];
        const visibleKeys = orderedKeys.filter(k => {
            // colVisPref may be missing entries → default to visible
            return colVisPref?.[k] !== false;
        });
        if (!visibleKeys.length) { message.warning('Nincs látható oszlop az exportáláshoz.'); return; }

        const headers = visibleKeys.map(k => csvColumnDefs[k].label);
        const escape = (v: any) => {
            const s = String(v ?? '');
            return /[,";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [
            headers.join(','),
            ...source.map((r, idx) => visibleKeys.map(k => escape(csvColumnDefs[k].value(r, idx))).join(',')),
        ];
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gyartasi_sor_${dayjs().format('YYYY-MM-DD_HHmm')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Send order to supplier ────────────────────────────────────────────
    const openSendModal = () => {
        // Group selected rows by supplier (or department if internal).
        const map = new Map<string, SendGroup>();
        rows.forEach(r => {
            if (!selectedRowKeys.includes(r.id)) return;
            let key: string;
            let label: string;
            if (r.is_internal && r.department_id) {
                key = `dep:${r.department_id}`;
                label = `Belső: ${r.department_name || `#${r.department_id}`}`;
            } else if (r.supplier_id) {
                key = `sup:${r.supplier_id}`;
                label = r.supplier_name || `Beszállító #${r.supplier_id}`;
            } else {
                key = 'orphan';
                label = '— Nincs beszállító —';
            }
            const g = map.get(key) || { key, label, recipient: '', items: [] };
            g.items.push(r);
            map.set(key, g);
        });
        if (map.size === 0) {
            message.warning('Nincs kijelölt tétel');
            return;
        }
        setSendGroups(Array.from(map.values()));
        setSendModalOpen(true);
    };

    return (
        <div>
            <Card
                title="Gyártási Sor"
                extra={
                    <Space wrap>
                        <Select
                            allowClear placeholder="Ügyfél" style={{ minWidth: 180 }}
                            value={filterCustomer ?? undefined}
                            options={customerOptions}
                            onChange={(v) => setFilterCustomer(v ?? null)}
                            showSearch optionFilterProp="label"
                        />
                        <Select
                            allowClear placeholder="Megrendelés" style={{ minWidth: 180 }}
                            value={filterOrder ?? undefined}
                            options={orderOptions}
                            onChange={(v) => setFilterOrder(v ?? null)}
                            showSearch optionFilterProp="label"
                        />
                        <Select
                            allowClear placeholder="Besállító / részleg" style={{ minWidth: 200 }}
                            value={filterSupplier ?? undefined}
                            options={supplierOptions}
                            onChange={(v) => setFilterSupplier(v ?? null)}
                            showSearch optionFilterProp="label"
                        />
                        <Button icon={<ReloadOutlined />} onClick={load}>Frissítés</Button>
                        <Tooltip title={selectedRowKeys.length > 0 ? 'Kijelölt sorok exportálása' : 'Az összes látható sor exportálása'}>
                            <Button icon={<FileTextOutlined />} onClick={exportCsv}>
                                CSV{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
                            </Button>
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            disabled={selectedRowKeys.length === 0}
                            onClick={openSendModal}
                        >
                            Megrendelés elküldése{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
                        </Button>
                    </Space>
                }
            >
                <EnhancedTable
                    tableKey="manufacturingProductionQueue"
                    searchValue={query}
                    onSearchChange={setQuery}
                    searchPlaceholder="Keresés megrendelés, ügyfél, termék, tétel, megjegyzés szerint..."
                    columns={columns}
                    dataSource={filtered}
                    pagination={{
                        pageSize: 50,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showQuickJumper: true,
                        showTotal: (total: number, range: [number, number]) =>
                            `${range[0]}-${range[1]} / ${total} tétel`,
                    }}
                    rowKey="id"
                    cardBreakpoint={950}
                    size="small"
                    loading={loading}
                    bodyComponents={{ body: { row: CostDraggableRow } }}
                    rowDnd={{ items: filtered.map(r => r.id), onReorder: onRowReorder }}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
                        // The "select-all" checkbox in the header will operate on the
                        // currently visible (filtered) rows only.
                        getCheckboxProps: () => ({}),
                        columnWidth: 40,
                        fixed: true,
                    }}
                />
            </Card>
            <SendOrderModal
                open={sendModalOpen}
                onClose={() => setSendModalOpen(false)}
                groups={sendGroups}
                onSent={(unsentIds) => {
                    setSendModalOpen(false);
                    // Keep only items that failed (no recipient / SMTP error) selected.
                    setSelectedRowKeys(unsentIds);
                }}
            />
        </div>
    );
};

export default ProductionQueue;

// ─────────────────────────────────────────────────────────────────────────
// SendOrderModal: groups the selected cost-items by supplier/department,
// lets the user fully edit per-group recipients, subject and HTML body
// (just like the RFQ "Ajánlat küldés" modal), with live preview, then
// POSTs to /manufacturing/cost-items/send_supplier_order/.

interface SendGroup {
    key: string;       // 'sup:<id>' or 'dep:<id>'
    label: string;     // human-readable supplier/department name
    recipient: string; // editable e-mail address (comma/semicolon separated)
    items: QueueRow[];
}

interface SendOrderModalProps {
    open: boolean;
    onClose: () => void;
    groups: SendGroup[];
    onSent: (unsentIds: number[]) => void;
}

interface GroupState {
    key: string;
    label: string;
    items: QueueRow[];
    recipients: string;
    cc: string;
    reply_to: string;
    template_key: string;
    signature_key: string;
    subject: string;
    body: string;
    is_html: boolean;
    item_table_html: string;
    item_list_text: string;
}

/** Substitute the supported placeholders in a subject/body template.
 *  NOTE: `{item_table_html}` is intentionally NOT substituted here — the
 *  ReactQuill editor strips <table> tags, so we leave the placeholder in
 *  the body and let the backend inject the rendered table at send time. */
const renderTemplateText = (
    text: string,
    ctx: { recipient_label: string; item_count: number; item_list_text: string },
) => {
    if (!text) return '';
    return text
        .replace(/\{recipient_label\}/g, ctx.recipient_label)
        .replace(/\{item_count\}/g, String(ctx.item_count))
        .replace(/\{item_list_text\}/g, ctx.item_list_text);
};

const renderSignature = (sig: any, user: any) => {
    if (!sig?.body_html) return '';
    let s: string = sig.body_html;
    const uName = user?.last_name && user?.first_name
        ? `${user.last_name} ${user.first_name}`
        : (user?.username || user?.name || '');
    s = s.replace(/\{user_name\}/g, uName);
    s = s.replace(/\{user_email\}/g, user?.email || '');
    s = s.replace(/\{user_phonenumber\}/g, user?.employee_profile?.phone || user?.phone || '');
    s = s.replace(/\{user_position\}/g, user?.employee_profile?.position?.title || user?.position || '');
    return s;
};

const SendOrderModal: React.FC<SendOrderModalProps> = ({ open, onClose, groups: initialGroups, onSent }) => {
    const { user } = useAuth();
    const [groups, setGroups] = useState<GroupState[]>([]);
    const [activeKey, setActiveKey] = useState<string>('');
    const [sending, setSending] = useState(false);
    const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
    const [signatures, setSignatures] = useState<any[]>([]);
    const [loadingCtx, setLoadingCtx] = useState(false);

    // Load templates + signatures once when the modal opens.
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const [tpls, sigs] = await Promise.all([
                    settingsService.getEmailTemplates(),
                    settingsService.getSignatures(),
                ]);
                setEmailTemplates(tpls || []);
                setSignatures(sigs || []);
            } catch {
                // non-fatal
            }
        })();
    }, [open]);

    // Build per-group state every time the modal is (re)opened with a new
    // selection. Fetches the rendered context (item_table_html etc.) from
    // the backend, then pre-fills subject/body using the default template.
    useEffect(() => {
        if (!open) return;
        if (initialGroups.length === 0) {
            setGroups([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoadingCtx(true);
            try {
                const ids = initialGroups.flatMap(g => g.items.map(i => i.id));
                let renderedByKey: Record<string, any> = {};
                try {
                    const { data } = await api.post('/manufacturing/cost-items/render_supplier_order/', {
                        cost_item_ids: ids,
                    });
                    (data?.groups || []).forEach((g: any) => { renderedByKey[g.key] = g; });
                } catch {
                    // fallback: build a minimal HTML table client-side
                }

                // Pick default template (manufacturing_supplier_order if present)
                let tpls: any[] = emailTemplates;
                if (!tpls || tpls.length === 0) {
                    try { tpls = await settingsService.getEmailTemplates(); } catch { tpls = []; }
                }
                const defaultTpl = tpls.find(t => t.key === 'manufacturing_supplier_order') || tpls[0] || null;

                const next: GroupState[] = initialGroups.map(g => {
                    const r = renderedByKey[g.key];
                    const ctx = {
                        recipient_label: g.label,
                        item_count: g.items.length,
                        item_table_html: r?.item_table_html || buildFallbackTable(g.items),
                        item_list_text: r?.item_list_text || g.items.map(i =>
                            `- [${i.order_number}] ${i.code || ''} ${i.item_name} — ${i.quantity} ${i.unit}`
                        ).join('\n'),
                    };
                    const subject = defaultTpl
                        ? renderTemplateText(defaultTpl.subject_template || '', ctx)
                        : `Gyártási megrendelés - ${g.items.length} tétel`;
                    const body = defaultTpl
                        ? renderTemplateText(defaultTpl.body_template || '', ctx)
                        : `<p>Tisztelt ${g.label}!</p><p>Kérjük, az alábbi tételek gyártását / leszállítását szíveskedjenek megkezdeni:</p>${ctx.item_table_html}<p>Köszönettel,<br>PixiERP</p>`;
                    return {
                        key: g.key,
                        label: g.label,
                        items: g.items,
                        recipients: g.recipient || '',
                        cc: defaultTpl?.default_cc || '',
                        reply_to: defaultTpl?.default_reply_to || '',
                        template_key: defaultTpl?.key || '',
                        signature_key: '',
                        subject,
                        body,
                        is_html: defaultTpl ? !!defaultTpl.is_html : true,
                        item_table_html: ctx.item_table_html,
                        item_list_text: ctx.item_list_text,
                    };
                });
                if (cancelled) return;
                setGroups(next);
                setActiveKey(next[0]?.key || '');
            } finally {
                if (!cancelled) setLoadingCtx(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialGroups]);

    const updateGroup = (key: string, patch: Partial<GroupState>) => {
        setGroups(gs => gs.map(g => g.key === key ? { ...g, ...patch } : g));
    };

    /** Apply a template to a group: re-render subject/body with the group's
     *  context, and re-append the currently selected signature (if any). */
    const applyTemplate = (g: GroupState, templateKey: string, signatureKey?: string) => {
        const tpl = emailTemplates.find(t => t.key === templateKey);
        const ctx = {
            recipient_label: g.label,
            item_count: g.items.length,
            item_table_html: g.item_table_html,
            item_list_text: g.item_list_text,
        };
        let subject = g.subject;
        let body = g.body;
        let cc = g.cc;
        let replyTo = g.reply_to;
        let isHtml = g.is_html;
        if (tpl) {
            subject = renderTemplateText(tpl.subject_template || '', ctx);
            body = renderTemplateText(tpl.body_template || '', ctx);
            cc = tpl.default_cc || '';
            replyTo = tpl.default_reply_to || '';
            isHtml = !!tpl.is_html;
        }
        const sigKey = signatureKey ?? g.signature_key;
        if (sigKey) {
            const sig = signatures.find(s => s.key === sigKey);
            const sigHtml = renderSignature(sig, user);
            if (sigHtml) body = body + (isHtml ? '' : '\n\n') + sigHtml;
        }
        updateGroup(g.key, { template_key: templateKey, subject, body, cc, reply_to: replyTo, is_html: isHtml });
    };

    const applySignature = (g: GroupState, sigKey: string) => {
        // Re-apply the current template and append the new signature.
        applyTemplate({ ...g, signature_key: sigKey }, g.template_key || '', sigKey);
        updateGroup(g.key, { signature_key: sigKey });
    };

    const handleSend = async () => {
        // Basic validation: every group must have a recipient.
        const missing = groups.filter(g => !g.recipients.trim());
        if (missing.length > 0) {
            message.warning(`Hiányzó címzett: ${missing.map(g => g.label).join(', ')}`);
            return;
        }
        setSending(true);
        try {
            const payload = {
                groups: groups.map(g => ({
                    key: g.key,
                    label: g.label,
                    cost_item_ids: g.items.map(i => i.id),
                    recipients: g.recipients.trim(),
                    cc: g.cc.trim(),
                    reply_to: g.reply_to.trim(),
                    subject: g.subject,
                    body: g.body,
                    is_html: g.is_html,
                })),
            };
            const { data } = await api.post('/manufacturing/cost-items/send_supplier_order/', payload);
            const failedKeys = new Set<string>(
                (data.results || []).filter((r: any) => !r.sent).map((r: any) => r.key)
            );
            const unsent = groups
                .filter(g => failedKeys.has(g.key))
                .flatMap(g => g.items.map(i => i.id));
            const sentCount = (data.results || []).filter((r: any) => r.sent).length;
            const failedCount = (data.results || []).length - sentCount;
            if (sentCount > 0) message.success(`${sentCount} e-mail elküldve`);
            if (failedCount > 0) {
                const errs = (data.results || [])
                    .filter((r: any) => !r.sent)
                    .map((r: any) => `${r.label}: ${r.error || 'ismeretlen hiba'}`)
                    .join('\n');
                Modal.error({ title: 'Néhány e-mail nem ment ki', content: <pre style={{ whiteSpace: 'pre-wrap' }}>{errs}</pre> });
            }
            onSent(unsent);
        } catch (e: any) {
            console.error(e);
            message.error(e?.response?.data?.error || 'E-mail küldés sikertelen');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            title="Megrendelés elküldése beszállítóknak"
            open={open}
            onCancel={onClose}
            width={820}
            confirmLoading={sending}
            okText="Küldés"
            cancelText="Mégse"
            onOk={handleSend}
            okButtonProps={{ disabled: groups.length === 0, icon: <SendOutlined /> }}
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                A kijelölt tételek beszállító / belső részleg szerint csoportosítva kerülnek elküldésre.
                Minden fülön külön szerkesztheted a tárgyat, törzset és címzetteket.
            </Typography.Paragraph>
            {loadingCtx && groups.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' }}>Betöltés…</div>
            ) : groups.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' }}>Nincs kijelölt tétel.</div>
            ) : (
                <Tabs
                    activeKey={activeKey}
                    onChange={setActiveKey}
                    items={groups.map(g => ({
                        key: g.key,
                        label: (
                            <span>
                                {g.key.startsWith('dep:')
                                    ? <Tag color="blue">Belső</Tag>
                                    : <Tag color="orange">Beszállító</Tag>}
                                {g.label} <Typography.Text type="secondary">({g.items.length})</Typography.Text>
                            </span>
                        ),
                        children: (
                            <Form layout="vertical" size="small">
                                <Form.Item label="Címzettek" required>
                                    <Input
                                        placeholder="email1@example.com, email2@example.com"
                                        value={g.recipients}
                                        onChange={e => updateGroup(g.key, { recipients: e.target.value })}
                                    />
                                </Form.Item>
                                <Form.Item label="Másolat (CC)">
                                    <Input
                                        placeholder="cc@example.com"
                                        value={g.cc}
                                        onChange={e => updateGroup(g.key, { cc: e.target.value })}
                                    />
                                </Form.Item>
                                <Form.Item label="Válaszcím (Reply-To)">
                                    <Input
                                        placeholder="reply@example.com"
                                        value={g.reply_to}
                                        onChange={e => updateGroup(g.key, { reply_to: e.target.value })}
                                    />
                                </Form.Item>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <Form.Item label="Email sablon" style={{ flex: 1 }}>
                                        <Select
                                            placeholder="Válassz sablont"
                                            value={g.template_key || undefined}
                                            showSearch
                                            optionFilterProp="label"
                                            onChange={(k: string) => applyTemplate(g, k)}
                                            options={emailTemplates.map(t => ({
                                                label: `${t.name} (${t.key})`, value: t.key,
                                            }))}
                                        />
                                    </Form.Item>
                                    <Form.Item label="Aláírás" style={{ flex: 1 }}>
                                        <Select
                                            placeholder="Válassz aláírást"
                                            allowClear
                                            value={g.signature_key || undefined}
                                            showSearch
                                            optionFilterProp="label"
                                            onChange={(k: string) => applySignature(g, k || '')}
                                            options={signatures.map(s => ({
                                                label: `${s.name} (${s.key})`, value: s.key,
                                            }))}
                                        />
                                    </Form.Item>
                                </div>
                                <Form.Item label="Tárgy">
                                    <Input
                                        value={g.subject}
                                        onChange={e => updateGroup(g.key, { subject: e.target.value })}
                                    />
                                </Form.Item>
                                <Form.Item label="Törzs">
                                    <ReactQuill
                                        theme="snow"
                                        value={g.body}
                                        onChange={v => updateGroup(g.key, { body: v })}
                                        style={{ height: 320, marginBottom: 50 }}
                                    />
                                </Form.Item>
                            </Form>
                        ),
                    }))}
                />
            )}
        </Modal>
    );
};

/** Last-resort client-side HTML table builder, used only if the BE render
 *  endpoint failed. The BE-rendered version is richer (deadlines, codes). */
function buildFallbackTable(items: QueueRow[]): string {
    const rows = items.map(i =>
        `<tr>
            <td style='border:1px solid #ddd;padding:4px 8px'>${i.order_number || '-'}</td>
            <td style='border:1px solid #ddd;padding:4px 8px'>${i.code || ''}</td>
            <td style='border:1px solid #ddd;padding:4px 8px'>${i.item_name || ''}</td>
            <td style='border:1px solid #ddd;padding:4px 8px;text-align:right'>${i.quantity} ${i.unit || ''}</td>
        </tr>`
    ).join('');
    return `<table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px'>
        <thead><tr>
            <th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Megrendelés</th>
            <th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Cikkszám</th>
            <th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Tétel</th>
            <th style='border:1px solid #ddd;padding:4px 8px;background:#f5f5f5'>Mennyiség</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
}
