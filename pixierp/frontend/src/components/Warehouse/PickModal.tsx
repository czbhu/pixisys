import React, { useEffect, useState } from 'react';
import { Modal, Select, InputNumber, Button, Space, Spin, Tag, message } from 'antd';
import { ScanOutlined, InboxOutlined } from '@ant-design/icons';
import api from '../../services/api';
import QRScannerModal from '../QRScannerModal';

export interface InventorySlot {
  id: number;
  warehouseId: number;
  warehouseName: string;
  shelfName: string | null;
  quantity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  materialId: number | null;
  materialName: string;
  needed: number;
  unit: string;
  onConfirm: (warehouseId: number, warehouseName: string, qty: number) => void;
}

const PickModal: React.FC<Props> = ({
  open, onClose, materialId, materialName, needed, unit, onConfirm,
}) => {
  const [slots, setSlots] = useState<InventorySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(needed);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(needed);
    setSelectedSlotId(null);
    if (!materialId) { setSlots([]); return; }
    setLoading(true);
    api.get('/warehouse/inventory/', { params: { material: materialId, page_size: 100 } })
      .then(res => {
        const data: any[] = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        const mapped: InventorySlot[] = data
          .filter(d => Number(d.quantity) > 0)
          .map(d => ({
            id: d.id,
            warehouseId: d.warehouse,
            warehouseName: d.warehouse_name,
            shelfName: d.shelf_name || null,
            quantity: Number(d.quantity),
          }))
          .sort((a, b) => b.quantity - a.quantity);
        setSlots(mapped);
        if (mapped.length > 0) setSelectedSlotId(mapped[0].id);
      })
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [open, materialId, needed]);

  const selectedSlot = slots.find(s => s.id === selectedSlotId);

  const handleQrScan = (code: string) => {
    // Try to match scanned code to warehouse name or shelf name
    const match = slots.find(
      s => s.warehouseName?.toLowerCase() === code.toLowerCase()
        || s.shelfName?.toLowerCase() === code.toLowerCase()
        || String(s.warehouseId) === code
    );
    if (match) {
      setSelectedSlotId(match.id);
      message.success(`Raktár beolvasva: ${match.warehouseName}`);
    } else {
      message.warning(`Nem találtam raktárt: ${code}`);
    }
    setQrOpen(false);
  };

  const handleConfirm = () => {
    if (!selectedSlot) { message.warning('Válassz raktárt!'); return; }
    if (!qty || qty <= 0) { message.warning('Add meg a mennyiséget!'); return; }
    onConfirm(selectedSlot.warehouseId, selectedSlot.warehouseName, qty);
  };

  const fmt = (v: number) => Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 });

  return (
    <>
      <Modal
        title={
          <Space>
            <InboxOutlined style={{ color: '#531dab' }} />
            <span>Kiszedés – {materialName}</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>Mégse</Button>,
          <Button
            key="confirm"
            type="primary"
            onClick={handleConfirm}
            disabled={!selectedSlot || !qty}
          >
            Kiszedem
          </Button>,
        ]}
        width={460}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={14}>
            {/* Warehouse select */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Raktár kiválasztása
                <Button
                  size="small" type="text" icon={<ScanOutlined />}
                  style={{ marginLeft: 8, color: '#531dab' }}
                  onClick={() => setQrOpen(true)}
                  title="QR kóddal beolvasás"
                >
                  QR
                </Button>
              </div>
              {slots.length === 0 ? (
                <div style={{ color: '#f5222d', fontSize: 12 }}>
                  Nincs raktáron lévő készlet ehhez az anyaghoz.
                </div>
              ) : (
                <Select
                  style={{ width: '100%' }}
                  value={selectedSlotId}
                  onChange={v => setSelectedSlotId(v)}
                  options={slots.map(s => ({
                    value: s.id,
                    label: (
                      <span>
                        <strong>{s.warehouseName}</strong>
                        {s.shelfName ? <span style={{ color: '#888' }}> / {s.shelfName}</span> : null}
                        <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>
                          {fmt(s.quantity)} {unit}
                        </Tag>
                      </span>
                    ),
                  }))}
                />
              )}
              {selectedSlot && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Elérhető: <strong style={{ color: '#52c41a' }}>{fmt(selectedSlot.quantity)} {unit}</strong>
                  {selectedSlot.quantity < needed && (
                    <Tag color="orange" style={{ marginLeft: 8, fontSize: 10 }}>
                      Nincs elég (szükséges: {fmt(needed)})
                    </Tag>
                  )}
                </div>
              )}
            </div>

            {/* Quantity input */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Mennyiség
              </div>
              <Space>
                <InputNumber
                  value={qty}
                  min={0.001}
                  max={selectedSlot?.quantity ?? undefined}
                  precision={3}
                  style={{ width: 140 }}
                  onChange={v => v != null && setQty(v)}
                  addonAfter={unit}
                />
                <span style={{ fontSize: 12, color: '#aaa' }}>/ {fmt(needed)} {unit} szükséges</span>
              </Space>
            </div>
          </Space>
        )}
      </Modal>

      <QRScannerModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onScan={handleQrScan}
        title="Raktár QR kód beolvasása"
      />
    </>
  );
};

export default PickModal;
