import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Typography, message, Button, Select, Form, Modal, Result } from 'antd';
import { LockOutlined, ShoppingOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { PrintParams } from './components/Step1Params';
import PrintParamsPanel, { PriceBreakdown } from './components/PrintParamsPanel';
import Step2CanvasEditor, { CanvasEditorHandle } from './components/Step2CanvasEditor';
import Step3OrderSummary from './components/Step3OrderSummary';

const { Title, Text } = Typography;
const { Option } = Select;

interface Company { id: number; name: string; }
interface Contact { id: number; first_name: string; last_name: string; company?: number; }

const PARAMS_PANEL_W = 280;

const DEFAULT_PARAMS: PrintParams = {
  product_name: 'A5 Szórólap',
  width_mm: 148,
  height_mm: 210,
  quantity: 100,
  sides: '1',
  side1_mode: 'color',
  side2_mode: 'none',
  binding: 'cut',
  folding_count: 0,
  folding_specs: [],
};

const PrintEditorPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = !!(user?.is_staff || user?.is_superuser);

  const canvasRef = useRef<CanvasEditorHandle>(null);
  const [params, setParams] = useState<PrintParams>(DEFAULT_PARAMS);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  // Admin: ügyfél/kapcsolattartó választó
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<number | null>(null);
  const [clientModalOpen, setClientModalOpen] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      api.get('/crm/companies/?page_size=500').then(r => {
        const data = r.data?.results ?? r.data;
        setCompanies(Array.isArray(data) ? data : []);
      }).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && selectedCompany) {
      api.get(`/crm/contacts/?company=${selectedCompany}&page_size=500`).then(r => {
        const data = r.data?.results ?? r.data;
        setContacts(Array.isArray(data) ? data : []);
      }).catch(() => {});
    } else {
      setContacts([]);
      setSelectedContact(null);
    }
  }, [isAdmin, selectedCompany]);

  // Bejelentkezés szükséges
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <Result
          icon={<LockOutlined style={{ color: '#1890ff' }} />}
          title="Bejelentkezés szükséges"
          subTitle="A termékszerkesztő használatához be kell jelentkezned."
          extra={
            <Button type="primary" onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}>
              Bejelentkezés
            </Button>
          }
        />
      </div>
    );
  }

  const handleOrder = async () => {
    const design = canvasRef.current?.getDesignJson();
    if (!design) { message.error('A canvas nem elérhető'); return; }
    setSaving(true);
    try {
      const itemPayload = {
        product_name: params.product_name,
        quantity: params.quantity,
        width_mm: params.width_mm,
        height_mm: params.height_mm,
        sides: params.sides,
        side1_mode: params.side1_mode,
        side2_mode: params.side2_mode,
        binding: params.binding,
        folding_count: params.folding_count,
        folding_specs: params.folding_specs,
        unit_price: priceBreakdown?.unit_price ?? 0,
        total_price: priceBreakdown?.total ?? 0,
        price_breakdown: priceBreakdown ?? null,
        design_json_side1: design.d1,
        design_json_side2: design.d2,
      };
      const orderPayload = {
        status: 'draft',
        company: selectedCompany ?? undefined,
        contact: selectedContact ?? undefined,
        notes: '',
        items: [itemPayload],
      };
      if (orderId) {
        const r = await api.patch(`/printshop/orders/${orderId}/`, orderPayload);
        setItemId(r.data?.items?.[0]?.id ?? null);
      } else {
        const r = await api.post('/printshop/orders/', orderPayload);
        setOrderId(r.data.id);
        setItemId(r.data?.items?.[0]?.id ?? null);
      }
      setOrderModalOpen(true);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      await api.patch(`/printshop/orders/${orderId}/`, { status: 'pending' });
      message.success('Megrendelés sikeresen leadva!');
      setOrderModalOpen(false);
      navigate('/');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hiba a megrendelés leadásakor');
    } finally {
      setSaving(false);
    }
  };

  const selectedCompanyObj = selectedCompany ? companies.find(c => c.id === selectedCompany) ?? null : null;
  const selectedContactObj = selectedContact ? contacts.find(c => c.id === selectedContact) ?? null : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 48, flexShrink: 0, background: '#fff',
        borderBottom: '1px solid #e8e8e8', display: 'flex',
        alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        <Title level={5} style={{ margin: 0 }}>Íves nyomtatás</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Névjegykártya · Szórólap · Poszter</Text>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <Button size="small" icon={<UserOutlined />} onClick={() => setClientModalOpen(true)}>
            {selectedCompanyObj ? selectedCompanyObj.name : 'Ügyfél kiválasztása'}
          </Button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left params panel */}
        <div style={{
          width: PARAMS_PANEL_W, flexShrink: 0,
          borderRight: '1px solid #e8e8e8',
          background: '#fff', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <PrintParamsPanel
            params={params}
            onChange={setParams}
            onPriceChange={setPriceBreakdown}
            isAdmin={isAdmin}
          />
          <div style={{ padding: '0 12px 16px', flexShrink: 0 }}>
            <Button
              type="primary"
              block
              size="large"
              icon={<ShoppingOutlined />}
              loading={saving}
              onClick={handleOrder}
            >
              Megrendelés leadása
            </Button>
          </div>
        </div>

        {/* Canvas editor */}
        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          <Step2CanvasEditor
            ref={canvasRef}
            params={params}
            isAdmin={isAdmin}
            priceBreakdown={priceBreakdown}
            leftOffset={PARAMS_PANEL_W}
          />
        </div>
      </div>

      {/* Order summary modal */}
      <Modal
        open={orderModalOpen}
        title="Megrendelés összefoglalója"
        onCancel={() => setOrderModalOpen(false)}
        footer={null}
        width={700}
      >
        <Step3OrderSummary
          params={params}
          priceBreakdown={priceBreakdown}
          orderId={orderId}
          itemId={itemId}
          isAdmin={isAdmin}
          company={selectedCompanyObj}
          contact={selectedContactObj}
          saving={saving}
          onBack={() => setOrderModalOpen(false)}
          onConfirm={handleConfirmOrder}
        />
      </Modal>

      {/* Admin: Ügyfél választó modal */}
      <Modal
        open={clientModalOpen}
        title="Ügyfél és kapcsolattartó kiválasztása"
        onCancel={() => setClientModalOpen(false)}
        onOk={() => setClientModalOpen(false)}
        okText="OK"
        cancelText="Mégse"
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Cég">
            <Select
              allowClear showSearch placeholder="Cég keresése..."
              optionFilterProp="children"
              value={selectedCompany ?? undefined}
              onChange={v => setSelectedCompany(v ?? null)}
              style={{ width: '100%' }}
            >
              {companies.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="Kapcsolattartó">
            <Select
              allowClear showSearch placeholder="Kapcsolattartó..."
              optionFilterProp="children"
              value={selectedContact ?? undefined}
              onChange={v => setSelectedContact(v ?? null)}
              disabled={!selectedCompany}
              style={{ width: '100%' }}
            >
              {contacts.map(c => (
                <Option key={c.id} value={c.id}>{c.last_name} {c.first_name}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PrintEditorPage;
