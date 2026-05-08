import React, { useState, useCallback, useRef } from 'react';
import {
  Table, Button, Space, Tag, Tooltip, Input, message, Card, Empty, Checkbox,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PrinterOutlined, InboxOutlined, ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePicking, PickingItem } from '../../contexts/PickingContext';
import PickModal from '../../components/Warehouse/PickModal';
import { useNavigate } from 'react-router-dom';

const SOURCE_LABELS: Record<string, string> = {
  rfq: 'Ajánlat',
  customer_order: 'Megrendelés',
  ordered_product: 'Gyártás',
  unknown: '–',
};

const fmt = (v: number) => Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 });

interface PickModalState {
  open: boolean;
  item: PickingItem | null;
}

const PickingList: React.FC = () => {
  const navigate = useNavigate();
  const { items, updateItem, markPicked } = usePicking();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [pickModal, setPickModal] = useState<PickModalState>({ open: false, item: null });
  const lastClickedIdx = useRef<number>(-1);

  const listItems = items.filter(it => it.status === 'in_list');
  const pickedItems = items.filter(it => it.status === 'picked');

  const allChecked = listItems.length > 0 && listItems.every(it => selectedKeys.includes(it.id));
  const someChecked = !allChecked && listItems.some(it => selectedKeys.includes(it.id));

  const handleRowCheckbox = useCallback((id: string, idx: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIdx.current >= 0) {
      const start = Math.min(lastClickedIdx.current, idx);
      const end = Math.max(lastClickedIdx.current, idx);
      const rangeIds = listItems.slice(start, end + 1).map(it => it.id);
      setSelectedKeys(prev => Array.from(new Set([...prev, ...rangeIds])));
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedKeys(prev =>
        prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
      );
    } else {
      setSelectedKeys(prev =>
        prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
      );
    }
    lastClickedIdx.current = idx;
  }, [listItems]);

  const handlePickConfirm = (warehouseId: number, warehouseName: string, qty: number) => {
    if (!pickModal.item) return;
    markPicked(pickModal.item.id, warehouseId, warehouseName, qty);
    message.success(`Kiszedve: ${qty} ${pickModal.item.unit} – ${warehouseName}`);
    setPickModal({ open: false, item: null });
  };

  const handlePrint = () => {
    const printItems = listItems.length > 0 ? listItems : [...listItems, ...pickedItems];
    const now = dayjs().format('YYYY-MM-DD HH:mm');

    const rows = printItems.map((r, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td><strong>${r.materialName}</strong>${r.supplierName ? `<br><small style="color:#666">${r.supplierName}</small>` : ''}</td>
        <td style="text-align:right">${fmt(r.needed)} ${r.unit}</td>
        <td style="text-align:center">${SOURCE_LABELS[r.sourceType] || '–'}</td>
        <td>${r.sourceNumber || '–'}</td>
        <td>${r.sourceItemName || '–'}</td>
        <td>${r.note || ''}</td>
        <td style="text-align:center; font-size:20px">☐</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <title>Kiszedési lista – ${now}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 14mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 4px 0; }
    .meta { font-size: 10px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0e6ff; color: #531dab; font-size: 10px; text-transform: uppercase;
         letter-spacing: 0.04em; padding: 5px 6px; border: 1px solid #d3adf7; }
    td { padding: 5px 6px; border: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { margin-top: 16px; font-size: 10px; color: #888; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>Kiszedési lista</h1>
  <div class="meta">Nyomtatva: ${now} &nbsp;|&nbsp; Tételek száma: ${printItems.length}</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Megnevezés</th>
        <th style="width:90px">Szükséges</th>
        <th style="width:70px">Típus</th>
        <th style="width:110px">Megrendelési szám</th>
        <th>Tétel / altétel</th>
        <th style="width:140px">Megjegyzés</th>
        <th style="width:30px">✓</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">pixiERP &nbsp;·&nbsp; ${now}</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const columns: ColumnsType<PickingItem> = [
    {
      title: (
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          onChange={() => {
            if (allChecked) setSelectedKeys([]);
            else setSelectedKeys(listItems.map(it => it.id));
            lastClickedIdx.current = -1;
          }}
        />
      ),
      key: 'checkbox',
      width: 40,
      render: (_: any, record: PickingItem, idx: number) => (
        <Checkbox
          checked={selectedKeys.includes(record.id)}
          onClick={e => handleRowCheckbox(record.id, idx, e as any)}
          onChange={() => {}}
        />
      ),
    },
    {
      title: 'Dátum',
      key: 'date',
      width: 95,
      render: (_: any, r: PickingItem) => (
        <span style={{ fontSize: 11 }}>{dayjs(r.addedAt).format('MM-DD HH:mm')}</span>
      ),
    },
    {
      title: 'Megnevezés',
      key: 'name',
      render: (_: any, r: PickingItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.materialName}</div>
          {r.supplierName && <div style={{ fontSize: 11, color: '#888' }}>{r.supplierName}</div>}
        </div>
      ),
    },
    {
      title: 'Szükséges',
      key: 'needed',
      width: 100,
      align: 'right' as const,
      render: (_: any, r: PickingItem) => `${fmt(r.needed)} ${r.unit}`,
    },
    {
      title: 'Megrendelési szám',
      key: 'src',
      width: 140,
      render: (_: any, r: PickingItem) => (
        <div>
          <Tag color="default" style={{ fontSize: 11 }}>{SOURCE_LABELS[r.sourceType]}</Tag>
          <div style={{ fontSize: 12 }}>{r.sourceNumber}</div>
        </div>
      ),
    },
    {
      title: 'Tétel / altétel',
      key: 'srcItem',
      ellipsis: true,
      render: (_: any, r: PickingItem) => <span style={{ fontSize: 12 }}>{r.sourceItemName || '–'}</span>,
    },
    {
      title: 'Megjegyzés',
      key: 'note',
      width: 160,
      render: (_: any, r: PickingItem) => (
        <Input
          size="small"
          placeholder="+ megjegyzés"
          value={r.note || ''}
          onChange={e => updateItem(r.id, { note: e.target.value })}
          style={{ fontSize: 11 }}
        />
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 120,
      render: (_: any, r: PickingItem) => (
        <Button
          size="small"
          type="primary"
          icon={<InboxOutlined />}
          ghost
          style={{ borderColor: '#531dab', color: '#531dab' }}
          onClick={() => setPickModal({ open: true, item: r })}
        >
          Kiszedem
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <InboxOutlined style={{ color: '#531dab' }} />
            <span>Kiszedési lista</span>
            {listItems.length > 0 && <Tag color="blue">{listItems.length} tétel</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/warehouse/picking')}>
              Vissza
            </Button>
            <Button
              icon={<PrinterOutlined />}
              type="primary"
              onClick={handlePrint}
            >
              Nyomtatás
            </Button>
          </Space>
        }
        style={{ margin: 8 }}
      >
        {listItems.length === 0 ? (
          <Empty
            description="A kiszedési lista üres. A Kiszedés oldalon add a listára a tételeket."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '32px 0' }}
          />
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              {selectedKeys.length > 0 && (
                <Space>
                  <span style={{ fontSize: 12, color: '#888' }}>{selectedKeys.length} kijelölve</span>
                  <Tooltip title="A kijelölt tételeket megnyitja a Kiszedem modalban (egyenként)">
                    <Button
                      size="small"
                      icon={<CheckCircleOutlined />}
                      type="primary"
                      ghost
                      onClick={() => {
                        const first = items.find(it => selectedKeys[0] === it.id);
                        if (first) setPickModal({ open: true, item: first });
                      }}
                    >
                      Kiszedés ({selectedKeys.length})
                    </Button>
                  </Tooltip>
                </Space>
              )}
            </div>
            <Table<PickingItem>
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={listItems}
              columns={columns}
              rowClassName={r => selectedKeys.includes(r.id) ? 'ant-table-row-selected' : ''}
              scroll={{ x: 900 }}
            />
          </>
        )}

        {pickedItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, color: '#52c41a', marginBottom: 8 }}>
              <CheckCircleOutlined /> Kiszedett tételek ({pickedItems.length})
            </div>
            <Table<PickingItem>
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={pickedItems}
              columns={[
                {
                  title: 'Megnevezés',
                  key: 'name',
                  render: (_: any, r: PickingItem) => <span style={{ fontWeight: 500 }}>{r.materialName}</span>,
                },
                {
                  title: 'Kiszedve',
                  key: 'qty',
                  width: 100,
                  render: (_: any, r: PickingItem) => `${fmt(r.pickedQuantity ?? r.needed)} ${r.unit}`,
                },
                {
                  title: 'Raktár',
                  key: 'wh',
                  render: (_: any, r: PickingItem) => r.pickWarehouseName || '–',
                },
                {
                  title: 'Időpont',
                  key: 'at',
                  width: 130,
                  render: (_: any, r: PickingItem) => r.pickedAt
                    ? dayjs(r.pickedAt).format('YYYY-MM-DD HH:mm')
                    : '–',
                },
                {
                  title: 'Megrendelési szám',
                  key: 'src',
                  render: (_: any, r: PickingItem) => r.sourceNumber,
                },
              ]}
              style={{ background: '#f6ffed' }}
            />
          </div>
        )}
      </Card>

      <PickModal
        open={pickModal.open}
        onClose={() => setPickModal({ open: false, item: null })}
        materialId={pickModal.item?.materialId ?? null}
        materialName={pickModal.item?.materialName ?? ''}
        needed={pickModal.item?.needed ?? 1}
        unit={pickModal.item?.unit ?? 'db'}
        onConfirm={handlePickConfirm}
      />
    </>
  );
};

export default PickingList;
