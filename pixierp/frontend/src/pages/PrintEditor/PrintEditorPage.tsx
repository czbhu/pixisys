import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Steps, Card, Typography, message, Spin, Space, Button, Select, Form, Modal, Result } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import Step1Params, { PrintParams } from './components/Step1Params';
import Step2CanvasEditor from './components/Step2CanvasEditor';
import Step3OrderSummary from './components/Step3OrderSummary';

const { Title, Text } = Typography;
const { Option } = Select;

interface Company { id: number; name: string; }
interface Contact { id: number; first_name: string; last_name: string; company?: number; }

const DEFAULT_PARAMS: PrintParams = {
  product_name: 'Névjegykártya',
  width_mm: 85,
  height_mm: 54,
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

  const [currentStep, setCurrentStep] = useState(0);
  const [params, setParams] = useState<PrintParams>(DEFAULT_PARAMS);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<any>(null);
  const [saving, setSaving] = useState(false);

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

  // Megrendelés létrehozása vagy frissítése
  const handleStep1Next = async () => {
    setCurrentStep(1);
  };

  const handleStep2Next = async (designSide1: any, designSide2: any) => {
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
        design_json_side1: designSide1,
        design_json_side2: designSide2,
      };

      const orderPayload = {
        status: 'draft',
        company: selectedCompany ?? undefined,
        contact: selectedContact ?? undefined,
        notes: '',
        items: [itemPayload],
      };

      let oid = orderId;
      let iid: number | null = null;

      if (oid) {
        const r = await api.patch(`/printshop/orders/${oid}/`, orderPayload);
        iid = r.data?.items?.[0]?.id ?? null;
      } else {
        const r = await api.post('/printshop/orders/', orderPayload);
        oid = r.data.id;
        setOrderId(oid!);
        iid = r.data?.items?.[0]?.id ?? null;
      }

      if (iid) setItemId(iid);
      setCurrentStep(2);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Tervez\u00e9s ment\u00e9si hiba');
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
      navigate('/print-editor');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Hiba a megrendelés leadásakor');
    } finally {
      setSaving(false);
    }
  };

  const stepItems = [
    { title: 'Paraméterek', description: 'Méret, nyomtatás, kötészet' },
    { title: 'Tervezés', description: 'Grafika szerkesztése' },
    { title: 'Megrendelés', description: 'Összefoglaló és leadás' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', padding: '12px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>Íves nyomtatás szerkesztő</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Névjegykártya, szórólap, poszter</Text>
          </div>
          <Space>
            {isAdmin && (
              <Button onClick={() => setClientModalOpen(true)}>
                {selectedCompany
                  ? `Ügyfél: ${companies.find(c => c.id === selectedCompany)?.name ?? selectedCompany}`
                  : 'Ügyfél kiválasztása'}
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* Steps */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e8e8', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Steps current={currentStep} items={stepItems} size="small" />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: currentStep === 1 ? '100%' : 1200, margin: '0 auto', padding: currentStep === 1 ? '0' : '24px' }}>
        {currentStep === 0 && (
          <Step1Params
            isAdmin={isAdmin}
            params={params}
            onParamsChange={setParams}
            onNext={handleStep1Next}
            onPriceChange={setPriceBreakdown}
          />
        )}
        {currentStep === 1 && (
          <Step2CanvasEditor
            params={params}
            isAdmin={isAdmin}
            priceBreakdown={priceBreakdown}
            saving={saving}
            onBack={() => setCurrentStep(0)}
            onNext={handleStep2Next}
          />
        )}
        {currentStep === 2 && (
          <Step3OrderSummary
            params={params}
            priceBreakdown={priceBreakdown}
            orderId={orderId}
            itemId={itemId}
            isAdmin={isAdmin}
            company={selectedCompany ? companies.find(c => c.id === selectedCompany) ?? null : null}
            contact={selectedContact ? contacts.find(c => c.id === selectedContact) ?? null : null}
            saving={saving}
            onBack={() => setCurrentStep(1)}
            onConfirm={handleConfirmOrder}
          />
        )}
      </div>

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
              allowClear
              showSearch
              placeholder="Cég keresése..."
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
              allowClear
              showSearch
              placeholder="Kapcsolattartó..."
              optionFilterProp="children"
              value={selectedContact ?? undefined}
              onChange={v => setSelectedContact(v ?? null)}
              disabled={!selectedCompany}
              style={{ width: '100%' }}
            >
              {contacts.map(c => (
                <Option key={c.id} value={c.id}>{c.first_name} {c.last_name}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PrintEditorPage;
