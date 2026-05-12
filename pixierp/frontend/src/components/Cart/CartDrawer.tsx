import React, { useState, useMemo } from 'react';
import {
  Drawer, Badge, Button, Space, Tag, Popconfirm, InputNumber,
  message, Tabs, Modal, Input, Empty, Divider,
} from 'antd';
import {
  DeleteOutlined, MailOutlined, ShoppingCartOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useCart, CartItem } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import dayjs from 'dayjs';

const SOURCE_LABELS: Record<string, string> = {
  rfq: 'Ajánlat',
  customer_order: 'Megrendelés',
  ordered_product: 'Gyártás',
  unknown: '–',
};

const INTERNAL_KEY = '⚙ Belső / Nincs beszállító';

const escapeHtml = (t: string) =>
  String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface SendState {
  open: boolean;
  loading: boolean;
  sending: boolean;
  supplierName: string | null;
  supplierItems: CartItem[];
  costItemIds: number[];
  recipient: string;
  cc: string;
  subject: string;
  body: string;
}

const EMPTY_SEND: SendState = {
  open: false, loading: false, sending: false, supplierName: null,
  supplierItems: [], costItemIds: [], recipient: '', cc: '', subject: '', body: '',
};

const CartDrawer: React.FC = () => {
  const { items, removeItem, updateItem, markOrdered, clearOrdered, drawerOpen, setDrawerOpen } = useCart();
  const { user } = useAuth();
  const [sendState, setSendState] = useState<SendState>(EMPTY_SEND);
  const [activeTab, setActiveTab] = useState('active');

  const activeItems = useMemo(() => items.filter(it => it.status === 'in_cart'), [items]);
  const orderedItems = useMemo(() => items.filter(it => it.status === 'ordered'), [items]);

  // Group active items by supplier
  const supplierGroups = useMemo(() => {
    const groups = new Map<string, CartItem[]>();
    for (const item of activeItems) {
      const key = item.supplierName || INTERNAL_KEY;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === INTERNAL_KEY) return 1;
      if (b === INTERNAL_KEY) return -1;
      return a.localeCompare(b, 'hu');
    });
  }, [activeItems]);

  const buildItemTableHtml = (cartItems: CartItem[]) => {
    const rows = cartItems.map(item => {
      const src = SOURCE_LABELS[item.sourceType] || item.sourceType;
      return `<tr>
        <td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(item.materialName)}</td>
        <td style="border:1px solid #ddd;padding:4px 8px;text-align:right">${Number(item.needed).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} ${escapeHtml(item.unit)}</td>
        <td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(src)}: ${escapeHtml(item.sourceNumber)}${item.sourceItemName ? ' / ' + escapeHtml(item.sourceItemName) : ''}</td>
      </tr>`;
    }).join('');
    return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead><tr>
        <th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Anyag</th>
        <th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Mennyiség</th>
        <th style="border:1px solid #ddd;padding:4px 8px;background:#f5f5f5">Forrás</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const handleOpenSend = async (supplierName: string | null, groupItems: CartItem[]) => {
    const costItemIds = Array.from(new Set(groupItems.flatMap(it => it.costItemIds)));
    const tableHtml = buildItemTableHtml(groupItems);
    const label = supplierName || 'Partner';
    const userName = (user?.last_name && user?.first_name)
      ? `${user.last_name} ${user.first_name}`
      : (user?.username || 'PixiERP');

    setSendState({
      ...EMPTY_SEND, open: true, loading: true,
      supplierName, supplierItems: groupItems, costItemIds,
      subject: `Anyagmegrendelés – ${label} – ${dayjs().format('YYYY-MM-DD')}`,
      body: `<p>Tisztelt ${escapeHtml(label)}!</p><p>Az alábbi anyagokat szeretnénk megrendelni:</p>${tableHtml}<p>Köszönettel,<br>${escapeHtml(userName)}</p>`,
    });

    // Try to pre-fill recipient from backend
    let recipient = '';
    if (costItemIds.length > 0) {
      try {
        const { data } = await api.post('/manufacturing/cost-items/render_supplier_order/', { cost_item_ids: costItemIds });
        const groups: any[] = Array.isArray(data?.groups) ? data.groups : [];
        if (groups.length > 0) recipient = groups[0].recipient || '';
      } catch { /* user fills manually */ }
    }
    setSendState(s => ({ ...s, loading: false, recipient }));
  };

  const handleSend = async () => {
    if (!sendState.recipient.trim()) {
      message.warning('Kérlek add meg a címzettet!');
      return;
    }
    setSendState(s => ({ ...s, sending: true }));
    try {
      const payload = {
        groups: [{
          key: sendState.supplierName || 'no_supplier',
          label: sendState.supplierName || 'Ismeretlen',
          cost_item_ids: sendState.costItemIds,
          recipients: sendState.recipient.trim(),
          cc: sendState.cc.trim(),
          reply_to: '',
          subject: sendState.subject,
          body: sendState.body,
          is_html: true,
          attach_worksheet_pdf: false,
          worksheet_cost_item_ids: [],
        }],
      };
      await api.post('/manufacturing/cost-items/send_supplier_order/', payload);
      const now = dayjs().toISOString();
      markOrdered(sendState.supplierItems.map(it => it.id), now);
      message.success('Megrendelés elküldve!');
      setSendState(EMPTY_SEND);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Küldés sikertelen!');
      setSendState(s => ({ ...s, sending: false }));
    }
  };

  const activeTabContent = (
    <div>
      {activeItems.length === 0 ? (
        <Empty description="A kosár üres" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 32 }} />
      ) : (
        supplierGroups.map(([supplierKey, groupItems]) => {
          const isInternal = supplierKey === INTERNAL_KEY;
          return (
            <div key={supplierKey} style={{
              marginBottom: 14,
              border: '1px solid #e8e8e8',
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {/* Supplier header */}
              <div style={{
                background: isInternal ? '#f5f5f5' : '#f9f0ff',
                padding: '7px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid #e8e8e8',
              }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: isInternal ? '#595959' : '#531dab' }}>
                  {supplierKey}
                  <Tag style={{ marginLeft: 6, fontSize: 11 }}>{groupItems.length} tétel</Tag>
                </span>
                {!isInternal && (
                  <Button
                    size="small" type="primary" icon={<MailOutlined />} ghost
                    style={{ borderColor: '#531dab', color: '#531dab' }}
                    onClick={() => handleOpenSend(groupItems[0].supplierName, groupItems)}
                  >
                    Megrendelés küldése
                  </Button>
                )}
              </div>

              {/* Items */}
              {groupItems.map((item, idx) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px',
                  borderBottom: idx < groupItems.length - 1 ? '1px solid #fafafa' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, lineHeight: '18px' }}>{item.materialName}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                      {SOURCE_LABELS[item.sourceType]}: <strong>{item.sourceNumber}</strong>
                      {item.sourceItemName ? ` / ${item.sourceItemName}` : ''}
                    </div>
                  </div>
                  <Space size={4} style={{ flexShrink: 0 }}>
                    <InputNumber
                      size="small"
                      value={item.needed}
                      min={0.001}
                      precision={3}
                      style={{ width: 80 }}
                      onChange={v => v != null && updateItem(item.id, { needed: v })}
                    />
                    <span style={{ fontSize: 12, color: '#666', minWidth: 24 }}>{item.unit}</span>
                    <Popconfirm
                      title="Eltávolítod a kosárból?"
                      onConfirm={() => removeItem(item.id)}
                      okText="Igen" cancelText="Nem"
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );

  const orderedTabContent = (
    <div>
      {orderedItems.length === 0 ? (
        <Empty description="Nincs elküldött megrendelés" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 32 }} />
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Popconfirm
              title="Törlöd az összes elküldött tételt?"
              onConfirm={() => clearOrdered()}
              okText="Igen" cancelText="Nem"
            >
              <Button size="small" danger>Elküldött tételek törlése</Button>
            </Popconfirm>
          </div>
          {orderedItems.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '7px 12px', borderBottom: '1px solid #f0f0f0',
              background: '#f6ffed', borderRadius: 4, marginBottom: 4,
            }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{item.materialName}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {item.supplierName || 'Belső'} · {Number(item.needed).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} {item.unit}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {SOURCE_LABELS[item.sourceType]}: {item.sourceNumber}
                </div>
                <div style={{ fontSize: 11, color: '#52c41a', fontWeight: 500 }}>
                  Megrendelés elküldve: {item.orderedAt ? dayjs(item.orderedAt).format('YYYY-MM-DD HH:mm') : '–'}
                </div>
              </div>
              <Popconfirm
                title="Törlöd a listáról?"
                onConfirm={() => removeItem(item.id)}
                okText="Igen" cancelText="Nem"
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          ))}
        </>
      )}
    </div>
  );

  return (
    <>
      <Drawer
        title={
          <Space>
            <ShoppingCartOutlined style={{ color: '#531dab', fontSize: 16 }} />
            <span style={{ fontWeight: 600 }}>Rendelési kosár</span>
            {activeItems.length > 0 && (
              <Badge count={activeItems.length} style={{ backgroundColor: '#531dab' }} />
            )}
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        placement="right"
        styles={{ body: { padding: '12px 16px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'active',
              label: (
                <Space size={4}>
                  <ShoppingCartOutlined />
                  Kosárban
                  {activeItems.length > 0 && <Badge count={activeItems.length} size="small" style={{ backgroundColor: '#531dab' }} />}
                </Space>
              ),
              children: activeTabContent,
            },
            {
              key: 'ordered',
              label: (
                <Space size={4}>
                  <CheckCircleOutlined />
                  Elküldve
                  {orderedItems.length > 0 && <Badge count={orderedItems.length} size="small" style={{ backgroundColor: '#52c41a' }} />}
                </Space>
              ),
              children: orderedTabContent,
            },
          ]}
        />
      </Drawer>

      {/* Email compose modal */}
      <Modal
        title={
          <Space>
            <MailOutlined style={{ color: '#531dab' }} />
            <span>Megrendelés küldése – {sendState.supplierName || 'Ismeretlen'}</span>
          </Space>
        }
        open={sendState.open}
        onCancel={() => setSendState(EMPTY_SEND)}
        width={720}
        footer={[
          <Button key="cancel" onClick={() => setSendState(EMPTY_SEND)}>Mégse</Button>,
          <Button
            key="send"
            type="primary"
            icon={<MailOutlined />}
            loading={sendState.sending}
            disabled={sendState.loading}
            onClick={handleSend}
          >
            Küldés
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Tételek ({sendState.supplierItems.length} db)
            </label>
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, padding: '4px 8px', maxHeight: 100, overflowY: 'auto' }}>
              {sendState.supplierItems.map(it => (
                <div key={it.id} style={{ fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                  • {it.materialName} – {Number(it.needed).toLocaleString('hu-HU', { maximumFractionDigits: 3 })} {it.unit}
                  <span style={{ color: '#bbb' }}> ({SOURCE_LABELS[it.sourceType]}: {it.sourceNumber})</span>
                </div>
              ))}
            </div>
          </div>
          <Divider style={{ margin: '4px 0' }} />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Címzett *</label>
            <Input
              placeholder="email@cim.hu"
              value={sendState.recipient}
              onChange={e => setSendState(s => ({ ...s, recipient: e.target.value }))}
              suffix={sendState.loading ? <span style={{ fontSize: 11, color: '#bbb' }}>betöltés…</span> : null}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Másolat (CC)</label>
            <Input
              placeholder="email@cim.hu (opcionális)"
              value={sendState.cc}
              onChange={e => setSendState(s => ({ ...s, cc: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Tárgy</label>
            <Input
              value={sendState.subject}
              onChange={e => setSendState(s => ({ ...s, subject: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Üzenet</label>
            <ReactQuill
              value={sendState.body}
              onChange={(v: string) => setSendState(s => ({ ...s, body: v }))}
              style={{ height: 220, marginBottom: 42 }}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default CartDrawer;
