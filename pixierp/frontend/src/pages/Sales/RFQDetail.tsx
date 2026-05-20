import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Tag, Table, Row, Col, Form, Select, Input, InputNumber, Button, message, Modal, Spin, Space, List, DatePicker, Checkbox, Alert, Popover } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { salesService } from '../../services/salesService';
import api from '../../services/api';
import { manufacturingService } from '../../services/manufacturingService';
import { ItemSelectorModal, SelectedItemPayload } from '../../components/Sales/ItemSelectorModal';
import { ItemsTable } from '../../components/Sales/ItemsTable';
import { Upload, Popconfirm } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { crmService } from '../../services/crmService';
import dayjs from 'dayjs';
import { LeftOutlined, DeleteOutlined, UserAddOutlined, UserSwitchOutlined, LogoutOutlined, TeamOutlined, PlusOutlined, MessageOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { postalCodeService } from '../../services/postalCodeService';
import { getCountries } from '../../services/countryService';
import { ChatDrawer } from '../../components/Chat/ChatDrawer';
import ActivityLogModal from '../../components/ActivityLogModal';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';

const normAccents = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Convert plain-text (with \n) to HTML for ReactQuill; leave existing HTML untouched. */
const toQuillHtml = (text: string | null | undefined): string => {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return '<p>' + text.split('\n').map(l => l || '<br>').join('</p><p>') + '</p>';
};

const filterOptionAccents = (input: string, option: any) =>
  normAccents(option?.label?.toString() || '').includes(normAccents(input));

const { TextArea } = Input;

const RFQDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDirectItemEditMode = Boolean(searchParams.get('editItemId'));
  const editItemIdHandledRef = useRef(false);
  const autoFirstItemRef = useRef(false);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rfq, setRfq] = useState<any>();
  // removed unused local product/service lists
  const [projects, setProjects] = useState<any[]>([]);
  const [formBasic] = Form.useForm();
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('product');
  const [editContext, setEditContext] = useState<null | { item: any }>(null);
  const itemSaveRef = useRef<{ save: (keepOpen: boolean) => Promise<void> } | null>(null);
  const [rfqFiles, setRfqFiles] = useState<UploadFile<any>[]>([]);
  const [rfqPendingRemark, setRfqPendingRemark] = useState<string>('');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendForm] = Form.useForm();
  const [preview, setPreview] = useState<{ subject: string; body: string; is_html: boolean } | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [currencyList, setCurrencyList] = useState<any[]>([]);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [filePreviewTitle, setFilePreviewTitle] = useState('');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [takeoverConfirmOpen, setTakeoverConfirmOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [inviteUserId, setInviteUserId] = useState<number | null>(null);
  const [isCompanyModalVisible, setIsCompanyModalVisible] = useState(false);
  const [companyForm] = Form.useForm();
  const [selectedCountry, setSelectedCountry] = useState('Magyarország');
  const [navPreviewOpen, setNavPreviewOpen] = useState(false);
  const [navPreviewData, setNavPreviewData] = useState<any>(null);
  const [navPreviewSel, setNavPreviewSel] = useState<Record<string, boolean>>({});
  const [navDebug, setNavDebug] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<dayjs.Dayjs | null>(null);
  const [saving, setSaving] = useState(false);
  const closeAfterSaveRef = useRef(false);
  const selectedCompanyId = Form.useWatch('company_id', formBasic);
  const watchedCurrency = Form.useWatch('currency_code', formBasic);
  const activeCurrency = watchedCurrency || rfq?.currency_code || 'HUF';
  
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [signatureTemplates, setSignatureTemplates] = useState<any[]>([]);

  const notifyRfqListUpdated = useCallback(() => {
    try {
      const channel = new BroadcastChannel('pixi_rfq_updates');
      channel.postMessage({ type: 'rfq-item-updated', rfqId: Number(id || 0), itemId: editContext?.item?.id || null, at: Date.now() });
      channel.close();
    } catch {}
  }, [id, editContext?.item?.id]);

  const contactOptionLabel = (p: any, showCompany?: boolean) => {
    const nameParts = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    const altNameParts = [p.last_name, p.first_name].filter(Boolean).join(' ').trim();
    const baseName = (
      p.full_name ||
      p.fullName ||
      nameParts ||
      altNameParts ||
      p.name ||
      p.email ||
      p.phone ||
      p.mobile ||
      p.company_name ||
      p.customer_name ||
      p.id
    );
    const compName = p.customer_name || p.company_name;
    return (showCompany && compName) ? `${baseName} — ${compName}` : baseName;
  };

  /** Refresh only the items list without showing the full-page spinner.
   *  Used after item add/edit/delete/reorder so the cost table updates in place. */
  const refreshItems = useCallback(async () => {
    if (!id) return;
    try {
      const rfqRes = await salesService.getQuoteRequest(Number(id));
      setRfq((prev: any) => prev ? { ...prev, items: rfqRes.items } : rfqRes);
    } catch {}
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [rfqRes, projRes, currRes] = await Promise.all([
        salesService.getQuoteRequest(Number(id)),
        manufacturingService.getProjects(),
        manufacturingService.getCurrencies(),
      ]);
      setRfq(rfqRes);
      // Do not block initial render with full companies list.
      // Keep current company (if any) so selected label can render immediately.
      if (rfqRes?.company?.id) {
        setCompanies([rfqRes.company]);
      } else if (rfqRes?.contacts?.[0]?.company) {
        // Seed from first contact's company so Select can render immediately
        setCompanies([{ id: rfqRes.contacts[0].company, name: rfqRes.contacts[0].company_name }]);
      } else {
        setCompanies([]);
      }

      setCurrencyList(currRes as any);
      const assignedContacts = Array.isArray(rfqRes?.contacts) ? [...rfqRes.contacts] : [];
      setContacts(assignedContacts);

      // Hydrate full contacts list in background (do not block page open)
      (async () => {
        try {
          let baseContacts: any[] = [];
          const contactCompanyId = rfqRes?.contacts?.[0]?.company;
          if (rfqRes?.company?.id) {
            const cl = await crmService.getContactsByCompany(rfqRes.company.id);
            baseContacts = ((cl as any).results ?? cl) || [];
          } else if (contactCompanyId) {
            const cl = await crmService.getContactsByCompany(contactCompanyId);
            baseContacts = ((cl as any).results ?? cl) || [];
            // Also populate the companies list with this company
            if (rfqRes.contacts[0].company_name) {
              setCompanies([{ id: contactCompanyId, name: rfqRes.contacts[0].company_name }]);
            }
          } else if (assignedContacts.length > 0) {
            const cl = await crmService.getPrivateContacts();
            baseContacts = ((cl as any).results ?? cl) || [];
          }

          const merged = Array.isArray(baseContacts) ? [...baseContacts] : [];
          assignedContacts.forEach((rc: any) => {
            if (!merged.find((c: any) => c.id === rc.id)) {
              merged.push(rc);
            }
          });
          setContacts(merged);
        } catch {
          // keep assigned contacts as fallback
        }
      })();
      try {
        const computedDemandTitle = (!rfqRes.title && (rfqRes.items || []).length === 0)
          ? `Ajánlat ${rfqRes.number || rfqRes.request_number}`
          : rfqRes.title;
        const createdByName = rfqRes.created_by_name || rfqRes.requested_by_name || (user?.first_name && user?.last_name ? `${user.last_name} ${user.first_name}` : user?.username || '');
        formBasic.setFieldsValue({
          number: rfqRes.number || rfqRes.request_number,
          created_by_name: createdByName,
          issue_date: rfqRes.issue_date ? dayjs(rfqRes.issue_date) : null,
          deadline: rfqRes.deadline ? dayjs(rfqRes.deadline) : null,
          valid_until: rfqRes.valid_until ? dayjs(rfqRes.valid_until) : null,
          validity_days: rfqRes.validity_days ?? 30,
          company_id: rfqRes.company?.id || rfqRes.contacts?.[0]?.company || (rfqRes.contacts && rfqRes.contacts.length > 0 ? 'private' : undefined),
          contact_ids: (rfqRes.contacts || []).map((c: any) => String(c.id)),
          title: computedDemandTitle,
          project_id: rfqRes.project?.id || rfqRes.project,
          description: toQuillHtml(rfqRes.description),
          internal_description: toQuillHtml(rfqRes.internal_description),
          currency_code: rfqRes.currency_code || 'HUF',
          partial_order_allowed: rfqRes.partial_order_allowed ?? true,
        });
      } catch {}
      try {
        const atts = await salesService.getQuoteRequestAttachments(Number(id));
        // map to UploadFile minimal
        setRfqFiles((atts || []).map((a: any) => ({ uid: String(a.id), name: a.file?.split('/').pop() || `#${a.id}`, status: 'done', url: a.file_url || a.file, response: a })));
      } catch {}
  setProjects(projRes);
    } catch (e) {
      // noop; errors surfaced via UI interactions
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const us = await salesService.listUsers();
        setAllUsers(us as any);
      } catch {}
    })();
  }, []);

  // Auto-open item editor when navigated with ?editItemId=
  useEffect(() => {
    if (!rfq || editItemIdHandledRef.current) return;
    const editItemId = searchParams.get('editItemId');
    if (!editItemId) return;
    editItemIdHandledRef.current = true;
    const item = (rfq.items || []).find((it: any) => it.id === Number(editItemId));
    if (item) {
      setEditContext({ item });
      setSelectorType(item.item_type || 'manufacturing');
    }
  }, [rfq, searchParams]);

  // ESC → vissza az előző lapra
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (window.history.length <= 1) window.close();
        else navigate(-1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate]);

  // Frissítsd a kapcsolattartó listát, amikor cég választás változik - REMOVED to avoid overwriting on load
  // useEffect logic moved to Select onChange and initial load


  const isDemand = (rfq?: any) => {
    const itc = (rfq?.items || []).length;
    return itc === 0;
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const postalCode = e.target.value;
    if (postalCode && postalCode.length === 4) {
      const cityData = postalCodeService.getCityByPostalCode(postalCode);
      if (cityData) {
        companyForm.setFieldsValue({ city: cityData });
      }
    }
  };

  const handleCountryChange = (value: string) => {
    setSelectedCountry(value);
    companyForm.setFieldsValue({
      postal_code: '',
      city: '',
      street_name: '',
      street_type: 'utca',
      house_number: '',
      address: ''
    });
  };

  const handleCompanySubmit = async (values: any) => {
    try {
      const newCompany = await crmService.createCompany(values);
      message.success('Cég sikeresen létrehozva!');
      setIsCompanyModalVisible(false);
      companyForm.resetFields();
      // Reload companies
      const compRes = await crmService.getCompanies({ is_customer: true, compact: true });
      const companiesList = (compRes as any).results ?? compRes;
      const merged = Array.isArray(companiesList) ? [...companiesList] : [];
      if (!merged.find((c: any) => c.id === newCompany.id)) {
        merged.unshift({
          id: newCompany.id,
          name: newCompany.name,
          is_customer: true,
          is_supplier: !!newCompany.is_supplier,
        });
      }
      setCompanies(merged);
      
      // Set the newly created company as selected
      formBasic.setFieldsValue({ company_id: newCompany.id });
      
      // Load contacts for the new company
      try {
        const cl = await crmService.getContactsByCompany(newCompany.id);
        setContacts((cl as any).results ?? cl);
        formBasic.setFieldValue('contact_ids', []);
      } catch {}
      
      // Update title if empty - use company name
      const currentTitle = formBasic.getFieldValue('title');
      if (!currentTitle || !currentTitle.trim()) {
        formBasic.setFieldValue('title', newCompany.name);
      }
    } catch (err) {
      console.error('Error saving company:', err);
      message.error('Hiba történt a cég mentése során');
    }
  };

  const statusTag = (status: string) => {
    const color: Record<string, any> = {
      new: 'blue',
      in_progress: 'orange',
      quoted: isDemand(rfq) ? 'default' : 'cyan',
      accepted: 'green',
      rejected: 'red',
      expired: 'default',
    };
    const text: Record<string, string> = {
      new: 'Új',
      in_progress: 'Folyamatban',
      quoted: isDemand(rfq) ? 'Zárt' : 'Árazva',
      accepted: 'Elfogadva',
      rejected: 'Elutasítva',
      expired: 'Lejárt',
    };
    return <Tag color={color[status] || 'default'}>{text[status] || status}</Tag>;
  };

  // removed unused itemColumns and old add-item helpers (using ItemSelectorModal instead)

  const onAddSelected = async (payload: SelectedItemPayload) => {
    if (!id) return;
    const qid = Number(id);
    let createdItem: any = null;
    if (payload.item_type === 'product') {
      // Send material_id instead of product_id for warehouse materials
      createdItem = await salesService.addRfqProductItem(
        qid, 
        payload.ref_id,
        payload.name || '',
        payload.quantity, 
        payload.description || '', 
        payload.unit, 
        payload.net_unit_price, 
        payload.vat_rate, 
        (payload as any).discount_percent, 
        (payload as any).discount_amount,
        payload.ref_id,  // Send as material_id too
        (payload as any).formulas || {},
      );
    } else if (payload.item_type === 'manufacturing') {
      createdItem = await salesService.addRfqManufacturingItem(qid, payload.ref_id, payload.name || '', payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount, (payload as any).formulas || {});
    } else {
      createdItem = await salesService.addRfqServiceItem(qid, payload.ref_id, payload.name || '', payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount, (payload as any).formulas || {});
    }
    // Upload any queued files
    if (createdItem?.id && payload.files?.length) {
      try {
        for (const f of payload.files) {
          const key = (f as any)?.uid || (f as any)?.name;
          const remark = (payload as any).fileRemarks ? (payload as any).fileRemarks[key] : undefined;
          await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark);
        }
      } catch (e) {
        message.error('Nem sikerült a csatolmányok egy részét feltölteni');
      }
    }
    message.success('Tétel hozzáadva');
    if (!(payload as any).keepOpen) {
      setSelectorOpen(false);
    }
    refreshItems();
  };

  const saveBasicFromCurrentForm = async () => {
    if (!id || !rfq) return;
    const values = formBasic.getFieldsValue();
    const companyId = values.company_id ?? rfq.company?.id;
    if (!companyId && companyId !== 'private') {
      throw new Error('A Cég mező kötelező.');
    }

    const autoTitle = (!values.title || !String(values.title).trim())
      ? (isDemand(rfq) ? `Ajánlat ${rfq.number || rfq.request_number}` : (rfq.number || rfq.request_number))
      : String(values.title).trim();

    const updateData: any = {
      title: autoTitle,
      description: values.description,
      internal_description: values.internal_description,
      issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : undefined,
      deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
      valid_until: values.valid_until ? values.valid_until.format('YYYY-MM-DD') : null,
      validity_days: values.validity_days ?? 30,
      contact_ids: values.contact_ids || [],
      project_id: values.project_id ?? null,
      currency_code: values.currency_code,
      partial_order_allowed: values.partial_order_allowed,
    };

    if (companyId === 'private') {
      updateData.company_id = null;
    } else if (companyId) {
      updateData.company_id = companyId;
    }

    await salesService.updateQuoteRequestBasic(Number(id), updateData);
    setLastSavedAt(dayjs());
  };

  const onEditSelected = async (payload: SelectedItemPayload) => {
    if (!editContext?.item) return;
    try {
      const patch: any = {
        item_name: payload.name,
        quantity: payload.quantity,
        unit: payload.unit,
        net_unit_price: payload.net_unit_price,
        vat_rate: payload.vat_rate,
        description: payload.description,
        discount_percent: (payload as any).discount_percent,
        discount_amount: (payload as any).discount_amount,
        formulas: (payload as any).formulas || {},
      };
      if (payload.item_type === 'product') {
        patch.item_type = 'product';
        patch.product = payload.ref_id;
        patch.manufacturing_product = null;
        patch.service = null;
      } else if (payload.item_type === 'manufacturing') {
        patch.item_type = 'manufacturing';
        patch.manufacturing_product = payload.ref_id;
        patch.product = null;
        patch.service = null;
      } else if (payload.item_type === 'service') {
        patch.item_type = 'service';
        patch.service = payload.ref_id;
        patch.product = null;
        patch.manufacturing_product = null;
      }
      await salesService.updateQuoteRequestItem(editContext.item.id, patch);

      if (isDirectItemEditMode) {
        await saveBasicFromCurrentForm();
      }

      // Upload newly added files (if any)
      if (payload.files && payload.files.length) {
        for (const f of payload.files) {
          try {
            const key = (f as any)?.uid || (f as any)?.name;
            const remark = (payload as any).fileRemarks ? (payload as any).fileRemarks[key] : undefined;
            await salesService.uploadQuoteRequestItemAttachment(editContext.item.id, f as any, remark);
          } catch (e) {
            message.error('Nem sikerült feltölteni egy csatolmányt');
          }
        }
      }
      message.success('Tétel frissítve');
      if (!(payload as any).keepOpen) {
        if (isDirectItemEditMode) {
          notifyRfqListUpdated();
        }
        setSelectorOpen(false);
        setEditContext(null);
      }
      if (isDirectItemEditMode && !(payload as any).keepOpen) {
        // Try to close if this tab was opened by script; otherwise navigate back to the list
        if (window.opener) {
          window.opener.postMessage({ type: 'pixi_rfq_item_updated' }, window.location.origin);
          window.close();
        } else {
          window.location.href = '/sales/rfqs';
        }
        return;
      }
      if (isDirectItemEditMode) {
        await load();
      } else {
        refreshItems();
      }
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : 'Nem sikerült frissíteni a tételt');
    }
  };

  // assignProject removed; project is now part of the main edit form

  const openLogs = async () => {
    if (!id) return;
    const data = await salesService.getQuoteRequestLogs(Number(id));
    setLogs(data.results ?? data);
    setLogsOpen(true);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        {/* Keep form instance connected to avoid AntD warning */}
        <Form form={formBasic} style={{ display: 'none' }} />
        <Spin />
      </div>
    );
  }

  if (!rfq) return null;

  const isDemandOpen = isDemand(rfq) && (rfq.status === 'new' || rfq.status === 'in_progress');
  const isDemandClosed = isDemand(rfq) && rfq.status === 'quoted';

  return (
    <div>
      <Card title={<Space>
        <Button icon={<LeftOutlined />} onClick={() => navigate('/sales/rfqs')}>Vissza</Button>
        <span>{isDemand(rfq) ? 'Ajánlat' : 'Árajánlat'} {rfq.number || rfq.request_number}</span>
      </Space>} extra={<Space>
        <Button icon={<MessageOutlined />} onClick={() => setChatOpen(true)}>Chat</Button>
        <Button type="primary" onClick={async () => {
          try {
            const q = await salesService.createQuoteFromRfq(Number(id));
            message.success(`Ajánlat létrehozva: ${q.quote_number}`);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Nem sikerült ajánlatot készíteni');
          }
        }}>Készíts ajánlatot</Button>
        <Button onClick={() => {
            setSendOpen(true);
            Promise.all([
                api.get('/core/email-templates/'),
                api.get('/core/signature-templates/'),
            ]).then(([tplRes, sigRes]) => {
                setEmailTemplates(tplRes.data.results || tplRes.data);
                setSignatureTemplates(sigRes.data.results || sigRes.data);
            }).catch(err => console.error("Could not load templates", err));
        }}>Kiküldés</Button>
        <Button onClick={async () => {
          try {
            const res = await salesService.copyQuoteRequest(Number(id));
            message.success(`Másolat létrehozva: ${res.number}`);
            navigate(`/sales/rfqs/${res.id}`);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Nem sikerült másolni');
          }
        }}>Másol</Button>
  <Button onClick={() => setActivityLogOpen(true)}>Napló</Button>
        {isDemandOpen && (
          <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'quoted'); message.success('Lezárva'); load(); }}>Lezár</Button>
        )}
        {isDemandClosed && (
          <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'in_progress'); message.success('Újranyitva'); load(); }}>Újra nyit</Button>
        )}
        {!isDemand(rfq) && (
          <>
            <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'accepted'); message.success('Elfogadva'); load(); }}>Elfogad</Button>
            <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'rejected'); message.success('Elutasítva'); load(); }}>Elutasít</Button>
            <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'expired'); message.success('Lejárt'); load(); }}>Lejártat</Button>
          </>
        )}
      </Space>}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <Button icon={<DeleteOutlined />} danger onClick={async () => {
              try { await salesService.softDeleteQuoteRequest(Number(id)); message.success('Megjelölve töröltként'); navigate('/sales/rfqs'); }
              catch { message.error('Nem sikerült törölni'); }
            }}>Törlés</Button>
            {rfq?.assignee_names ? (<span style={{ color: '#888' }}><TeamOutlined /> {rfq.assignee_names}</span>) : null}
          </Space>
        </div>
        <Form layout="vertical" form={formBasic} size="small" onFinish={async (v) => {
          const closeAfter = closeAfterSaveRef.current;
          closeAfterSaveRef.current = false;
          console.log('[RFQDetail] Form submitted with values:', v);
          setSaving(true);
          try {
            // Company or 'private' required for new quote and demand on save
            const companyId = v.company_id ?? rfq.company?.id;
            if (!companyId && companyId !== 'private') {
              message.error('A Cég mező kötelező.');
              return;
            }
            
            // Ellenőrizzük a határidőt
            if (!v.deadline && !isDirectItemEditMode) {
              const suggestedDate = dayjs(v.issue_date || rfq.issue_date || dayjs()).add(14, 'day');
              const confirmed = await new Promise<boolean>((resolve) => {
                Modal.confirm({
                  title: 'Nincs határidő megadva',
                  content: `Megadjunk egy 14 napos határidőt? (${suggestedDate.format('YYYY. MM. DD.')})`,
                  okText: 'Igen',
                  cancelText: 'Mégsem',
                  onOk: () => resolve(true),
                  onCancel: () => resolve(false),
                });
              });
              
              if (confirmed) {
                v.deadline = suggestedDate;
                formBasic.setFieldValue('deadline', suggestedDate);
              } else {
                return; // Vissza az ajánlatba
              }
            }
            
            const autoTitle = (!v.title || !String(v.title).trim())
              ? (isDemand(rfq) ? `Ajánlat ${rfq.number || rfq.request_number}` : (rfq.number || rfq.request_number))
              : String(v.title).trim();
            console.log('[RFQDetail] Sending update_basic with project_id:', v.project_id);
            
            const updateData: any = {
              title: autoTitle,
              description: v.description,
              internal_description: v.internal_description,
              issue_date: v.issue_date ? v.issue_date.format('YYYY-MM-DD') : undefined,
              deadline: v.deadline ? v.deadline.format('YYYY-MM-DD') : null,
              valid_until: v.valid_until ? v.valid_until.format('YYYY-MM-DD') : null,
              validity_days: v.validity_days ?? 30,
              contact_ids: v.contact_ids || [],
              project_id: v.project_id ?? null,
              currency_code: v.currency_code,
              partial_order_allowed: v.partial_order_allowed,
            };
            
            // Set company_id: null for private, or the actual ID
            if (companyId === 'private') {
              updateData.company_id = null;
            } else if (companyId) {
              updateData.company_id = companyId;
            }
            
            await salesService.updateQuoteRequestBasic(Number(id), updateData);
            message.success('Mentve');
            setLastSavedAt(dayjs());
            if (closeAfter) {
              if (window.opener) {
                window.close();
              } else {
                navigate('/sales/rfqs');
              }
              return;
            }
            load();
          } catch (err) {
            console.error('[RFQDetail] Save failed:', err);
            message.error('Mentés sikertelen');
          } finally {
            setSaving(false);
          }
        }}>
          <Row gutter={12}>
            <Col span={24} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
               <Space direction="vertical" align="end" size={2}>
                 <Space>
                   <div style={{ marginRight: 16 }}>{statusTag(rfq.status)}</div>
                   <Button
                     loading={saving && !closeAfterSaveRef.current}
                     onClick={() => {
                       if (editContext && itemSaveRef.current) {
                         itemSaveRef.current.save(true);
                       } else {
                         closeAfterSaveRef.current = false;
                         formBasic.submit();
                       }
                     }}
                   >
                     Mentés
                   </Button>
                   <Button
                     type="primary"
                     loading={saving && closeAfterSaveRef.current}
                     onClick={() => {
                       if (editContext && itemSaveRef.current) {
                         itemSaveRef.current.save(false);
                       } else {
                         closeAfterSaveRef.current = true;
                         formBasic.submit();
                       }
                     }}
                   >
                     Mentés &amp; bezárás
                   </Button>
                 </Space>
                 {lastSavedAt && (
                   <span style={{ fontSize: 11, color: '#888' }}>
                     Utoljára mentve: {lastSavedAt.format('YYYY. MM. DD. HH:mm:ss')}
                   </span>
                 )}
               </Space>
            </Col>
          </Row>
          {/* ── Alap adatok ─────────────────────────────────────────────── */}
          <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={3}>
                <Form.Item label="Ajánlatszám" name="number" style={{ marginBottom: 6 }}>
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={5}>
                <Form.Item label="Rögzítette" name="created_by_name" style={{ marginBottom: 6 }}>
                  <Input readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Keltezés" name="issue_date" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Határidő" name="deadline" style={{ marginBottom: 6 }}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Lejár" name="valid_until" style={{ marginBottom: 6 }}>
                  <DatePicker
                    style={{ width: '100%' }}
                    onChange={(val) => {
                      if (val) {
                        const issueDate = formBasic.getFieldValue('issue_date') || dayjs();
                        const diff = val.diff(dayjs(issueDate), 'day');
                        if (diff > 0) {
                          formBasic.setFieldValue('validity_days', diff);
                        }
                      }
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={2}>
                <Form.Item label="Nap" name="validity_days" style={{ marginBottom: 6 }}>
                  <InputNumber
                    min={1}
                    style={{ width: '100%' }}
                    onChange={(v) => {
                      if (v) {
                        const issueDate = formBasic.getFieldValue('issue_date') || dayjs();
                        formBasic.setFieldValue('valid_until', dayjs(issueDate).add(v, 'day'));
                      }
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={2} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <Button
                  size="small"
                  block
                  onClick={() => {
                    const newDate = dayjs().add(30, 'day');
                    formBasic.setFieldsValue({ valid_until: newDate, validity_days: 30 });
                  }}
                  title="Frissíti az érvényességet +30 nappal a maitól"
                >
                  +30 nap
                </Button>
              </Col>
            </Row>
          </div>
          {/* ── Ügyfél ──────────────────────────────────────────────────── */}
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
            <Row gutter={[8, 4]}>
              <Col xs={24} md={8}>
                <Form.Item label="Cég" style={{ marginBottom: 6 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="company_id" noStyle>
                      <Select
                        showSearch
                        filterOption={filterOptionAccents}
                        placeholder="Válassz céget"
                        style={{ width: 'calc(100% - 32px)' }}
                        onFocus={async () => {
                          const list = await crmService.getCompanies({ is_customer: true, compact: true });
                          const loaded = ((list as any).results ?? list) || [];
                          const merged = Array.isArray(loaded) ? [...loaded] : [];
                          if (rfq?.company?.id && !merged.find((c: any) => c.id === rfq.company.id)) {
                            merged.unshift({
                              id: rfq.company.id,
                              name: rfq.company.name,
                              is_customer: true,
                              is_supplier: !!rfq.company.is_supplier,
                            });
                          }
                          setCompanies(merged);
                        }}
                        onChange={async (val) => {
                          try {
                            if (val === 'private') {
                              const list = await crmService.getPrivateContacts();
                              setContacts((list as any).results ?? list);
                              formBasic.setFieldValue('contact_ids', []);
                            } else {
                              const list = await crmService.getContactsByCompany(val);
                              setContacts((list as any).results ?? list);
                              formBasic.setFieldValue('contact_ids', []);
                            }
                          } catch {}
                        }}
                      >
                        <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                        {(companies || []).map((c: any) => (
                          <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Button
                      icon={<PlusOutlined />}
                      title="Új cég"
                      onClick={() => {
                        setSelectedCountry('Magyarország');
                        companyForm.resetFields();
                        companyForm.setFieldsValue({ country: 'Magyarország', is_customer: true, is_supplier: false });
                        setIsCompanyModalVisible(true);
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
                        mode="multiple"
                        allowClear
                        showSearch
                        filterOption={filterOptionAccents}
                        optionLabelProp="label"
                        placeholder="Válassz kapcsolattartókat"
                        style={{ width: 'calc(100% - 127px)' }}
                        options={(contacts || []).map((p: any, idx: number) => {
                          const companyId = formBasic.getFieldValue('company_id');
                          const lbl = contactOptionLabel(p, !companyId);
                          return { value: String(p.id ?? idx), label: lbl };
                        })}
                        onFocus={async () => {
                          const companyId = formBasic.getFieldValue('company_id');
                          if (companyId === 'private') {
                            const list = await crmService.getPrivateContacts();
                            setContacts((list as any).results ?? list);
                          } else if (companyId) {
                            const list = await crmService.getContactsByCompany(companyId);
                            setContacts((list as any).results ?? list);
                          } else {
                            // Nincs cég választva → összes kapcsolattartó
                            const list = await crmService.getContacts();
                            setContacts(((list as any).results ?? list) || []);
                          }
                        }}
                        onChange={async (val: any) => {
                          formBasic.setFieldsValue({ contact_ids: val });
                          const companyId = formBasic.getFieldValue('company_id');
                          if (!companyId && Array.isArray(val) && val.length > 0) {
                            const lastId = val[val.length - 1];
                            const chosen = contacts.find((c: any) => String(c.id) === String(lastId));
                            const chosenCompanyId = chosen?.customer || chosen?.customer_id || chosen?.company || chosen?.company_id;
                            if (chosenCompanyId) {
                              formBasic.setFieldsValue({ company_id: chosenCompanyId });
                              const cl = await crmService.getContactsByCompany(chosenCompanyId);
                              const loaded: any[] = ((cl as any).results ?? cl) || [];
                              // Merge already selected contacts
                              const merged = [...loaded];
                              (val as any[]).forEach((selId: any) => {
                                if (!merged.find((c: any) => String(c.id) === String(selId))) {
                                  const ex = contacts.find((c: any) => String(c.id) === String(selId));
                                  if (ex) merged.push(ex);
                                }
                              });
                              setContacts(merged);
                              const chosenCompanyName = chosen?.customer_name || chosen?.company_name;
                              if (chosenCompanyName) {
                                setCompanies((prev: any[]) => {
                                  if (prev.find((c: any) => String(c.id) === String(chosenCompanyId))) return prev;
                                  return [{ id: chosenCompanyId, name: chosenCompanyName }, ...prev];
                                });
                              }
                            }
                          }
                        }}
                      />
                    </Form.Item>
                    <Button
                      icon={<PlusOutlined />}
                      title="Új kapcsolattartó"
                      onClick={() => {
                        const companyId = formBasic.getFieldValue('company_id');
                        let url = '/crm/contacts?action=create';
                        if (companyId && companyId !== 'private') {
                          url += `&company=${companyId}`;
                          const company = companies.find((c: any) => c.id === companyId);
                          if (company?.name) url += `&company_name=${encodeURIComponent(company.name)}`;
                        }
                        window.open(url, '_blank');
                      }}
                    />
                    <Button
                      onClick={async () => {
                        const companyId = formBasic.getFieldValue('company_id');
                        if (companyId === 'private') {
                          const list = await crmService.getPrivateContacts();
                          setContacts((list as any).results ?? list);
                          message.success('Kapcsolattartók frissítve');
                        } else if (companyId) {
                          const list = await crmService.getContactsByCompany(companyId);
                          setContacts((list as any).results ?? list);
                          message.success('Kapcsolattartók frissítve');
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
          </div>

        {/* ── Management ─────────────────────────────────────────────── */}
        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 10px', marginBottom: 10, marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Management</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#555' }}>
            {rfq?.owner_name ? (<span><strong>Felelős:</strong> {rfq.owner_name} </span>) : (<span><strong>Felelős:</strong> - </span>)}
            
            <div style={{ display: 'inline-block', marginLeft: 12 }}>
                <strong>Résztvevők: </strong>
                {rfq?.assignee_details && rfq.assignee_details.length > 0 ? (
                    rfq.assignee_details.map((part: any) => (
                        <Tag 
                            key={part.id} 
                            closable 
                            onClose={async (e) => {
                                e.preventDefault();
                                try {
                                    await salesService.removeAssignee(Number(id), part.id);
                                    message.success('Résztvevő eltávolítva');
                                    load();
                                } catch {
                                    message.error('Hiba törléskor');
                                }
                            }}
                        >
                            {part.name}
                        </Tag>
                    ))
                ) : (
                    <span>-</span>
                )}
            </div>

            {Array.isArray(rfq?.invitations_pending) && (rfq.invitations_pending.length > 0) ? (
              <span style={{ marginLeft: 12, color: '#888' }}>
                <strong>Meghívottak: </strong>
                {rfq.invitations_pending.map((i: any) => (
                    <Tag 
                        key={i.id} 
                        closable 
                        color="warning"
                        onClose={async (e) => {
                                e.preventDefault();
                                try {
                                    await salesService.cancelInvitation(Number(id), i.id);
                                    message.success('Meghívás visszavonva');
                                    load();
                                } catch {
                                    message.error('Hiba');
                                }
                            }}
                    >
                        {i.invitee_name}
                    </Tag>
                ))}
              </span>
            ) : null}
          </div>
          <Space>
            <Button icon={<UserAddOutlined />} onClick={async () => {
              try { await salesService.takeQuoteRequest(Number(id)); message.success('Hozzárendelve (ide vele)'); load(); }
              catch { message.error('Nem sikerült'); }
            }}>Ide vele</Button>
            {(() => {
              const assignees: number[] = (rfq?.assignees || []) as number[];
              const isMeAssigned = user?.id ? assignees.includes(user.id) : false;
              const onToggle = async () => {
                try {
                  if (isMeAssigned) {
                    await salesService.leaveQuoteRequest(Number(id));
                    message.success('Kiszálltál');
                  } else {
                    await salesService.joinQuoteRequest(Number(id));
                    message.success('Beszálltál');
                  }
                  load();
                } catch {
                  message.error('Nem sikerült');
                }
              };
              return (
                <Button onClick={onToggle}>{isMeAssigned ? 'Kiszállok' : 'Beszállok'}</Button>
              );
            })()}
            <Button icon={<UserSwitchOutlined />} onClick={() => setTakeoverConfirmOpen(true)}>Átveszem</Button>
            <Select
              showSearch
              allowClear
              placeholder="Munkatárs meghívása"
              optionFilterProp="label"
              style={{ minWidth: 240 }}
              value={inviteUserId as any}
              onChange={(val) => setInviteUserId(val || null)}
            >
              {allUsers.map((u) => (
                <Select.Option key={u.id} value={u.id} label={u.name}>{u.name}</Select.Option>
              ))}
            </Select>
            <Button disabled={!inviteUserId} onClick={async () => {
              if (!inviteUserId) return;
              try { await salesService.inviteUserToRfq(Number(id), inviteUserId); message.success('Meghívó elküldve'); setInviteUserId(null); load(); }
              catch { message.error('Nem sikerült meghívni'); }
            }}>Meghívás</Button>
          </Space>
        </div>
        </div>


        {/* ── Tételek ──────────────────────────────────────────────────── */}
        <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
          {editContext ? (
            <ItemSelectorModal
              renderInline
              saveRef={itemSaveRef}
              open={true}
              mode="edit"
              defaultType={selectorType}
              onCancel={() => setEditContext(null)}
              onAdd={async (p) => onEditSelected(p)}
              rfqId={Number(id)}
              rfqCurrency={activeCurrency}
              initialSelection={{ item_type: editContext.item.item_type, ref_id: (editContext.item.product || editContext.item.manufacturing_product || editContext.item.service) as number, name: (editContext.item.product_name || editContext.item.manufacturing_product_name || editContext.item.service_name) }}
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
          <div style={{ marginTop: 6 }}>
            <ItemsTable
              items={rfq.items || []}
              onRefresh={refreshItems}
              quoteRequestId={Number(id)}
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
        </Form>

        <AttachmentPreviewModal
          open={filePreviewOpen}
          title={filePreviewTitle}
          url={filePreviewUrl}
          onClose={() => { setFilePreviewOpen(false); setFilePreviewUrl(null); setFilePreviewTitle(''); }}
        />

      </Card>
      <Modal title="Átveszem" open={takeoverConfirmOpen} onCancel={() => setTakeoverConfirmOpen(false)} onOk={async () => {
        try { await salesService.takeoverQuoteRequest(Number(id)); message.success('Átvetted'); setTakeoverConfirmOpen(false); load(); } catch { message.error('Nem sikerült átvenni'); }
      }}>
        Biztosan átveszed? Mindenki más lekerül a feladatról és csak te maradsz.
      </Modal>
      <Modal title="Ajánlat kiküldése e-mailen" open={sendOpen} onOk={async () => {
        const v = await sendForm.validateFields();
        try {
          await salesService.sendQuoteRequestEmail(Number(id), v);
          message.success('E-mail elküldve');
          setSendOpen(false);
        } catch {
          message.error('Nem sikerült elküldeni az e-mailt');
        }
      }} onCancel={() => setSendOpen(false)} width={900}>
        <Form 
            layout="vertical" 
            form={sendForm} 
            initialValues={{ template_key: 'rfq_send', signature_key: 'default' }}
            onValuesChange={async (changedValues, allValues) => {
                // Debounce or just call it. For now direct.
                try { 
                    const p = await salesService.renderQuoteRequestEmail(Number(id), { 
                        template_key: allValues.template_key, 
                        signature_key: allValues.signature_key, 
                        context: allValues.context, 
                        ...(allValues.subject ? { subject: allValues.subject } : {}), 
                        ...(allValues.body ? { body: allValues.body } : {}) 
                    }); 
                    setPreview(p); 
                } catch {}
            }}
        >
          <Form.Item label="Címzettek" name="to" rules={[{ required: true }]}>
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>
          <Form.Item label="Másolat" name="cc">
            <Input placeholder="cc@example.com" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
                <Form.Item label="Sablon" name="template_key">
                    <Select showSearch optionFilterProp="children">
                        {emailTemplates.map(t => (
                            <Select.Option key={t.key} value={t.key}>{t.name}</Select.Option>
                        ))}
                        <Select.Option key="rfq_send" value="rfq_send">Alapértelmezett (rfq_send)</Select.Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Aláírás" name="signature_key">
                    <Select showSearch optionFilterProp="children">
                        <Select.Option value="">Nincs</Select.Option>
                        <Select.Option value="default">User alapértelmezett</Select.Option>
                        {signatureTemplates.map(t => (
                            <Select.Option key={t.key} value={t.key}>{t.name}</Select.Option>
                        ))}
                    </Select>
                </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Tárgy" name="subject">
            <Input placeholder="E-mail tárgya" />
          </Form.Item>
          <Form.Item label="Törzs" name="body">
             <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50 }} />
          </Form.Item>
          <Button onClick={async () => {
            const v = await sendForm.validateFields();
            try {
              const p = await salesService.renderQuoteRequestEmail(Number(id), { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) });
              setPreview(p);
            } catch {
              message.error('Előnézet nem elérhető');
            }
          }}>Előnézet Frissítése</Button>
          {rfq?.public_order_url && (
            <div style={{ padding: 8, background: '#fafafa', border: '1px solid #eee', borderRadius: 4, marginTop: 16 }}>
              Megrendelő link: <a href={rfq.public_order_url} target="_blank" rel="noreferrer">{rfq.public_order_url}</a>
            </div>
          )}
        </Form>
        {preview && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <div><strong>Tárgy:</strong> {preview.subject}</div>
            <div style={{ marginTop: 8 }}>
              {preview.is_html ? (
                <div dangerouslySetInnerHTML={{ __html: preview.body }} />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap' }}>{preview.body}</pre>
              )}
            </div>
          </div>
        )}
      </Modal>
 
      <ItemSelectorModal
        open={selectorOpen && !editContext}
        defaultType={selectorType}
        onCancel={() => { setSelectorOpen(false); }}
        onAdd={onAddSelected}
        mode="add"
        rfqId={Number(id)}
        rfqCurrency={activeCurrency}
      />

      <Modal title="Napló" open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null}>
        <Table
          size="small"
          pagination={false}
          rowKey={(r) => `${r.id}`}
          columns={[
            { title: 'Dátum', dataIndex: 'created_at', render: (d: string) => new Date(d).toLocaleString('hu-HU') },
            { title: 'Felhasználó', dataIndex: 'user_name' },
            { title: 'Művelet', dataIndex: 'action' },
          ] as any}
          dataSource={logs}
        />
      </Modal>

      <Modal
        title="Új cég létrehozása"
        open={isCompanyModalVisible}
        onCancel={() => {
          if (companyForm.isFieldsTouched()) {
            Modal.confirm({
              title: 'Biztosan bezárja?',
              content: 'A nem mentett változtatások elvesznek.',
              okText: 'Igen',
              cancelText: 'Nem',
              onOk: () => {
                setIsCompanyModalVisible(false);
                companyForm.resetFields();
              }
            });
          } else {
            setIsCompanyModalVisible(false);
            companyForm.resetFields();
          }
        }}
        footer={null}
        width={800}
      >
        <Form
          form={companyForm}
          layout="vertical"
          onFinish={handleCompanySubmit}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="name"
                label="Cégnév"
                rules={[{ required: true, message: 'Kérjük, adja meg a cégnév!' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Szerepkörök">
                <Space direction="vertical">
                  <Form.Item
                    name="is_customer"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>Ügyfél</Checkbox>
                  </Form.Item>
                  <Form.Item
                    name="is_supplier"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>Beszállító</Checkbox>
                  </Form.Item>
                </Space>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="tax_number"
                label="Adószám"
                help="Magyar adószám: 12345678-1-41"
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="12345678-1-41" />
                  <Button
                    onClick={async () => {
                      try {
                        const raw = companyForm.getFieldValue('tax_number') || '';
                        const digits = String(raw).replace(/[^0-9]/g, '');
                        if (digits.length < 8) {
                          message.warning('Adja meg az adószám első 8 számjegyét!');
                          return;
                        }
                        const before = companyForm.getFieldsValue();
                        if (navDebug) {
                          console.log('[RFQDetail] NAV lookup start', { raw });
                        }
                        const data = await crmService.lookupCompanyByNav(raw, { debug: navDebug });
                        if (navDebug) {
                          console.log('[RFQDetail] NAV lookup result', data);
                        }
                        const debugInfo = (data as any)?.debug;
                        const downHost = debugInfo?.finance?.host;
                        if (downHost) {
                          message.error(`Nem elérhető az API host: ${downHost}`);
                        }
                        // NAV adószám azonnali frissítése, ha eltér és teljesebb
                        if ((data as any)?.tax_number) {
                          const curTax = String((before as any).tax_number || '').trim();
                          const newTax = String((data as any).tax_number || '').trim();
                          if (newTax && newTax !== curTax) {
                            companyForm.setFieldsValue({ tax_number: newTax });
                          }
                        }
                        if (data && data.found === false) {
                          const base = debugInfo?.finance?.host || debugInfo?.client?.base || debugInfo?.fallback?.url;
                          if (base) {
                            message.error(`Nem elérhető az API host: ${base}`);
                          } else {
                            message.warning('Nem található cég a megadott adószám alapján');
                          }
                          setNavPreviewData(debugInfo ? data : null);
                          setNavPreviewSel({});
                          if (debugInfo) setNavPreviewOpen(true);
                          return;
                        }
                        // Default selection: select fields that have a value and current form is empty
                        const fieldMap: { key: string; target: string }[] = [
                          { key: 'name', target: 'name' },
                          { key: 'tax_number', target: 'tax_number' },
                          { key: 'group_tax_number', target: 'group_tax_number' },
                          { key: 'eu_tax_number', target: 'eu_tax_number' },
                          { key: 'country', target: 'country' },
                          { key: 'postal_code', target: 'postal_code' },
                          { key: 'city', target: 'city' },
                          { key: 'street_name', target: 'street_name' },
                          { key: 'street_type', target: 'street_type' },
                          { key: 'house_number', target: 'house_number' },
                          { key: 'full_address', target: 'address' },
                        ];
                        const sel: Record<string, boolean> = {};
                        fieldMap.forEach(({ key, target }) => {
                          const v = (data as any)[key];
                          const cur = (before as any)[target];
                          sel[key] = Boolean(v) && (!cur || String(cur).trim() === '');
                        });
                        // Preferáld a NAV adószámot: ha a NAV érték formázott és eltér a jelenlegitől, előválaszd
                        if ((data as any).tax_number) {
                          const curTax = String((before as any).tax_number || '').trim();
                          const newTax = String((data as any).tax_number || '').trim();
                          const fullPattern = /^\d{8}-\d-\d{2}$/;
                          if (newTax && newTax !== curTax) {
                            sel['tax_number'] = true;
                          } else if (fullPattern.test(newTax) && !fullPattern.test(curTax)) {
                            sel['tax_number'] = true;
                          }
                        }
                        setNavPreviewData(data);
                        setNavPreviewSel(sel);
                        setNavPreviewOpen(true);
                      } catch (e: any) {
                        const status = e?.response?.status;
                        if (status === 404) {
                          message.warning('Nem található cég a megadott adószám alapján');
                        } else {
                          const msg = e?.response?.data?.error || 'NAV lekérdezés sikertelen';
                          message.error(msg);
                        }
                      }
                    }}
                  >
                    NAV-tól
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="group_tax_number"
                label="Csoport adószám"
                help="Csoport adószám: 12345678-1-12"
              >
                <Input placeholder="12345678-1-12" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="eu_tax_number"
                label="EU adószám"
                help="EU adószám: HU11956541"
              >
                <Input placeholder="HU11956541" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="country"
                label="Ország"
                rules={[{ required: true, message: 'Kérjük, válassza ki az országot!' }]}
              >
                <Select
                  showSearch
                  placeholder="Válasszon országot"
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={handleCountryChange}
                >
                  {getCountries().map(country => (
                    <Select.Option key={country.value} value={country.value}>
                      {country.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {selectedCountry === 'Magyarország' ? (
            <>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="postal_code"
                    label="Irányítószám"
                    rules={[{ required: true, message: 'Kérjük, adja meg az irányítószámot!' }]}
                  >
                    <Input
                      placeholder="1051"
                      onChange={handlePostalCodeChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item
                    name="city"
                    label="Város"
                    rules={[{ required: true, message: 'Kérjük, adja meg a várost!' }]}
                  >
                    <Input placeholder="Budapest" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Közterület" style={{ marginBottom: 0 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item
                    name="street_name"
                    noStyle
                    rules={[{ required: true, message: 'Közterület neve kötelező!' }]}
                  >
                    <Input
                      style={{ width: '70%' }}
                      placeholder="Közterület neve"
                    />
                  </Form.Item>
                  <Form.Item
                    name="street_type"
                    noStyle
                    rules={[{ required: true, message: 'Kérjük, válassza ki a közterület típusát!' }]}
                  >
                    <Select
                      style={{ width: '30%' }}
                      placeholder="Típus"
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      {postalCodeService.getStreetTypes().map(type => (
                        <Select.Option key={type.value} value={type.value}>
                          {type.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Space.Compact>
              </Form.Item>

              <Form.Item
                name="house_number"
                label="Házszám"
              >
                <Input placeholder="1." />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="address"
              label="Cím"
              rules={[{ required: true, message: 'Kérjük, adja meg a címet!' }]}
            >
              <TextArea
                rows={3}
                placeholder="Teljes cím (utca, házszám, város, irányítószám, ország)"
              />
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Mentés
              </Button>
              <Button onClick={() => {
                setIsCompanyModalVisible(false);
                companyForm.resetFields();
              }}>
                Mégse
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="NAV adatok előnézete"
        open={navPreviewOpen}
        onCancel={() => setNavPreviewOpen(false)}
        onOk={() => {
          if (navPreviewData) {
            const update: any = {};
            Object.keys(navPreviewSel).forEach(k => {
              if (navPreviewSel[k] && navPreviewData[k]) {
                const target = k === 'full_address' ? 'address' : k;
                update[target] = navPreviewData[k];
              }
            });
            companyForm.setFieldsValue(update);
            if (update.country) setSelectedCountry(update.country);
          }
          setNavPreviewOpen(false);
        }}
        okText="Kijelöltek átvétele"
        cancelText="Mégse"
        width={720}
      >
        {navPreviewData?.debug && (
          <Alert type="info" showIcon message="Debug" description={<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(navPreviewData.debug, null, 2)}</pre>} style={{ marginBottom: 16 }} />
        )}
        {navPreviewData ? (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Checkbox
                  checked={!!navPreviewSel.name}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, name: e.target.checked })}
                >
                  Cégnév
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.name || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.tax_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, tax_number: e.target.checked })}
                >
                  Adószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.tax_number || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.group_tax_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, group_tax_number: e.target.checked })}
                >
                  Csoport adószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.group_tax_number || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.eu_tax_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, eu_tax_number: e.target.checked })}
                >
                  EU adószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.eu_tax_number || '-'}</div>
              </Col>
              <Col span={12}>
                <Checkbox
                  checked={!!navPreviewSel.country}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, country: e.target.checked })}
                >
                  Ország
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.country || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.postal_code}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, postal_code: e.target.checked })}
                >
                  Irányítószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.postal_code || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.city}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, city: e.target.checked })}
                >
                  Város
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.city || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.street_name}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, street_name: e.target.checked })}
                >
                  Közterület neve
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.street_name || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.street_type}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, street_type: e.target.checked })}
                >
                  Közterület típusa
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.street_type || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.house_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, house_number: e.target.checked })}
                >
                  Házszám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.house_number || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.full_address}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, full_address: e.target.checked })}
                >
                  Teljes cím
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.full_address || '-'}</div>
              </Col>
            </Row>
          </div>
        ) : (
          <Alert type="warning" message="Nincs előnézeti adat" />
        )}
      </Modal>

      <ChatDrawer 
        open={chatOpen} 
        onClose={() => setChatOpen(false)} 
        rfqId={Number(id)} 
        title={`Chat - ${rfq.number || rfq.request_number}`}
      />

      <ActivityLogModal
        visible={activityLogOpen}
        onClose={() => setActivityLogOpen(false)}
        objectType="quoterequest"
        objectId={Number(id)}
        objectTitle={rfq.number || rfq.request_number || ''}
      />
    </div>
  );
};

export default RFQDetail;
