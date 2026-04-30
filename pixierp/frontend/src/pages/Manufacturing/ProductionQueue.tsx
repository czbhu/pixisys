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
} from 'antd';
import {
    ReloadOutlined,
    PrinterOutlined,
    FieldTimeOutlined,
    MessageOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    AlertOutlined,
    SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { arrayMove } from '@dnd-kit/sortable';
import { CostDraggableRow, CostRowContext, dragModeRef } from '../../components/Manufacturing/CostDnd';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { useActionHistory } from '../../contexts/ActionHistoryContext';
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
            // Same endpoint as on the /sales/customer-orders page – a full
            // order-level worksheet. The internal (lower) half now also
            // lists every item with a checkbox so the operator can tick
            // off completed lines.
            const response = await api.get(
                `/sales/customer-orders/${r.order_id}/work_sheet/`,
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
// lets the user review/edit recipient e-mail addresses per group, then
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

const SendOrderModal: React.FC<SendOrderModalProps> = ({ open, onClose, groups: initialGroups, onSent }) => {
    const [groups, setGroups] = useState<SendGroup[]>([]);
    const [sending, setSending] = useState(false);

    // Sync local copy whenever the modal opens with a new selection. We ALSO
    // pre-fill `recipient` from each item's supplier/department default
    // (best-effort: the BE is the source of truth for actual e-mail
    // addresses, but we display whatever was passed in).
    useEffect(() => {
        if (open) setGroups(initialGroups.map(g => ({ ...g, recipient: g.recipient || '' })));
    }, [open, initialGroups]);

    const handleSend = async () => {
        const cost_item_ids = groups.flatMap(g => g.items.map(i => i.id));
        const recipients: Record<string, string> = {};
        groups.forEach(g => {
            if (g.recipient.trim()) recipients[g.key] = g.recipient.trim();
        });
        setSending(true);
        try {
            const { data } = await api.post('/manufacturing/cost-items/send_supplier_order/', {
                cost_item_ids, recipients,
            });
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
            width={780}
            confirmLoading={sending}
            okText="Küldés"
            cancelText="Mégse"
            onOk={handleSend}
            okButtonProps={{ disabled: groups.length === 0, icon: <SendOutlined /> }}
        >
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                A kijelölt tételek beszállító / belső részleg szerint csoportosítva kerülnek elküldésre.
                Minden csoporthoz egy levél megy ki, a tételek listájával.
            </Typography.Paragraph>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {groups.map(g => (
                    <Card key={g.key} size="small" title={
                        <Space>
                            {g.key.startsWith('dep:')
                                ? <Tag color="blue">{g.label}</Tag>
                                : <Tag color="orange">{g.label}</Tag>}
                            <Typography.Text type="secondary">{g.items.length} tétel</Typography.Text>
                        </Space>
                    }>
                        <Input
                            placeholder="címzett@példa.hu (több cím vesszővel elválasztva)"
                            value={g.recipient}
                            onChange={(e) => {
                                const v = e.target.value;
                                setGroups(gs => gs.map(x => x.key === g.key ? { ...x, recipient: v } : x));
                            }}
                            style={{ marginBottom: 8 }}
                        />
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                            {g.items.map(it => (
                                <li key={it.id}>
                                    <strong>{it.order_number}</strong> — {it.code ? `${it.code} ` : ''}{it.item_name}
                                    {' '}<span style={{ color: '#888' }}>({it.quantity} {it.unit})</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                ))}
            </Space>
        </Modal>
    );
};
