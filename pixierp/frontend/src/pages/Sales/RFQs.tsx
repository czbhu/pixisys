import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Space, Tag, Spin, Alert, message, Tooltip, Modal, Form, Input, DatePicker, Select, Row, Col, Divider, Upload, Checkbox, List } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, EyeOutlined, SendOutlined, EditOutlined, LockOutlined, UnlockOutlined, SearchOutlined, CopyOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { crmService } from '../../services/crmService';
import { manufacturingService, Currency as MCurrency } from '../../services/manufacturingService';
import { settingsService } from '../../services/settingsService';
import { useAuth } from '../../contexts/AuthContext';
import dayjs from 'dayjs';
import { ItemSelectorModal, SelectedItemPayload } from '../../components/Sales/ItemSelectorModal';
import { ItemsTable } from '../../components/Sales/ItemsTable';

const { TextArea } = Input;

const RFQs: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [nextNumber, setNextNumber] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [form] = Form.useForm();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('product');
  const [newItems, setNewItems] = useState<any[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('HUF');
  const [currencyList, setCurrencyList] = useState<MCurrency[]>([]);
  const [rfqFiles, setRfqFiles] = useState<UploadFile<any>[]>([]);
  const [rfqFileRemarks, setRfqFileRemarks] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sendOpenId, setSendOpenId] = useState<number | null>(null);
  const [sendForm] = Form.useForm();
  const [sendPreview, setSendPreview] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const [partialOrderOpenId, setPartialOrderOpenId] = useState<number | null>(null);
  const [partialSelection, setPartialSelection] = useState<number[]>([]);
  const [partialLoading, setPartialLoading] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all_except_archived');
  const [partialOrderAllowed, setPartialOrderAllowed] = useState<boolean>(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
    const [rfqRes, compRes, projRes] = await Promise.all([
        salesService.getQuoteRequests(),
        crmService.getCompanies(),
        manufacturingService.getProjects(),
      ]);
    const rfqRaw = (rfqRes.results ?? rfqRes) as any[];
    const rfqList = (rfqRaw || []).filter(r => (r.items || []).length > 0);
      const compList = ((compRes.results ?? compRes) as any[]).filter((c: any) => c.is_customer);
    setRfqs(rfqList);
    setFiltered(rfqList);
      setCompanies(compList);
    setProjects(projRes as any);
    } catch (e) {
      console.error(e);
      setError('Hiba történt az adatok betöltése során');
    } finally {
      setLoading(false);
    }
  };

  const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  useEffect(() => {
    let filtered = rfqs || [];
    
    // Státusz szűrés
    if (statusFilter === 'all_except_archived') {
      filtered = filtered.filter(r => r.status !== 'archived');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    
    // Szöveges keresés
    const q = normalize(query);
    if (q) {
      filtered = filtered.filter(r => {
        const hay = [
          r.number || r.request_number || '',
          r.title || '',
          r.company?.name || r.company_name || '',
          r.contact_names || (r.contacts || []).map((c: any) => c.name).join(', '),
          (r.items || []).map((it: any) => it.product?.name || it.manufacturing_product?.name || it.service?.name || it.description || '').join(' '),
        ].join(' \u0001 ');
        return normalize(hay).includes(q);
      });
    }
    
    setFiltered(filtered);
  }, [query, rfqs, statusFilter]);

  const statusTag = (status: string) => {
    const color = {
      new: 'blue',
      in_progress: 'orange',
      quoted: 'cyan',
      accepted: 'green',
      rejected: 'red',
      expired: 'default',
      archived: 'default',
      ordered: 'purple',
    } as Record<string, any>;
    const text = {
      new: 'Új',
      in_progress: 'Folyamatban',
      quoted: 'Árazva',
      accepted: 'Elfogadva',
      rejected: 'Elutasítva',
      expired: 'Lejárt',
      archived: 'Archív',
      ordered: 'Megrendelve',
    } as Record<string, string>;
    return <Tag color={color[status] || 'default'}>{text[status] || status}</Tag>;
  };

  const columns = useMemo(() => ([
  { title: 'Ajánlatszám', dataIndex: 'number', key: 'number', sorter: (a: any, b: any) => (a.number || '').localeCompare(b.number || '') },
  { title: 'Keltezés', dataIndex: 'issue_date', key: 'issue_date', render: (d: string) => d ? new Date(d).toLocaleDateString('hu-HU') : '', sorter: (a: any, b: any) => (a.issue_date || '').localeCompare(b.issue_date || '') },
  { title: 'Cím', dataIndex: 'title', key: 'title', sorter: (a: any, b: any) => (a.title || '').localeCompare(b.title || '') },
  { title: 'Cég', dataIndex: ['company', 'name'], key: 'company_name', render: (_: any, r: any) => r.company?.name || r.company_name || 'Magánszemély', sorter: (a: any, b: any) => (a.company?.name || a.company_name || '').localeCompare(b.company?.name || b.company_name || '') },
  { title: 'Kapcsolattartó', key: 'contact_names', render: (_: any, r: any) => r.contact_names || (r.contacts || []).map((c: any) => c.name).join(', '), sorter: (a: any, b: any) => (a.contact_names || '').localeCompare(b.contact_names || '') },
    { 
      title: 'Összeg', 
      key: 'total_amount', 
      render: (_: any, r: any) => {
        const amount = r.total_amount || 0;
        const currencySymbol = r.currency_symbol || 'Ft';
        return `${amount.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currencySymbol}`;
      },
      sorter: (a: any, b: any) => (a.total_amount || 0) - (b.total_amount || 0),
      align: 'right' as const
    },
    { title: 'Státusz', dataIndex: 'status', key: 'status', render: statusTag, sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || '') },
    { title: 'Határidő', dataIndex: 'deadline', key: 'deadline', render: (d: string) => new Date(d).toLocaleDateString('hu-HU'), sorter: (a: any, b: any) => (a.deadline || '').localeCompare(b.deadline || '') },
    {
      title: 'Műveletek', key: 'actions', render: (record: any) => (
        <Space size="small">
          <Tooltip title="Szerkesztés">
            <Button icon={<EditOutlined />} size="small" onClick={() => navigate(`/sales/rfqs/${record.id}`)} />
          </Tooltip>
          <Tooltip title="Kiküldés e-mailben">
            <Button icon={<SendOutlined />} size="small" onClick={async () => {
              setSendOpenId(record.id);
              setSendPreview(null);
              
              // Load email templates and signatures
              let templates: any[] = [];
              let sigs: any[] = [];
              try {
                const [templatesRes, sigsRes] = await Promise.all([
                  settingsService.getEmailTemplates(),
                  settingsService.getSignatures()
                ]);
                templates = Array.isArray(templatesRes) ? templatesRes : (templatesRes?.results ?? []);
                sigs = Array.isArray(sigsRes) ? sigsRes : (sigsRes?.results ?? []);
                setEmailTemplates(templates);
                setSignatures(sigs);
              } catch {}
              
              // Auto-fill contact emails
              const contactEmails = (record.contacts || []).map((c: any) => c.email).filter(Boolean).join(', ');
              
              // Load user preferences for default signature
              let signatureKey = '';
              try {
                const prefs = await settingsService.getUserPreferences();
                if (prefs && prefs.default_signature_key) {
                  signatureKey = prefs.default_signature_key;
                }
              } catch (err) {
                // Ignore errors - user may not have preferences set
              }
              
              // If no default signature set, use the first available one
              if (!signatureKey && sigs.length > 0) {
                signatureKey = sigs[0].key;
              }
              
              // Load default template and populate subject, body, cc, reply_to
              const defaultTemplate = templates.find((t: any) => t.key === 'rfq_send');
              let subject = '';
              let body = '';
              let cc = '';
              let replyTo = '';
              
              if (defaultTemplate) {
                // Build context for template variables
                subject = defaultTemplate.subject_template || '';
                body = defaultTemplate.body_template || '';
                cc = defaultTemplate.default_cc || '';
                replyTo = defaultTemplate.default_reply_to || '';
                
                // Replace variables
                const contactNames = (record.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
                subject = subject.replace('{rfq_number}', record.number || record.request_number || '');
                subject = subject.replace('{rfq_title}', record.title || '');
                subject = subject.replace('{company_name}', record.company?.name || '');
                subject = subject.replace('{contact_names}', contactNames);
                
                body = body.replace('{rfq_number}', record.number || record.request_number || '');
                body = body.replace('{rfq_title}', record.title || '');
                body = body.replace('{company_name}', record.company?.name || '');
                body = body.replace('{contact_names}', contactNames);
                body = body.replace('{public_order_url}', record.public_order_url || '');
              }
              
              // Append signature to body if signature is selected
              if (signatureKey) {
                const signature = sigs.find((s: any) => s.key === signatureKey);
                if (signature && signature.body_html) {
                  body = body + '\n\n' + signature.body_html;
                }
              }
              
              sendForm.setFieldsValue({ 
                template_key: 'rfq_send',
                to: contactEmails || '',
                cc: cc,
                reply_to: replyTo,
                signature_key: signatureKey,
                subject: subject,
                body: body
              });
            }} />
          </Tooltip>
          {record.status !== 'in_progress' && (
            <Tooltip title="Nyitás">
              <Button icon={<UnlockOutlined />} size="small" onClick={async () => { await salesService.setQuoteRequestStatus(record.id, 'in_progress'); message.success('Megnyitva'); loadData(); }} />
            </Tooltip>
          )}
          {record.status !== 'quoted' && (
            <Tooltip title="Zárás (Árazva)">
              <Button icon={<LockOutlined />} size="small" onClick={async () => { await salesService.setQuoteRequestStatus(record.id, 'quoted'); message.success('Lezárva'); loadData(); }} />
            </Tooltip>
          )}
          <Tooltip title="Másolás">
            <Button icon={<CopyOutlined />} size="small" onClick={async () => {
              try {
                const res = await salesService.copyQuoteRequest(record.id);
                message.success(`Árajánlat másolva: ${res.number}`);
                navigate(`/sales/rfqs/${res.id}`);
              } catch (e: any) {
                message.error(e?.response?.data?.error || 'Nem sikerült másolni');
              }
            }} />
          </Tooltip>
          <Tooltip title="Összes tétel megrendelése">
            <Button size="small" type="primary" onClick={async () => {
              try {
                const res = await salesService.orderAllFromRfq(record.id);
                message.success(`Megrendelés létrehozva: ${res.order_number}`);
                loadData();
                // Navigálás a megrendelésekhez
                setTimeout(() => navigate('/sales/customer-orders'), 1000);
              } catch (e: any) {
                message.error(e?.response?.data?.error || 'Hiba a megrendelés létrehozásakor');
              }
            }}>Rendel (összes)</Button>
          </Tooltip>
          <Tooltip title="Részleges megrendelés">
            <Button size="small" onClick={() => {
              setPartialOrderOpenId(record.id);
              setPartialSelection((record.items || []).map((it: any) => it.id));
            }}>Részleges</Button>
          </Tooltip>
        </Space>
      )
    }
  ]), [navigate]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      console.log('[RFQs] Form values:', values);
      console.log('[RFQs] contact_ids type:', typeof values.contact_ids, 'isArray:', Array.isArray(values.contact_ids));
      console.log('[RFQs] contact_ids value:', values.contact_ids);
      
      const computedTitle = (values.title && values.title.trim()) ? values.title.trim() : (nextNumber || '');
      const computedDescription = (values.description && values.description.trim()) ? values.description.trim() : (computedTitle || 'Új árajánlat');
      const createPayload = {
        title: computedTitle,
        description: computedDescription,
        issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : undefined,
        deadline: values.deadline.format('YYYY-MM-DD'),
        partial_order_allowed: partialOrderAllowed,
      } as any;
      
      console.log('[RFQs] Creating RFQ with:', createPayload);
      const created = await salesService.createQuoteRequest(createPayload);
      console.log('[RFQs] Created RFQ:', created);
      
      // Immediately enrich basic fields that serializer would reject on create
      const updateData: any = {
        contact_ids: values.contact_ids || [],
        currency_code: currency,
        project_id: values.project_id,
        internal_description: values.internal_description || '',
      };
      
      // Set company_id: null for private, or the actual ID
      if (values.company_id === 'private') {
        updateData.company_id = null;
        console.log('[RFQs] Setting company_id to null (private)');
      } else if (values.company_id) {
        updateData.company_id = values.company_id;
        console.log('[RFQs] Setting company_id to:', values.company_id);
      }
      
      console.log('[RFQs] Updating with:', updateData);
      try {
        const updated = await salesService.updateQuoteRequestBasic(created.id, updateData);
        console.log('[RFQs] Update successful:', updated);
        console.log('[RFQs] Updated contacts:', updated.contacts);
      } catch (err) {
        console.error('[RFQs] Update basic failed:', err);
        message.error('Nem sikerült menteni a cég/kapcsolattartó adatokat');
        throw err; // Re-throw to prevent continuing
      }
      // Upload RFQ-level attachments, if any
      if (rfqFiles.length) {
        for (const f of rfqFiles) {
          try {
            const key = (f as any)?.uid || (f as any)?.name;
            const remark = rfqFileRemarks[key];
            await salesService.uploadQuoteRequestAttachment(created.id, (f as any).originFileObj || (f as any), remark);
          } catch {}
        }
      }
      // add items if any
      if (newItems.length) {
        for (const it of newItems) {
          if (it.item_type === 'product') {
            const createdItem = await salesService.addRfqProductItem(created.id, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount, it.ref_id);
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          } else if (it.item_type === 'manufacturing') {
            const createdItem = await salesService.addRfqManufacturingItem(created.id, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          } else {
            const createdItem = await salesService.addRfqServiceItem(created.id, it.ref_id, it.quantity, it.description || '', it.unit, it.net_unit_price, it.vat_rate, (it as any).discount_percent, (it as any).discount_amount);
            if (createdItem?.id && it.files?.length) {
              for (const f of it.files) {
                const key = (f as any)?.uid || (f as any)?.name;
                const remark = (it as any).fileRemarks ? (it as any).fileRemarks[key] : undefined;
                try { await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark); } catch {}
              }
            }
          }
        }
      }
      message.success('Árajánlat létrehozva');
      setCreateOpen(false);
      form.resetFields();
      setNewItems([]);
  setRfqFiles([]);
  setRfqFileRemarks({});
      loadData();
    } catch (e) {
      // validation or api error
    }
  };

  const openCreate = async () => {
    // Automatikus kitöltés az aktuális felhasználóval
    const userName = user?.first_name && user?.last_name ? `${user.last_name} ${user.first_name}` : user?.username || '';
    setCurrentUserName(userName);
    const today = dayjs();
    const nn = await salesService.getNextQuoteRequestNumber(today.format('YYYY-MM-DD'));
    setNextNumber(nn.number);
    try {
      const currs = await manufacturingService.getCurrencies();
      setCurrencyList(currs);
      const def = currs.find(c => c.is_default);
      if (def?.code) setCurrency(def.code.toUpperCase());
    } catch {}
    setCreateOpen(true);
  };

  const onIssueDateChange = async (value: dayjs.Dayjs | null) => {
    const date = value || dayjs();
    const nn = await salesService.getNextQuoteRequestNumber(date.format('YYYY-MM-DD'));
    setNextNumber(nn.number);
    // if user didn't override deadline, recompute default 14 workdays from new issue date
    const currentDeadline = form.getFieldValue('deadline');
    if (!currentDeadline) {
      form.setFieldValue('deadline', addWorkdays(date, 14));
    }
  };

  function addWorkdays(start: dayjs.Dayjs, workdays: number): dayjs.Dayjs {
    let d = start;
    let added = 0;
    while (added < workdays) {
      d = d.add(1, 'day');
      const day = d.day();
      if (day !== 0 && day !== 6) added += 1; // Mon-Fri only
    }
    return d;
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <Card
        title="Árajánlatok"
        extra={
          <Space>
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              style={{ width: 220 }}
            >
              <Select.Option value="all">Mind</Select.Option>
              <Select.Option value="all_except_archived">Mind (kivéve archív)</Select.Option>
              <Select.Option value="new">Új</Select.Option>
              <Select.Option value="quoted">Árazva</Select.Option>
              <Select.Option value="rejected">Elutasítva</Select.Option>
              <Select.Option value="accepted">Elfogadva</Select.Option>
              <Select.Option value="archived">Archív</Select.Option>
            </Select>
            <Input allowClear prefix={<SearchOutlined />} placeholder="Gyors kereső…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 280 }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Új árajánlat</Button>
          </Space>
        }
      >
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        
        <Table columns={columns as any} dataSource={filtered} rowKey="id" pagination={{ pageSize: 10 }} />
      </Card>
      <Modal title="Ajánlat kiküldése e-mailen" open={!!sendOpenId} onOk={async () => {
        const v = await sendForm.validateFields();
        if (!sendOpenId) return;
        try {
          await salesService.sendQuoteRequestEmail(sendOpenId, v);
          message.success('E-mail elküldve');
          setSendOpenId(null);
        } catch {
          message.error('Nem sikerült elküldeni az e-mailt');
        }
      }} onCancel={() => setSendOpenId(null)}>
        <Form layout="vertical" form={sendForm} initialValues={{ template_key: 'rfq_send' }}>
          <Form.Item label="Címzettek" name="to" rules={[{ required: true, message: 'Add meg a címzetteket' }]}>
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>
          <Form.Item label="Másolat (CC)" name="cc">
            <Input placeholder="cc@example.com" />
          </Form.Item>
          <Form.Item label="Válaszcím (Reply-To)" name="reply_to">
            <Input placeholder="reply@example.com" />
          </Form.Item>
          <Form.Item label="Email sablon" name="template_key" rules={[{ required: true, message: 'Válassz sablont' }]}>
            <Select 
              placeholder="Válassz email sablont" 
              showSearch 
              optionFilterProp="label"
              onChange={async (templateKey: string) => {
                // Load and set subject, body, cc and reply_to from template
                const template = emailTemplates.find((t: any) => t.key === templateKey);
                if (template) {
                  // Get current RFQ data to build context
                  const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
                  if (rec) {
                    let subject = template.subject_template || '';
                    let body = template.body_template || '';
                    const cc = template.default_cc || '';
                    const replyTo = template.default_reply_to || '';
                    
                    // Build contact names
                    const contactNames = (rec.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
                    
                    // Replace variables in subject
                    subject = subject.replace('{rfq_number}', rec.number || rec.request_number || '');
                    subject = subject.replace('{rfq_title}', rec.title || '');
                    subject = subject.replace('{company_name}', rec.company?.name || '');
                    subject = subject.replace('{contact_names}', contactNames);
                    
                    // Replace variables in body
                    body = body.replace('{rfq_number}', rec.number || rec.request_number || '');
                    body = body.replace('{rfq_title}', rec.title || '');
                    body = body.replace('{company_name}', rec.company?.name || '');
                    body = body.replace('{contact_names}', contactNames);
                    body = body.replace('{public_order_url}', rec.public_order_url || '');
                    
                    sendForm.setFieldsValue({ subject, body, cc, reply_to: replyTo });
                  }
                }
              }}
            >
              {emailTemplates.map((tpl: any) => (
                <Select.Option key={tpl.key} value={tpl.key} label={tpl.name}>
                  {tpl.name} ({tpl.key})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Aláírás" name="signature_key">
            <Select 
              placeholder="Válassz aláírást" 
              allowClear 
              showSearch 
              optionFilterProp="label"
              onChange={(sigKey: string) => {
                // Update body with new signature
                const currentBody = sendForm.getFieldValue('body') || '';
                const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
                if (!rec) return;
                
                // Remove old signature from body (everything after last occurrence of signature delimiter)
                let bodyWithoutSig = currentBody;
                const template = emailTemplates.find((t: any) => t.key === sendForm.getFieldValue('template_key'));
                if (template && template.body_template) {
                  // Try to find where template body ends
                  const contactNames = (rec.contacts || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'Ügyfelünk';
                  let templateBody = template.body_template || '';
                  templateBody = templateBody.replace('{rfq_number}', rec.number || rec.request_number || '');
                  templateBody = templateBody.replace('{rfq_title}', rec.title || '');
                  templateBody = templateBody.replace('{company_name}', rec.company?.name || '');
                  templateBody = templateBody.replace('{contact_names}', contactNames);
                  templateBody = templateBody.replace('{public_order_url}', rec.public_order_url || '');
                  bodyWithoutSig = templateBody;
                }
                
                // Add new signature
                let newBody = bodyWithoutSig;
                if (sigKey) {
                  const signature = signatures.find((s: any) => s.key === sigKey);
                  if (signature && signature.body_html) {
                    newBody = bodyWithoutSig + '\n\n' + signature.body_html;
                  }
                }
                
                sendForm.setFieldsValue({ body: newBody });
              }}
            >
              {signatures.map((sig: any) => (
                <Select.Option key={sig.key} value={sig.key} label={sig.name}>
                  {sig.name} ({sig.key})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Tárgy" name="subject">
            <Input placeholder="E-mail tárgya" onChange={async () => {
              const v = await sendForm.getFieldsValue();
              if (!sendOpenId) return;
              try { const p = await salesService.renderQuoteRequestEmail(sendOpenId, { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) }); setSendPreview(p); } catch {}
            }} />
          </Form.Item>
          <Form.Item label="Törzs" name="body">
            <Input.TextArea rows={8} placeholder="E-mail törzse" onChange={async () => {
              const v = await sendForm.getFieldsValue();
              if (!sendOpenId) return;
              try { const p = await salesService.renderQuoteRequestEmail(sendOpenId, { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) }); setSendPreview(p); } catch {}
            }} />
          </Form.Item>
          <Button onClick={async () => {
            const v = await sendForm.validateFields();
            if (!sendOpenId) return;
            try {
              const p = await salesService.renderQuoteRequestEmail(sendOpenId, { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) });
              setSendPreview(p);
            } catch {
              message.error('Előnézet nem elérhető');
            }
          }}>Előnézet</Button>
          {(() => {
            const rec = (filtered || rfqs || []).find(r => r.id === sendOpenId);
            const url = rec?.public_order_url;
            return url ? (
              <div style={{ marginTop: 8, padding: 8, background: '#fafafa', border: '1px solid #eee', borderRadius: 4 }}>
                Megrendelő link: <a href={url} target="_blank" rel="noreferrer">{url}</a>
              </div>
            ) : null;
          })()}
        </Form>
        {sendPreview && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <div><strong>Tárgy:</strong> {sendPreview.subject}</div>
            <div style={{ marginTop: 8 }}>
              {sendPreview.is_html ? (
                <div dangerouslySetInnerHTML={{ __html: sendPreview.body }} />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap' }}>{sendPreview.body}</pre>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="Részleges megrendelés"
        open={partialOrderOpenId !== null}
        onCancel={() => { setPartialOrderOpenId(null); setPartialSelection([]); }}
        onOk={async () => {
          if (!partialOrderOpenId) return;
          try {
            setPartialLoading(true);
            const res = await salesService.orderPartialFromRfq(partialOrderOpenId, partialSelection);
            message.success(`Megrendelés létrehozva: ${res.order_number}`);
            setPartialOrderOpenId(null);
            setPartialSelection([]);
            loadData();
            // Navigálás a megrendelésekhez
            setTimeout(() => navigate('/sales/customer-orders'), 1000);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Hiba a részleges megrendelésnél');
          } finally { setPartialLoading(false); }
        }}
        okButtonProps={{ loading: partialLoading, disabled: !partialSelection.length }}
      >
        {(() => {
          const rec = (filtered || rfqs || []).find(r => r.id === partialOrderOpenId);
          const items = rec?.items || [];
          return (
            <List
              dataSource={items}
              renderItem={(it: any) => (
                <List.Item>
                  <Checkbox
                    checked={partialSelection.includes(it.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPartialSelection((prev) => checked ? [...prev, it.id] : prev.filter(id => id !== it.id));
                    }}
                  >
                    {(it.product_name || it.manufacturing_product_name || it.service_name || it.description || '-')}
                    {' '}— {Number(it.quantity)} {it.unit || ''} × {Number(it.net_unit_price).toLocaleString('hu-HU')} Ft
                  </Checkbox>
                </List.Item>
              )}
            />
          );
        })()}
      </Modal>

      <Modal
        title="Új árajánlat"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="Létrehozás"
        cancelText="Mégse"
        width={1100}
      >
        <Form layout="vertical" form={form} initialValues={{ issue_date: dayjs(), deadline: addWorkdays(dayjs(), 14) }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Tooltip title="Az árajánlat még nem lett elmentve, a napló üres. Mentés után a részleteknél elérhető.">
              <Button size="small" onClick={() => message.info('Mentés előtt nincs napló. Mentsd az árajánlatot, majd a részletek nézetben megnyitható a Napló.')}>
                Napló
              </Button>
            </Tooltip>
          </div>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="Ajánlatszám">
                <Input value={nextNumber || ''} readOnly />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Rögzítette">
                <Input value={currentUserName || ''} readOnly />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Keltezés" name="issue_date">
                <DatePicker style={{ width: '100%' }} onChange={onIssueDateChange} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Határidő" name="deadline" rules={[{ required: true, message: 'Válassz határidőt' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item 
                label="Cég" 
                name="company_id"
              > 
                <Space.Compact style={{ width: '100%' }}>
                  <Select 
                    showSearch 
                    optionFilterProp="label" 
                    placeholder="Válassz céget vagy magánszemélyt" 
                    style={{ width: 'calc(100% - 32px)' }}
                    onFocus={async () => {
                      // Frissítjük a cégek listáját amikor rákattintanak
                      const list = await crmService.getCompanies();
                      setCompanies(list.results ?? list);
                    }}
                    onChange={async (val) => {
                      form.setFieldsValue({ company_id: val });
                      if (val === 'private') {
                        // Magánszemélyek lekérdezése
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                        form.setFieldsValue({ contact_ids: [] });
                      } else {
                        // Céghez tartozó kapcsolattartók lekérdezése
                        const list = await crmService.getContactsByCompany(val);
                        setContacts(list.results ?? list);
                        form.setFieldsValue({ contact_ids: [] });
                      }
                    }}
                  >
                    <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                    {companies.map((c: any) => (
                      <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                    ))}
                  </Select>
                  <Tooltip title="Új cég hozzáadása">
                    <Button 
                      icon={<PlusCircleOutlined />}
                      onClick={() => {
                        window.open('/crm/companies?action=create', '_blank');
                      }}
                    />
                  </Tooltip>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="Kapcsolattartók" name="contact_ids">
                <Space.Compact style={{ width: '100%' }}>
                  <Select 
                    mode="multiple" 
                    allowClear 
                    showSearch 
                    optionFilterProp="label" 
                    placeholder="Válassz kapcsolattartókat"
                    style={{ width: 'calc(100% - 190px)' }}
                    onFocus={async () => {
                      // Frissítjük a kapcsolattartók listáját amikor rákattintanak
                      const companyId = form.getFieldValue('company_id');
                      if (companyId === 'private') {
                        const list = await crmService.getPrivateContacts();
                        setContacts(list.results ?? list);
                      } else if (companyId) {
                        const list = await crmService.getContactsByCompany(companyId);
                        setContacts(list.results ?? list);
                      }
                    }}
                    onChange={(val) => {
                      console.log('[RFQs] Contacts changed to:', val);
                      form.setFieldsValue({ contact_ids: val });
                    }}
                  >
                    {contacts.map((p: any) => (
                      <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
                    ))}
                  </Select>
                  <Tooltip title="Új kapcsolattartó hozzáadása">
                    <Button 
                      icon={<PlusCircleOutlined />}
                      onClick={() => {
                        const companyId = form.getFieldValue('company_id');
                        let url = '/crm/contacts?action=create';
                        if (companyId && companyId !== 'private') {
                          url += `&company=${companyId}`;
                        }
                        window.open(url, '_blank');
                      }}
                    />
                  </Tooltip>
                  <Button 
                    type="default"
                    onClick={async () => {
                      const companyId = form.getFieldValue('company_id');
                      if (companyId) {
                        if (companyId === 'private') {
                          const list = await crmService.getPrivateContacts();
                          setContacts(list.results ?? list);
                          message.success('Magánszemély kapcsolattartók frissítve');
                        } else {
                          const list = await crmService.getContactsByCompany(companyId);
                          setContacts(list.results ?? list);
                          message.success('Kapcsolattartók frissítve');
                        }
                      } else {
                        message.warning('Először válassz céget');
                      }
                    }}
                  >
                    Frissítés
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item label="Megnevezés" name="title">
                <Input placeholder="Ha üres, az ajánlatszám lesz" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Projekt" name="project_id">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Válassz projektet">
                  {(projects || []).map((p: any) => (
                    <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Leírás" name="description">
                <TextArea autoSize={{ minRows: 1, maxRows: 6 }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Belső leírás" name="internal_description">
                <TextArea autoSize={{ minRows: 1, maxRows: 6 }} />
              </Form.Item>
            </Col>
          </Row>
          <Divider />
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Pénznem">
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Válassz pénznemet"
                  value={currency}
                  onChange={(val) => setCurrency(String(val))}
                >
                  {currencyList.map((c) => (
                    <Select.Option key={c.id} value={c.code} label={`${c.code} – ${c.name}`}>
                      {c.code} – {c.name} {c.symbol ? `(${c.symbol})` : ''}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="Ajánlat csatolmányok">
                <Upload.Dragger
                  multiple
                  fileList={rfqFiles}
                  beforeUpload={(file) => {
                    const f = file as any;
                    const key = f.uid || f.name;
                    setRfqFiles((prev) => [...prev, f]);
                    setRfqFileRemarks((prev) => ({ ...prev, [key]: prev[key] ?? '' }));
                    return Upload.LIST_IGNORE;
                  }}
                  onRemove={(file) => {
                    const key = (file as any).uid || (file as any).name;
                    setRfqFiles((prev) => prev.filter((f) => f.uid !== file.uid));
                    setRfqFileRemarks((prev) => {
                      const copy = { ...prev } as any;
                      delete copy[key];
                      return copy;
                    });
                    return true;
                  }}
                >
                  <p className="ant-upload-drag-icon">📎</p>
                  <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a feltöltéshez</p>
                </Upload.Dragger>
                <div style={{ marginTop: 8 }}>
                  {rfqFiles.map((f) => {
                    const key = (f as any).uid || (f as any).name;
                    return (
                      <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <Button type="link" style={{ padding: 0, minWidth: 180, textAlign: 'left' }} onClick={() => {
                          const fileObj = (f as any).originFileObj || f;
                          const url = (f as any).url || (fileObj ? URL.createObjectURL(fileObj) : undefined);
                          if (url) {
                            setPreviewUrl(url);
                            setPreviewTitle(f.name);
                            setPreviewOpen(true);
                          }
                        }}>{f.name}</Button>
                        <Input
                          size="small"
                          placeholder="Megjegyzés"
                          value={rfqFileRemarks[key] || ''}
                          onChange={(e) => setRfqFileRemarks((prev) => ({ ...prev, [key]: e.target.value }))}
                          style={{ flex: 1 }}
                        />
                        <Button danger size="small" onClick={() => {
                          setRfqFiles((prev) => prev.filter((x) => x.uid !== f.uid));
                          setRfqFileRemarks((prev) => {
                            const copy = { ...prev } as any;
                            delete copy[key];
                            return copy;
                          });
                        }}>Törlés</Button>
                      </div>
                    );
                  })}
                </div>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>Tétel hozzáadása:</span>
            <Checkbox 
              checked={partialOrderAllowed}
              onChange={(e) => setPartialOrderAllowed(e.target.checked)}
            >
              Részlegesen megrendelhető
            </Checkbox>
          </div>
          <Space>
            <Button onClick={() => { setSelectorType('product'); setSelectorOpen(true); }}>Termék</Button>
            <Button onClick={() => { setSelectorType('manufacturing'); setSelectorOpen(true); }}>Egyedi Gyártás</Button>
            <Button onClick={() => { setSelectorType('service'); setSelectorOpen(true); }}>Szolgáltatás</Button>
          </Space>
          <div style={{ marginTop: 12 }}>
            <ItemsTable
              currency={currency}
              onDeleteItem={(rec) => {
                setNewItems((prev) => prev.filter((_, idx) => (idx + 1) !== rec.id));
              }}
              onCopyItem={(rec) => {
                const idx = (rec.id as number) - 1;
                const it = newItems[idx];
                if (!it) return;
                setNewItems((prev) => [...prev, { ...it }]);
              }}
              onEditItem={(rec) => {
                const idx = (rec.id as number) - 1;
                const it = newItems[idx];
                setEditIdx(idx);
                setSelectorType(it?.item_type || 'product');
                setSelectorOpen(true);
              }}
              items={newItems.map((it, idx) => {
              const base = {
                id: idx + 1,
                item_type: it.item_type,
                description: it.description,
                quantity: it.quantity,
                unit: it.unit,
                net_unit_price: it.net_unit_price,
                net_total: (Number(it.quantity) || 0) * (Number(it.net_unit_price) || 0),
                vat_rate: it.vat_rate,
                gross_total: ((Number(it.quantity) || 0) * (Number(it.net_unit_price) || 0)) * (1 + (Number(it.vat_rate) || 0) / 100),
                product_code: it.code,
              } as any;
              // compute discounted totals to mirror server logic
              const discountPercent = Number((it as any).discount_percent || 0);
              const discountAmount = Number((it as any).discount_amount || 0);
              const net = Number(base.net_total || 0);
              let discounted = net;
              if (discountPercent > 0) discounted = discounted * (1 - discountPercent / 100);
              if (discountAmount > 0) discounted = Math.max(0, discounted - discountAmount);
              base.discounted_net_total = discounted;
              if (it.item_type === 'product') base.product_name = it.name;
              else if (it.item_type === 'manufacturing') base.manufacturing_product_name = it.name;
              else base.service_name = it.name;
              return base;
            })}
            />
          </div>
        </Form>
      </Modal>
      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => {
          if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
          setPreviewOpen(false);
          setPreviewUrl(null);
          setPreviewTitle('');
        }}
        footer={null}
        width={900}
      >
        {previewUrl ? (
          previewUrl.match(/\.pdf($|\?)/i) ? (
            <iframe title="preview" src={previewUrl} style={{ width: '100%', height: '70vh', border: 0 }} />
          ) : (
            <img alt={previewTitle} src={previewUrl} style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          )
        ) : (
          <div>Nincs előnézet</div>
        )}
      </Modal>

      <ItemSelectorModal
        open={selectorOpen}
        defaultType={selectorType}
        onCancel={() => { setSelectorOpen(false); setEditIdx(null); }}
        onAdd={(p: SelectedItemPayload) => {
          if (editIdx !== null && editIdx >= 0 && editIdx < newItems.length) {
            setNewItems((prev) => prev.map((it, i) => i === editIdx ? { ...it, ...p } : it));
          } else {
            setNewItems((prev) => [...prev, p]);
          }
          setSelectorOpen(false);
          setEditIdx(null);
        }}
        mode={editIdx !== null ? 'edit' : 'add'}
        initialSelection={editIdx !== null ? (newItems[editIdx] ? { item_type: newItems[editIdx].item_type, ref_id: newItems[editIdx].ref_id, name: newItems[editIdx].name } : undefined) : undefined}
        initialValues={editIdx !== null ? (newItems[editIdx] ? {
          quantity: Number(newItems[editIdx].quantity || 1),
          unit: newItems[editIdx].unit,
          net_unit_price: Number(newItems[editIdx].net_unit_price || 0),
          vat_rate: Number(newItems[editIdx].vat_rate || 27),
          description: newItems[editIdx].description,
          discount_percent: Number((newItems[editIdx] as any).discount_percent || 0),
          discount_amount: Number((newItems[editIdx] as any).discount_amount || 0),
        } : undefined) : undefined}
      />
    </div>
  );
};

export default RFQs;
