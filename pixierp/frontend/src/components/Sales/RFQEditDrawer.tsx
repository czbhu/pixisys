import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Drawer, Form, Row, Col, Input, Button, Select, DatePicker, Space, Tag, Spin, message, Checkbox,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { salesService } from '../../services/salesService';
import { crmService } from '../../services/crmService';
import { manufacturingService } from '../../services/manufacturingService';
import { ItemSelectorModal, SelectedItemPayload } from './ItemSelectorModal';
import { ItemsTable } from './ItemsTable';

const normAccents = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const filterOptionAccents = (input: string, option: any) =>
  normAccents(option?.label?.toString() || '').includes(normAccents(input));

interface Props {
  open: boolean;
  rfqId: number | null;
  itemId?: number | null;
  onClose: () => void;
  onDataChanged?: () => void;
}

const RFQEditDrawer: React.FC<Props> = ({ open, rfqId, itemId, onClose, onDataChanged }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rfq, setRfq] = useState<any>(null);
  const [formBasic] = Form.useForm();
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [currencyList, setCurrencyList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<dayjs.Dayjs | null>(null);
  const [costsVersion, setCostsVersion] = useState(0);

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('manufacturing');
  const [editContext, setEditContext] = useState<null | { item: any }>(null);

  const editItemHandledRef = useRef(false);
  const watchedCurrency = Form.useWatch('currency_code', formBasic);
  const activeCurrency = watchedCurrency || rfq?.currency_code || 'HUF';

  const contactOptionLabel = (p: any) => {
    const nameParts = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    const base = p.full_name || nameParts || p.name || p.email || String(p.id);
    return base;
  };

  const load = useCallback(async () => {
    if (!rfqId) return;
    setLoading(true);
    editItemHandledRef.current = false;
    try {
      const [rfqRes, projRes, currRes] = await Promise.all([
        salesService.getQuoteRequest(rfqId),
        manufacturingService.getProjects(),
        manufacturingService.getCurrencies(),
      ]);
      setRfq(rfqRes);
      setProjects(projRes as any[]);
      setCurrencyList(currRes as any[]);

      // Seed companies
      if (rfqRes?.company?.id) {
        setCompanies([rfqRes.company]);
      } else if (rfqRes?.contacts?.[0]?.company) {
        setCompanies([{ id: rfqRes.contacts[0].company, name: rfqRes.contacts[0].company_name }]);
      } else {
        setCompanies([]);
      }
      setContacts(Array.isArray(rfqRes?.contacts) ? [...rfqRes.contacts] : []);

      formBasic.setFieldsValue({
        number: rfqRes.number || rfqRes.request_number,
        issue_date: rfqRes.issue_date ? dayjs(rfqRes.issue_date) : null,
        deadline: rfqRes.deadline ? dayjs(rfqRes.deadline) : null,
        company_id: rfqRes.company?.id || rfqRes.contacts?.[0]?.company || (rfqRes.contacts?.length ? 'private' : undefined),
        contact_ids: (rfqRes.contacts || []).map((c: any) => String(c.id)),
        title: rfqRes.title || '',
        project_id: rfqRes.project?.id || rfqRes.project,
        currency_code: rfqRes.currency_code || 'HUF',
        partial_order_allowed: rfqRes.partial_order_allowed ?? true,
      });
    } catch {
      message.error('Nem sikerült betölteni az ajánlatot');
    } finally {
      setLoading(false);
    }
  }, [rfqId, formBasic]);

  useEffect(() => {
    if (open && rfqId) {
      setLastSavedAt(null);
      load();
    }
  }, [open, rfqId, load]);

  // Auto-open item editor when itemId is provided
  useEffect(() => {
    if (!rfq || editItemHandledRef.current || !itemId) return;
    editItemHandledRef.current = true;
    const item = (rfq.items || []).find((it: any) => it.id === itemId);
    if (item) {
      setEditContext({ item });
      setSelectorType(item.item_type || 'manufacturing');
      setSelectorOpen(true);
    }
  }, [rfq, itemId]);

  const refreshItems = useCallback(async () => {
    if (!rfqId) return;
    try {
      const rfqRes = await salesService.getQuoteRequest(rfqId);
      setRfq((prev: any) => prev ? { ...prev, items: rfqRes.items } : rfqRes);
      setCostsVersion(v => v + 1);
    } catch {}
  }, [rfqId]);

  const onAddSelected = async (payload: SelectedItemPayload) => {
    if (!rfqId) return;
    let createdItem: any = null;
    if (payload.item_type === 'product') {
      createdItem = await salesService.addRfqProductItem(rfqId, payload.ref_id, payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount, payload.ref_id, (payload as any).formulas || {});
    } else if (payload.item_type === 'manufacturing') {
      createdItem = await salesService.addRfqManufacturingItem(rfqId, payload.ref_id, payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount, (payload as any).formulas || {});
    } else {
      createdItem = await salesService.addRfqServiceItem(rfqId, payload.ref_id, payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount, (payload as any).formulas || {});
    }
    if (createdItem?.id && (payload as any).files?.length) {
      for (const f of (payload as any).files) {
        try {
          const key = (f as any)?.uid || (f as any)?.name;
          const remark = (payload as any).fileRemarks?.[key];
          await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark);
        } catch { message.error('Nem sikerült a csatolmányok egy részét feltölteni'); }
      }
    }
    message.success('Tétel hozzáadva');
    if (!(payload as any).keepOpen) setSelectorOpen(false);
    refreshItems();
    onDataChanged?.();
  };

  const onEditSelected = async (payload: SelectedItemPayload) => {
    if (!editContext?.item) return;
    try {
      const patch: any = {
        quantity: payload.quantity, unit: payload.unit,
        net_unit_price: payload.net_unit_price, vat_rate: payload.vat_rate,
        description: payload.description,
        discount_percent: (payload as any).discount_percent,
        discount_amount: (payload as any).discount_amount,
        formulas: (payload as any).formulas || {},
      };
      if (payload.item_type === 'product') { patch.item_type = 'product'; patch.product = payload.ref_id; patch.manufacturing_product = null; patch.service = null; }
      else if (payload.item_type === 'manufacturing') { patch.item_type = 'manufacturing'; patch.manufacturing_product = payload.ref_id; patch.product = null; patch.service = null; }
      else if (payload.item_type === 'service') { patch.item_type = 'service'; patch.service = payload.ref_id; patch.product = null; patch.manufacturing_product = null; }
      await salesService.updateQuoteRequestItem(editContext.item.id, patch);
      if ((payload as any).files?.length) {
        for (const f of (payload as any).files) {
          try {
            const key = (f as any)?.uid || (f as any)?.name;
            const remark = (payload as any).fileRemarks?.[key];
            await salesService.uploadQuoteRequestItemAttachment(editContext.item.id, f as any, remark);
          } catch { message.error('Nem sikerült feltölteni egy csatolmányt'); }
        }
      }
      message.success('Tétel frissítve');
      if (!(payload as any).keepOpen) { setSelectorOpen(false); setEditContext(null); }
      refreshItems();
      onDataChanged?.();
    } catch { message.error('Nem sikerült frissíteni a tételt'); }
  };

  const handleSave = async (closeAfter = false) => {
    const v = await formBasic.validateFields();
    setSaving(true);
    try {
      const companyId = v.company_id ?? rfq?.company?.id;
      const updateData: any = {
        title: v.title || rfq?.number || rfq?.request_number || '',
        issue_date: v.issue_date ? v.issue_date.format('YYYY-MM-DD') : undefined,
        deadline: v.deadline ? v.deadline.format('YYYY-MM-DD') : undefined,
        contact_ids: v.contact_ids || [],
        project_id: v.project_id,
        currency_code: v.currency_code,
        partial_order_allowed: v.partial_order_allowed,
      };
      if (companyId === 'private') { updateData.company_id = null; }
      else if (companyId) { updateData.company_id = companyId; }
      await salesService.updateQuoteRequestBasic(rfqId!, updateData);
      message.success('Mentve');
      setLastSavedAt(dayjs());
      onDataChanged?.();
      if (closeAfter) { onClose(); return; }
      load();
    } catch { message.error('Mentés sikertelen'); }
    finally { setSaving(false); }
  };

  const statusColors: Record<string, string> = { new: 'blue', in_progress: 'orange', quoted: 'cyan', accepted: 'green', rejected: 'red', expired: 'default' };
  const statusLabels: Record<string, string> = { new: 'Új', in_progress: 'Folyamatban', quoted: 'Árazva', accepted: 'Elfogadva', rejected: 'Elutasítva', expired: 'Lejárt' };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={960}
        title={rfq ? `${rfq.number || rfq.request_number} — szerkesztés` : 'Ajánlat szerkesztése'}
        styles={{ body: { padding: '12px 16px' } }}
        extra={
          <Space>
            <Tag color={statusColors[rfq?.status] || 'default'}>{statusLabels[rfq?.status] || rfq?.status}</Tag>
            <Button loading={saving} onClick={() => handleSave(false)}>Mentés</Button>
            <Button type="primary" loading={saving} onClick={() => handleSave(true)}>Mentés &amp; bezárás</Button>
          </Space>
        }
        destroyOnClose
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : rfq ? (
          <Form layout="vertical" form={formBasic} size="small">
            {/* Alapadatok */}
            <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
              <Row gutter={[8, 4]}>
                <Col xs={24} md={6}>
                  <Form.Item label="Ajánlatszám" name="number" style={{ marginBottom: 6 }}>
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Cím" name="title" style={{ marginBottom: 6 }}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Keltezés" name="issue_date" style={{ marginBottom: 6 }}>
                    <DatePicker style={{ width: '100%' }} disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Határidő" name="deadline" style={{ marginBottom: 6 }}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* Ügyfél */}
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
              <Row gutter={[8, 4]}>
                <Col xs={24} md={8}>
                  <Form.Item label="Cég" style={{ marginBottom: 6 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="company_id" noStyle>
                        <Select
                          showSearch filterOption={filterOptionAccents}
                          placeholder="Válassz céget" style={{ width: 'calc(100% - 32px)' }}
                          onFocus={async () => {
                            const list = await crmService.getCompanies({ is_customer: true, compact: true });
                            const loaded = ((list as any).results ?? list) || [];
                            const merged = Array.isArray(loaded) ? [...loaded] : [];
                            if (rfq?.company?.id && !merged.find((c: any) => c.id === rfq.company.id)) {
                              merged.unshift({ id: rfq.company.id, name: rfq.company.name, is_customer: true });
                            }
                            setCompanies(merged);
                          }}
                          onChange={async (val) => {
                            try {
                              if (val === 'private') {
                                const list = await crmService.getPrivateContacts();
                                setContacts((list as any).results ?? list);
                              } else {
                                const list = await crmService.getContactsByCompany(val);
                                setContacts((list as any).results ?? list);
                              }
                              formBasic.setFieldValue('contact_ids', []);
                            } catch {}
                          }}
                        >
                          <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                          {(companies || []).map((c: any) => (
                            <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Button icon={<PlusOutlined />} title="Új kapcsolattartó"
                        onClick={() => {
                          const companyId = formBasic.getFieldValue('company_id');
                          let url = '/crm/contacts?action=create';
                          if (companyId && companyId !== 'private') url += `&company=${companyId}`;
                          window.open(url, '_blank');
                        }}
                      />
                    </Space.Compact>
                  </Form.Item>
                </Col>
                <Col xs={24} md={16}>
                  <Form.Item label="Kapcsolattartók" style={{ marginBottom: 6 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="contact_ids" noStyle>
                        <Select
                          mode="multiple" allowClear showSearch filterOption={filterOptionAccents}
                          optionLabelProp="label" placeholder="Válassz kapcsolattartókat"
                          style={{ width: 'calc(100% - 80px)' }}
                          options={(contacts || []).map((p: any, idx: number) => ({
                            value: String(p.id ?? idx),
                            label: contactOptionLabel(p),
                          }))}
                          onFocus={async () => {
                            const companyId = formBasic.getFieldValue('company_id');
                            try {
                              if (companyId === 'private') {
                                setContacts((await crmService.getPrivateContacts() as any).results ?? await crmService.getPrivateContacts());
                              } else if (companyId) {
                                const list = await crmService.getContactsByCompany(companyId);
                                setContacts((list as any).results ?? list);
                              }
                            } catch {}
                          }}
                        />
                      </Form.Item>
                      <Button onClick={async () => {
                        const companyId = formBasic.getFieldValue('company_id');
                        try {
                          if (companyId === 'private') { setContacts(((await crmService.getPrivateContacts() as any).results) ?? []); }
                          else if (companyId) { const list = await crmService.getContactsByCompany(companyId); setContacts((list as any).results ?? list); }
                          else { message.warning('Először válassz céget'); return; }
                          message.success('Frissítve');
                        } catch {}
                      }}>Frissítés</Button>
                    </Space.Compact>
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* Tételek */}
            <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
              {editContext ? (
                <ItemSelectorModal
                  renderInline
                  open={true}
                  mode="edit"
                  defaultType={selectorType}
                  onCancel={() => setEditContext(null)}
                  onAdd={async (p) => onEditSelected(p)}
                  rfqId={rfqId ?? undefined}
                  rfqCurrency={activeCurrency}
                  initialSelection={{
                    item_type: editContext.item.item_type,
                    ref_id: (editContext.item.product || editContext.item.manufacturing_product || editContext.item.service) as number,
                    name: editContext.item.product_name || editContext.item.manufacturing_product_name || editContext.item.service_name,
                  }}
                  initialValues={{
                    quantity: Number(editContext.item.quantity),
                    unit: editContext.item.unit,
                    net_unit_price: Number(editContext.item.net_unit_price),
                    vat_rate: Number(editContext.item.vat_rate),
                    description: editContext.item.description,
                    discount_percent: Number(editContext.item.discount_percent || 0),
                    discount_amount: Number(editContext.item.discount_amount || 0),
                  }}
                  initialFormulas={editContext.item.formulas || {}}
                  quoteItemId={editContext.item.id}
                />
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#0958d9', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tételek</div>
                  <Row gutter={[8, 4]} style={{ marginBottom: 6 }}>
                    <Col xs={24} md={10}>
                      <Form.Item label="Projekt" name="project_id" style={{ marginBottom: 0 }}>
                        <Select allowClear showSearch optionFilterProp="label" placeholder="Válassz projektet">
                          {(projects || []).map((p: any) => (
                            <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Form.Item name="partial_order_allowed" valuePropName="checked" style={{ marginBottom: 0 }}>
                      <Checkbox>Részlegesen megrendelhető</Checkbox>
                    </Form.Item>
                  </div>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectorType('manufacturing'); setSelectorOpen(true); }}>
                    Tétel hozzáadása
                  </Button>
                  <div style={{ marginTop: 6 }}>
                    <ItemsTable
                      items={rfq.items || []}
                      onRefresh={refreshItems}
                      quoteRequestId={rfqId!}
                      currency={activeCurrency}
                      onEditItem={(item) => {
                        setEditContext({ item });
                        setSelectorType(item.item_type);
                      }}
                      currencySelector={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 500, whiteSpace: 'nowrap', fontSize: 13 }}>Pénznem:</span>
                          <Form.Item name="currency_code" noStyle>
                            <Select showSearch optionFilterProp="label" placeholder="Válassz pénznemet" style={{ width: 200 }} size="small">
                              {(currencyList || []).map((c: any) => (
                                <Select.Option key={c.id} value={c.code} label={`${c.code} – ${c.name}`}>
                                  {c.code} – {c.name} {c.symbol ? `(${c.symbol})` : ''}
                                </Select.Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </div>
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {lastSavedAt && (
              <div style={{ fontSize: 11, color: '#888', textAlign: 'right' }}>
                Utoljára mentve: {lastSavedAt.format('YYYY. MM. DD. HH:mm:ss')}
              </div>
            )}
          </Form>
        ) : null}
      </Drawer>

      <ItemSelectorModal
        open={selectorOpen && !editContext}
        defaultType={selectorType}
        onCancel={() => { setSelectorOpen(false); }}
        onAdd={onAddSelected}
        mode="add"
        rfqId={rfqId ?? undefined}
        rfqCurrency={activeCurrency}
      />
    </>
  );
};

export default RFQEditDrawer;
