import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Tag, Table, Row, Col, Form, Select, Input, InputNumber, Button, message, Modal, Spin, Space, List, DatePicker, Checkbox, Alert, Popover, Divider, Statistic, AutoComplete, Tooltip, Steps, Collapse, Switch } from 'antd';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { salesService } from '../../services/salesService';
import api from '../../services/api';
import { manufacturingService } from '../../services/manufacturingService';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import { ItemSelectorModal, SelectedItemPayload } from '../../components/Sales/ItemSelectorModal';
import { ItemsTable } from '../../components/Sales/ItemsTable';
import { Upload, Popconfirm } from 'antd';
import { crmService } from '../../services/crmService';
import dayjs from 'dayjs';
import { LeftOutlined, DeleteOutlined, UserAddOutlined, UserSwitchOutlined, LogoutOutlined, TeamOutlined, PlusOutlined, MessageOutlined, ClockCircleOutlined, FileDoneOutlined, CheckCircleOutlined, RocketOutlined, CheckOutlined, CarOutlined, SmileOutlined, FileTextOutlined, HistoryOutlined, DownOutlined, EditOutlined, PaperClipOutlined, ToolOutlined } from '@ant-design/icons';
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
  const rfqNumericIdRef = useRef<number | null>(null); // resolved after first load
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rfq, setRfq] = useState<any>();
  // removed unused local product/service lists
  const [projects, setProjects] = useState<any[]>([]);
  const [formBasic] = Form.useForm();
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  // Work hours state
  const [workHoursOpen, setWorkHoursOpen] = useState(false);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [workHoursLoading, setWorkHoursLoading] = useState(false);
  const [workHoursItemId, setWorkHoursItemId] = useState<number | null>(null);
  const [workHoursItemName, setWorkHoursItemName] = useState<string>('');
  const [checkedWorkLogKeys, setCheckedWorkLogKeys] = useState<React.Key[]>([]);
  const [addWorkLogOpen, setAddWorkLogOpen] = useState(false);
  const [addWorkLogSaving, setAddWorkLogSaving] = useState(false);
  const [addWorkLogForm] = Form.useForm();
  const [frequentWorkflows, setFrequentWorkflows] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('product');
  const [editContext, setEditContext] = useState<null | { item: any }>(null);
  const itemSaveRef = useRef<{ save: (keepOpen: boolean) => Promise<void> } | null>(null);
  const [manufacturingFiles, setManufacturingFiles] = useState<any[]>([]);
  const [rfqPendingRemark, setRfqPendingRemark] = useState<string>('');
  const [manufacturingRenameId, setManufacturingRenameId] = useState<number | null>(null);
  const [manufacturingRenameVal, setManufacturingRenameVal] = useState('');
  const [manufacturingExistingRemarks, setManufacturingExistingRemarks] = useState<Record<number, string>>({});
  const [manufacturingUploading, setManufacturingUploading] = useState(0);
  const [manufacturingPanelHovered, setManufacturingPanelHovered] = useState(false);
  // File küldés más RFQ-ra
  const [fileSendOpen, setFileSendOpen] = useState(false);
  const [fileSendTarget, setFileSendTarget] = useState<any | null>(null);
  const [fileSendSearch, setFileSendSearch] = useState('');
  const [fileSendResults, setFileSendResults] = useState<any[]>([]);   // összes betöltött RFQ
  const [fileSendPickerOpen, setFileSendPickerOpen] = useState(false);
  const [fileSendLoading, setFileSendLoading] = useState(false);
  const [fileSendSending, setFileSendSending] = useState(false);
  const [fileSendAllFiles, setFileSendAllFiles] = useState<any[]>([]); // include_all=1 fájlok a modalhoz
  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
  // Client-side szűrés a picker táblában
  const fileSendFiltered = useMemo(() => {
    const q = (fileSendSearch || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!q) return fileSendResults;
    return fileSendResults.filter(r => {
      const cn = (r.company_name || r.company?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const rn = (r.request_number || '').toLowerCase();
      const itm = (r.primary_item_name || r.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const desc = (r.primary_item_description || '').replace(/<[^>]*>/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return cn.includes(q) || rn.includes(q) || itm.includes(q) || desc.includes(q);
    });
  }, [fileSendSearch, fileSendResults]);
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
  const [inviteUserIds, setInviteUserIds] = useState<number[]>([]);
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
  const manufacturingRemarkRef = useRef('');

  const editItemModalInitialSelection = useMemo(() => {
    if (!editContext?.item) return null;
    return {
      item_type: editContext.item.item_type,
      ref_id: (editContext.item.product || editContext.item.manufacturing_product || editContext.item.service) as number,
      name: editContext.item.product_name || editContext.item.manufacturing_product_name || editContext.item.service_name || editContext.item.item_name,
      code: editContext.item.product_code || editContext.item.manufacturing_product_code || editContext.item.service_code || undefined,
      manufacturing_product_printshop_params: editContext.item.manufacturing_product_printshop_params ?? null,
    };
  }, [editContext?.item]);

  const editItemModalInitialValues = useMemo(() => {
    if (!editContext?.item) return undefined;
    return {
      quantity: Number(editContext.item.quantity),
      unit: editContext.item.unit,
      net_unit_price: Number(editContext.item.net_unit_price),
      vat_rate: Number(editContext.item.vat_rate),
      description: editContext.item.description,
      internal_description: editContext.item.internal_description || '',
      discount_percent: Number(editContext.item.discount_percent || 0),
      discount_amount: Number(editContext.item.discount_amount || 0),
      is_rate_locked: !!editContext.item.is_rate_locked,
      locked_exchange_rate: editContext.item.locked_exchange_rate != null ? Number(editContext.item.locked_exchange_rate) : null,
      quote_number: editContext.item.quote_number || null,
      cost_items_data: editContext.item.cost_items_data || [],
    };
  }, [editContext?.item]);

  useEffect(() => {
    manufacturingRemarkRef.current = rfqPendingRemark;
  }, [rfqPendingRemark]);

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

  const getContactOptionValue = (p: any, fallback?: number) => String(p?.local_id ?? p?.id ?? fallback ?? '');

  /** Refresh only the items list without showing the full-page spinner.
   *  Used after item add/edit/delete/reorder so the cost table updates in place. */
  const refreshItems = useCallback(async () => {
    if (!id) return;
    const nid = rfqNumericIdRef.current || id;
    try {
      const rfqRes = await salesService.getQuoteRequest(nid as any);
      setRfq((prev: any) => prev ? { ...prev, items: rfqRes.items } : rfqRes);
    } catch {}
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Always resolve RFQ first; invited users may not have permission for
      // auxiliary endpoints (projects/currencies), but must still see the RFQ.
      const rfqRes = await salesService.getQuoteRequest(id as any);
      setRfq(rfqRes);
      if (rfqRes?.id) rfqNumericIdRef.current = rfqRes.id;

      // Non-critical lookups: keep page functional even if these fail.
      let projRes: any[] = [];
      let currRes: any[] = [];
      try {
        const [projMaybe, currMaybe] = await Promise.all([
          manufacturingService.getProjects(),
          manufacturingService.getCurrencies(),
        ]);
        projRes = Array.isArray(projMaybe) ? projMaybe : [];
        currRes = Array.isArray(currMaybe) ? currMaybe : [];
      } catch {
        projRes = [];
        currRes = [];
      }
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
          is_manufacturable: !!rfqRes.is_manufacturable,
        });
      } catch {}
      try {
        // Minden csatolmányt mutatunk (gyártási + ügyfél/publikus + chat feltöltések)
        const atts = await salesService.getQuoteRequestAttachments((rfqRes?.id || id) as any);
        setManufacturingFiles(Array.isArray(atts) ? atts : (atts?.results || []));
      } catch {}
      // Load work logs and activity logs inline
      try {
        const wlData = await salesService.getWorkLogsByRfq((rfqRes?.id || id) as any);
        setWorkLogs(Array.isArray(wlData) ? wlData : (wlData?.results || []));
      } catch {}
      try {
        const logData = await salesService.getQuoteRequestLogs(id as any);
        setLogs(logData.results ?? logData);
      } catch {}
      setProjects(projRes);
    } catch (e) {
      setRfq(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshManufacturingFiles = useCallback(async () => {
    const targetId = rfqNumericIdRef.current || id;
    if (!targetId) return;
    try {
      // Minden csatolmányt mutatunk (gyártási + ügyfél/publikus + chat feltöltések)
      const atts = await salesService.getQuoteRequestAttachments(targetId as any);
      setManufacturingFiles(Array.isArray(atts) ? atts : (atts?.results || []));
    } catch {}
  }, [id]);

  const manufacturingNameWithExt = useCallback((att: any): string => {
    const name = att.original_filename || '';
    if (!name) return att.file?.split('/').pop() || '';
    if (name.includes('.')) return name;
    const filePath = att.file_url || att.file || '';
    const base = filePath.split('/').pop()?.split('?')[0] || '';
    const dotIdx = base.lastIndexOf('.');
    return dotIdx !== -1 ? name + base.slice(dotIdx) : name;
  }, []);

  const uploadManufacturingFile = useCallback(async (file: File) => {
    let targetId = (rfq?.id || rfqNumericIdRef.current || id) as any;
    
    // Ha nincs ID, akkor először létrehozunk egy minimális RFQ-t
    if (!targetId) {
      try {
        const values = formBasic.getFieldsValue();
        const autoTitle = (values.title && String(values.title).trim())
          ? String(values.title).trim()
          : 'Új ajánlatkérés';
        
        const created = await salesService.createQuoteRequest({
          title: autoTitle,
          description: autoTitle || 'Új ajánlatkérés',
          issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : undefined,
          deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
          validity_days: values.validity_days ?? 30,
          valid_until: values.valid_until ? values.valid_until.format('YYYY-MM-DD') : undefined,
        });
        
        targetId = created.id;
        rfqNumericIdRef.current = created.id;
        setRfq(created);
        message.success('Ajánlatkérés mentve, csatolmány feltöltés...', 1);
      } catch (error) {
        message.error('Az ajánlatkérést nem sikerült menteni');
        return;
      }
    }
    
    setManufacturingUploading((prev) => prev + 1);
    try {
      const newAtt = await salesService.uploadQuoteRequestAttachment(targetId, file, manufacturingRemarkRef.current || undefined);
      // Optimista frissítés: a feltöltés válasza már tartalmazza a file_url-t,
      // azonnal hozzáadjuk az állapothoz → a tooltip preview rögtön elérhető, nem kell "Mentés".
      if (newAtt && newAtt.id) {
        setManufacturingFiles(prev => [{
          ...newAtt,
          source: 'rfq',
          row_key: `rfq-${newAtt.id}`,
        }, ...prev]);
      }
      message.success(`Feltöltve: ${file.name}`);
      setRfqPendingRemark('');
      // Szinkronizáció a szerverrel (rendezi a sorrendet, egyéb frissítések)
      await refreshManufacturingFiles();
    } catch {
      message.error(`Nem sikerült feltölteni: ${file.name}`);
      throw new Error('Feltöltési hiba');
    } finally {
      setManufacturingUploading((prev) => Math.max(0, prev - 1));
    }
  }, [id, rfq?.id, refreshManufacturingFiles, formBasic, salesService]);

  useClipboardImagePaste((file: File) => { void uploadManufacturingFile(file); }, manufacturingPanelHovered);

  // Auto-search amikor a File küldés picker megnyílik — betöltjük az összes RFQ-t (client-side szűrés)
  useEffect(() => {
    if (!fileSendPickerOpen || fileSendResults.length > 0) return;
    (async () => {
      setFileSendLoading(true);
      try {
        const res = await salesService.getQuoteRequestsPage(1, 200);
        setFileSendResults(res.results ?? []);
      } catch {} finally { setFileSendLoading(false); }
    })();
  }, [fileSendPickerOpen]); // eslint-disable-line

  const openManufacturingAttachmentPreview = useCallback((att: any) => {
    const url = att.file_url || att.file || null;
    if (!url) return;
    const title = att.original_filename || att.file?.split('/').pop() || `#${att.id}`;
    if (isPdf(url)) {
      openPdfPreview(url);
      return;
    }
    setFilePreviewTitle(title);
    setFilePreviewUrl(url);
    setFilePreviewOpen(true);
  }, []);

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

  // Auto-open item editor when navigated with ?editItemId= OR when RFQ has exactly 1 item
  useEffect(() => {
    if (!rfq || editItemIdHandledRef.current) return;
    const editItemId = searchParams.get('editItemId');
    const items = rfq.items || [];
    // Prefer explicit editItemId, fall back to auto-open if single item
    const targetItem = editItemId
      ? items.find((it: any) => it.id === Number(editItemId))
      : items.length === 1 ? items[0] : null;
    if (!targetItem) return;
    editItemIdHandledRef.current = true;
    setEditContext({ item: targetItem });
    setSelectorType(targetItem.item_type || 'manufacturing');
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

  const statusTag = (status: string, customLabel?: string) => {
    const color: Record<string, any> = {
      new: 'blue', in_progress: 'orange',
      sent: 'gold',
      quoted: isDemand(rfq) ? 'default' : 'cyan',
      accepted: 'green', rejected: 'red', expired: 'default',
      ordered: 'purple', confirmed: 'geekblue', in_production: 'volcano',
      in_design: 'magenta', pending_customer_approval: 'gold', pending_internal_approval: 'volcano',
      ready: 'lime', in_delivery: 'gold', delivered: 'cyan', invoiced: 'green',
    };
    const text: Record<string, string> = {
      new: 'Új', in_progress: 'Folyamatban',
      sent: 'Kiküldve',
      quoted: isDemand(rfq) ? 'Zárt' : 'Kiküldve',
      accepted: 'Elfogadva', rejected: 'Elutasítva', expired: 'Lejárt',
      ordered: 'Megrendelve', confirmed: 'Megerősítve', in_production: 'Gyártásban',
      in_design: 'Tervezés alatt', pending_customer_approval: 'Ügyfél jóváhagyásra vár', pending_internal_approval: 'Belső jóváhagyásra vár',
      ready: 'Kész', in_delivery: 'Szállítás alatt', delivered: 'Kiszállítva', invoiced: 'Kiszámlázva',
    };
    return <Tag color={color[status] || 'default'}>{customLabel || text[status] || status}</Tag>;
  };

  // removed unused itemColumns and old add-item helpers (using ItemSelectorModal instead)

  const onAddSelected = async (payload: SelectedItemPayload) => {
    if (!id) return;
    const qid = id as any;
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
      if ((payload as any)._directCreated) {
        // Új metódus: a QRI már létrehozva, csak frissítünk
        createdItem = (payload as any)._directCreated;
      } else {
        createdItem = await salesService.addRfqManufacturingItem(qid, payload.ref_id, payload.name || '', payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount, (payload as any).formulas || {});
      }
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
    let companyId = values.company_id ?? rfq.company?.id;
    const selectedContactIds = Array.isArray(values.contact_ids) ? values.contact_ids.map(String) : [];
    if (!companyId && selectedContactIds.length > 0) {
      const selectedContacts = (contacts || []).filter((contact: any) => (
        selectedContactIds.includes(getContactOptionValue(contact)) ||
        selectedContactIds.includes(String(contact?.id ?? ''))
      ));
      if (selectedContacts.length > 0) {
        const inferredCompanyId = selectedContacts
          .map((contact: any) => contact?.customer || contact?.customer_id || contact?.company || contact?.company_id)
          .find(Boolean);
        companyId = inferredCompanyId || 'private';
        formBasic.setFieldValue('company_id', companyId);
      }
    }
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

    await salesService.updateQuoteRequestBasic(id as any, updateData);
    setLastSavedAt(dayjs());
  };

  const onEditSelected = async (payload: SelectedItemPayload) => {
    if (!editContext?.item) return;
    try {
      const patch: any = {
        item_name: payload.name,
        quantity: payload.quantity,
        unit: payload.unit,
        net_unit_price: payload.net_unit_price != null ? parseFloat(Number(payload.net_unit_price).toFixed(2)) : payload.net_unit_price,
        vat_rate: payload.vat_rate,
        description: payload.description,
        internal_description: (payload as any).internal_description ?? undefined,
        discount_percent: (payload as any).discount_percent,
        discount_amount: (payload as any).discount_amount,
        formulas: (payload as any).formulas || {},
        is_rate_locked: !!(payload as any).is_rate_locked,
        locked_exchange_rate: (payload as any).is_rate_locked ? ((payload as any).locked_exchange_rate ?? null) : null,
        cost_items_data: (payload as any).cost_items_data ?? undefined,
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

      // If item sell currency was set, always update the RFQ currency to match.
      const newCurrCode: string | undefined = (payload as any)._sellCurrencyCode;
      if (newCurrCode) {
        formBasic.setFieldsValue({ currency_code: newCurrCode });
        await salesService.updateQuoteRequestBasic(id as any, { currency_code: newCurrCode });
      }

      if (isDirectItemEditMode) {
        try {
          await saveBasicFromCurrentForm();
        } catch (basicErr) {
          // Basic form save failed (e.g. missing company) but item + currency were already saved — ignore
          console.warn('[RFQDetail] saveBasicFromCurrentForm failed after item save:', basicErr);
        }
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
      // Always keep the editor open — do not close on save
      setSelectorOpen(false);
      if (isDirectItemEditMode) {
        notifyRfqListUpdated();
      }
      if (isDirectItemEditMode && !(payload as any).keepOpen) {
        if (window.opener) {
          window.opener.postMessage({ type: 'pixi_rfq_item_updated' }, window.location.origin);
          window.close();
        }
        navigate('/sales/rfqs');
        return;
      }
      if (isDirectItemEditMode) {
        // Use refreshItems (not full load) when keepOpen=true to avoid re-initializing
        // the inline editor with stale editContext.item values
        if ((payload as any).keepOpen) {
          await refreshItems();
        } else {
          await load();
        }
      } else {
        refreshItems();
      }
    } catch (e: any) {
      const errData = e?.response?.data;
      if (errData) console.error('[onEditSelected] API error:', JSON.stringify(errData));
      message.error(e instanceof Error && e.message ? e.message : 'Nem sikerült frissíteni a tételt');
    }
  };

  // assignProject removed; project is now part of the main edit form

  const openLogs = async () => {
    if (!id) return;
    const data = await salesService.getQuoteRequestLogs(id as any);
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

  // Keep status display aligned with the RFQ list: prefer effective status from backend.
  const displayStatus = rfq?.effective_status || rfq?.status || 'new';
  const displayStatusLabel = rfq?.effective_status_label || undefined;

  // Treat legacy/synthetic "sent" as "quoted" for workflow steps and demand open/close actions.
  const normalizeWorkflowStatus = (st?: string) => (st === 'sent' ? 'quoted' : (st || 'new'));
  const workflowStatus = normalizeWorkflowStatus(displayStatus);

  const isDemandOpen = isDemand(rfq) && (workflowStatus === 'new' || workflowStatus === 'in_progress');
  const isDemandClosed = isDemand(rfq) && workflowStatus === 'quoted';

  // Lifecycle step index
  const statusStepMap: Record<string, number> = {
    new: 0, in_progress: 0, quoted: 1, sent: 1, accepted: 2, ordered: 3, confirmed: 4,
    in_design: 5, pending_customer_approval: 6, pending_internal_approval: 7,
    in_production: 8, ready: 9, in_delivery: 10, delivered: 11, invoiced: 12,
  };
  const currentStep = statusStepMap[displayStatus] ?? 0;

  // Clickable steps: map step index → target status
  const stepIndexToStatus: Record<number, string> = {
    0: 'new', 1: 'quoted', 2: 'accepted', 3: 'ordered', 4: 'confirmed',
    5: 'in_design', 6: 'pending_customer_approval', 7: 'pending_internal_approval',
    8: 'in_production', 9: 'ready', 10: 'in_delivery', 11: 'delivered', 12: 'invoiced',
  };
  const stepStatusLabel: Record<string, string> = {
    new: 'Ajánlat', quoted: 'Kiküldve', accepted: 'Elfogadva', ordered: 'Megrendelve',
    confirmed: 'Megerősítve', in_design: 'Tervezés alatt', pending_customer_approval: 'Ügyfél jóváhagyásra vár', pending_internal_approval: 'Belső jóváhagyásra vár',
    in_production: 'Gyártásban', ready: 'Kész',
    in_delivery: 'Szállítás alatt', delivered: 'Kiszállítva', invoiced: 'Kiszámlázva',
  };
  const allowedRfqStatusUpdates = new Set([
    'new',
    'confirmed',
    'in_production',
    'ready',
    'in_delivery',
    'delivered',
    'invoiced',
    'in_progress',
    'quoted',
    'accepted',
    'rejected',
    'expired',
    'archived',
    'ordered',
    'in_design',
    'pending_customer_approval',
    'pending_internal_approval',
  ]);
  const handleStepClick = (stepIdx: number) => {
    const targetStatus = stepIndexToStatus[stepIdx];
    if (!targetStatus || normalizeWorkflowStatus(targetStatus) === workflowStatus) return;
    const normalizedTarget = normalizeWorkflowStatus(targetStatus);
    if (!allowedRfqStatusUpdates.has(normalizedTarget)) return;
    const label = stepStatusLabel[targetStatus] || targetStatus;
    Modal.confirm({
      title: 'Státusz módosítás',
      content: `Biztosan módosítod a státuszt: "${label}"?`,
      okText: 'Igen',
      cancelText: 'Mégse',
      onOk: async () => {
        try {
          await salesService.setQuoteRequestStatus(id as any, normalizedTarget);
          message.success(`Státusz: ${label}`);
          load();
        } catch { message.error('Nem sikerült a státuszváltás'); }
      },
    });
  };

  const manufacturableMarkedBy = (rfq?.manufacturable_marked_by_name || '').trim();
  const manufacturableMarkedAtLabel = rfq?.manufacturable_marked_at
    ? new Date(rfq.manufacturable_marked_at).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
    : '';
  const manufacturableMarkedInfo = [manufacturableMarkedBy, manufacturableMarkedAtLabel].filter(Boolean).join(' • ');

  const renderLogAction = (action: string, row: any) => {
    const changes: Record<string, { old: any; new: any }> = row?.meta?.changes || {};
    const entries = Object.entries(changes);
    if (entries.length === 0) return action;

    const summary = entries
      .slice(0, 3)
      .map(([field, value]) => `${field}: ${String(value?.old) || '–'} → ${String(value?.new) || '–'}`)
      .join('; ');
    const tooltipContent = (
      <div>
        {entries.map(([field, value]) => (
          <div key={field}>
            <b>{field}:</b> {String(value?.old) || '–'} → {String(value?.new) || '–'}
          </div>
        ))}
      </div>
    );

    return (
      <Tooltip title={tooltipContent}>
        <span style={{ borderBottom: '1px dashed #aaa', cursor: 'help' }}>
          {action}: {summary}
        </span>
      </Tooltip>
    );
  };

  return (
    <div>
      <Card
        bodyStyle={{ padding: '12px 16px' }}
        title={
          <Space size={8}>
            <Button size="small" icon={<LeftOutlined />} onClick={() => navigate('/sales/rfqs')}>Vissza</Button>
            <span style={{ fontWeight: 600 }}>Gyártható: {rfq?.is_manufacturable ? 'IGEN' : 'NEM'}</span>
            <Switch
              size="small"
              checked={!!rfq?.is_manufacturable}
              checkedChildren="IGEN"
              unCheckedChildren="NEM"
              onChange={async (checked) => {
                // Optimistic update — frissítés azonnal, mielőtt az API hívás befejezne
                setRfq((prev: any) => prev ? { ...prev, is_manufacturable: checked } : prev);
                formBasic.setFieldValue('is_manufacturable', checked);
                try {
                  const updated = await salesService.updateQuoteRequestBasic((rfq?.id || id) as any, { is_manufacturable: checked });
                  // Szerver válaszból frissítjük a marked_by / marked_at mezőket
                  setRfq((prev: any) => prev ? { ...prev, ...(updated || {}) } : (updated || prev));
                } catch {
                  // Rollback
                  setRfq((prev: any) => prev ? { ...prev, is_manufacturable: !checked } : prev);
                  formBasic.setFieldValue('is_manufacturable', !checked);
                  message.error('Nem sikerült menteni a gyártható állapotot');
                }
              }}
            />
            <Tag color={rfq?.is_manufacturable ? 'green' : 'red'}>{rfq?.is_manufacturable ? 'IGEN' : 'NEM'}</Tag>
            {rfq?.is_manufacturable && manufacturableMarkedInfo && <span style={{ color: '#666', fontSize: 12 }}>Beállította: {manufacturableMarkedInfo}</span>}
            <span style={{ color: '#666' }}>{rfq.number || rfq.request_number}</span>
            {statusTag(displayStatus, displayStatusLabel)}
          </Space>
        }
        extra={
          <Space size={6} wrap>
            <Button size="small" icon={<MessageOutlined />} onClick={() => setChatOpen(true)}>Chat</Button>
            <Button size="small" icon={<HistoryOutlined />} onClick={() => setActivityLogOpen(true)}>Napló</Button>
            <Tooltip title="Munkaórák (összes)">
              <Button size="small" icon={<ClockCircleOutlined />} onClick={async () => {
                setWorkHoursItemId(null); setWorkHoursItemName(''); setCheckedWorkLogKeys([]); setWorkLogs([]);
                setWorkHoursOpen(true); setWorkHoursLoading(true);
                try {
                  const data = await salesService.getWorkLogsByRfq((rfq?.id || id) as any);
                  const results = Array.isArray(data) ? data : (data?.results || []);
                  setWorkLogs(results);
                  const wfs = await salesService.getFrequentWorkflows();
                  setFrequentWorkflows(Array.isArray(wfs) ? wfs : []);
                } catch { message.error('Nem sikerült betölteni a munkaórákat'); }
                finally { setWorkHoursLoading(false); }
              }}>
                {(() => { const s = workLogs.reduce((a: number, l: any) => a + (l.duration_seconds || 0), 0); const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return s > 0 ? `Munkanapló ${h}:${String(m).padStart(2,'0')}` : 'Munkanapló'; })()}
              </Button>
            </Tooltip>
            {isDemandOpen && <Button size="small" onClick={async () => { await salesService.setQuoteRequestStatus(id as any, 'quoted'); message.success('Lezárva'); load(); }}>Lezár</Button>}
            {isDemandClosed && <Button size="small" onClick={async () => { await salesService.setQuoteRequestStatus(id as any, 'in_progress'); message.success('Újranyitva'); load(); }}>Újra nyit</Button>}
            {!isDemand(rfq) && <>
              <Button size="small" onClick={async () => { await salesService.setQuoteRequestStatus(id as any, 'accepted'); message.success('Elfogadva'); load(); }}>Elfogad</Button>
              <Button size="small" onClick={async () => { await salesService.setQuoteRequestStatus(id as any, 'rejected'); message.success('Elutasítva'); load(); }}>Elutasít</Button>
              <Button size="small" onClick={async () => { await salesService.setQuoteRequestStatus(id as any, 'expired'); message.success('Lejárt'); load(); }}>Lejártat</Button>
            </>}
            <Button size="small" loading={saving && !closeAfterSaveRef.current}
              onClick={async () => {
                closeAfterSaveRef.current = false;
                if (editContext && itemSaveRef.current) {
                  try {
                    await itemSaveRef.current.save(true);
                  } catch (e) {
                    message.error('A tétel mentése sikertelen. Ellenőrizd a kötelező mezőket.');
                    return;
                  }
                }
                formBasic.submit();
              }}
            >Mentés</Button>
            <Button size="small" type="primary" loading={saving && closeAfterSaveRef.current}
              onClick={async () => {
                closeAfterSaveRef.current = true;
                if (editContext && itemSaveRef.current) {
                  try {
                    await itemSaveRef.current.save(true);
                  } catch (e) {
                    message.error('A tétel mentése sikertelen. Ellenőrizd a kötelező mezőket.');
                    return;
                  }
                }
                formBasic.submit();
              }}
            >Mentés &amp; bezárás</Button>
          </Space>
        }
      >
        {/* ── Életút ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <Steps size="small" current={currentStep} onChange={handleStepClick} style={{ cursor: 'pointer' }} items={[
            { title: 'Ajánlat', icon: <FileTextOutlined /> },
            { title: 'Kiküldve', icon: <FileDoneOutlined /> },
            { title: 'Elfogadva', icon: <CheckCircleOutlined /> },
            { title: 'Megrendelés', icon: <FileDoneOutlined /> },
            { title: 'Megerősítve', icon: <CheckCircleOutlined /> },
            { title: 'Tervezés', icon: <EditOutlined /> },
            { title: 'Ügyfél jóváhagyás', icon: <CheckCircleOutlined /> },
            { title: 'Belső jóváhagyás', icon: <CheckCircleOutlined /> },
            { title: 'Gyártás', icon: <RocketOutlined /> },
            { title: 'Kész', icon: <CheckOutlined /> },
            { title: 'Szállítás', icon: <CarOutlined /> },
            { title: 'Kiszállítva', icon: <SmileOutlined /> },
            { title: 'Kiszámlázva', icon: <FileTextOutlined /> },
          ]} />
          {lastSavedAt && <div style={{ textAlign: 'right', fontSize: 11, color: '#888', marginTop: 4 }}>Utoljára mentve: {lastSavedAt.format('HH:mm:ss')}</div>}
        </div>

        <Form layout="vertical" form={formBasic} size="small" onFinish={async (v) => {
          const closeAfter = closeAfterSaveRef.current;
          closeAfterSaveRef.current = false;
          setSaving(true);
          try {
            const companyId = v.company_id ?? rfq.company?.id;
            if (!companyId && companyId !== 'private') { message.error('A Cég mező kötelező.'); return; }
            const autoTitle = (!v.title || !String(v.title).trim())
              ? (isDemand(rfq) ? `Ajánlat ${rfq.number || rfq.request_number}` : (rfq.number || rfq.request_number))
              : String(v.title).trim();
            const updateData: any = {
              title: autoTitle, description: v.description, internal_description: v.internal_description,
              issue_date: v.issue_date ? v.issue_date.format('YYYY-MM-DD') : undefined,
              deadline: v.deadline ? v.deadline.format('YYYY-MM-DD') : null,
              valid_until: v.valid_until ? v.valid_until.format('YYYY-MM-DD') : null,
              validity_days: v.validity_days ?? 30,
              contact_ids: v.contact_ids || [], project_id: v.project_id ?? null,
              currency_code: v.currency_code, partial_order_allowed: v.partial_order_allowed,
              is_manufacturable: rfq?.is_manufacturable ?? false,
            };
            if (companyId === 'private') updateData.company_id = null;
            else if (companyId) updateData.company_id = companyId;
            await salesService.updateQuoteRequestBasic((rfq?.id || id) as any, updateData);
            message.success('Mentve'); setLastSavedAt(dayjs());
            if (closeAfter) { try { window.close(); } catch {} navigate('/sales/rfqs'); return; }
            load();
          } catch { message.error('Mentés sikertelen'); } finally { setSaving(false); }
        }}>

          <Row gutter={10} style={{ marginBottom: 8 }}>
            <Col xs={24} md={14}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* ── Alap adatok ──────────────────────────────────────────── */}
                <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '6px 12px 4px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
                  <Row gutter={[8, 0]} align="bottom">
                    <Col xs={12} md={8}>
                      <Form.Item label="Rögzítette" name="created_by_name" style={{ marginBottom: 4 }}>
                        <Select size="small" showSearch optionFilterProp="label" allowClear placeholder="Rögzítette" style={{ width: '100%' }}>
                          {allUsers.map((u: any) => <Select.Option key={u.id} value={u.name ?? u.full_name ?? u.username ?? String(u.id)} label={u.name ?? u.full_name ?? u.username}>{u.name ?? u.full_name ?? u.username}</Select.Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Item label="Keltezés" name="issue_date" style={{ marginBottom: 4 }}>
                        <DatePicker style={{ width: '100%' }} disabled size="small" />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Item label="Határidő" name="deadline" style={{ marginBottom: 4 }}>
                        <DatePicker style={{ width: '100%' }} size="small" />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Item label="Érvényes" name="valid_until" style={{ marginBottom: 4 }}>
                        <DatePicker style={{ width: '100%' }} size="small"
                          onChange={(val) => {
                            if (val) {
                              const diff = val.diff(formBasic.getFieldValue('issue_date') || dayjs(), 'day');
                              if (diff > 0) formBasic.setFieldValue('validity_days', diff);
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={2}>
                      <Form.Item label="Nap" name="validity_days" style={{ marginBottom: 4 }}>
                        <InputNumber min={1} size="small" style={{ width: '100%' }}
                          onChange={(v) => { if (v) formBasic.setFieldValue('valid_until', dayjs(formBasic.getFieldValue('issue_date') || dayjs()).add(v, 'day')); }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={2} style={{ paddingBottom: 4 }}>
                      <Button size="small" style={{ width: '100%' }} onClick={() => formBasic.setFieldsValue({ valid_until: dayjs().add(30, 'day'), validity_days: 30 })} title="+30 nap">+30n</Button>
                    </Col>
                    <Col xs={18} md={4}>
                      <Form.Item label="Deviza" name="currency_code" style={{ marginBottom: 4 }}>
                        <Select showSearch optionFilterProp="label" size="small" style={{ width: '100%' }}>
                          {(currencyList || []).map((c: any) => (
                            <Select.Option key={c.id} value={c.code} label={`${c.code} – ${c.name}`}>{c.code} – {c.name}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={6} md={2} style={{ paddingBottom: 4 }}>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={async () => {
                        try { await salesService.softDeleteQuoteRequest(id as any); message.success('Törölve'); navigate('/sales/rfqs'); }
                        catch { message.error('Nem sikerült törölni'); }
                      }} />
                    </Col>
                  </Row>
                </div>

                {/* ── Management (összecsukható) ─────────────────────────── */}
                <Collapse size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }} ghost
                  items={[{
                    key: 'mgmt',
                    label: <span style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Management{rfq?.owner_name ? ` — ${rfq.owner_name}` : ''}{rfq?.assignee_details?.length ? ` + ${rfq.assignee_details.length} résztvevő` : ''}</span>,
                    children: (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ color: '#555' }}>
                            {rfq?.owner_name && <span><strong>Felelős:</strong> {rfq.owner_name} </span>}
                            <span style={{ marginLeft: 8 }}><strong>Résztvevők: </strong>
                              {rfq?.assignee_details?.length > 0 ? rfq.assignee_details.map((part: any) => (
                                <Tag key={part.id} closable onClose={async (e) => { e.preventDefault(); try { await salesService.removeAssignee(id as any, part.id); message.success('Eltávolítva'); load(); } catch { message.error('Hiba'); } }}>{part.name}</Tag>
                              )) : <span>-</span>}
                            </span>
                            {rfq?.invitations_pending?.length > 0 && <span style={{ marginLeft: 8, color: '#888' }}>
                              <strong>Meghívottak: </strong>
                              {rfq.invitations_pending.map((i: any) => (
                                <Tag key={i.id} closable color="warning" onClose={async (e) => { e.preventDefault(); try { await salesService.cancelInvitation(id as any, i.id); message.success('Visszavonva'); load(); } catch { message.error('Hiba'); } }}>{i.invitee_name}</Tag>
                              ))}
                            </span>}
                          </div>
                          <Space wrap>
                            <Button size="small" icon={<UserAddOutlined />} onClick={async () => { try { await salesService.takeQuoteRequest(id as any); message.success('Hozzárendelve'); load(); } catch { message.error('Nem sikerült'); } }}>Ide vele</Button>
                            {(() => {
                              const isMeAssigned = user?.id ? ((rfq?.assignees || []) as number[]).includes(user.id) : false;
                              return <Button size="small" onClick={async () => { try { if (isMeAssigned) { await salesService.leaveQuoteRequest(id as any); message.success('Kiszálltál'); } else { await salesService.joinQuoteRequest(id as any); message.success('Beszálltál'); } load(); } catch { message.error('Nem sikerült'); } }}>{isMeAssigned ? 'Kiszállok' : 'Beszállok'}</Button>;
                            })()}
                            <Button size="small" icon={<UserSwitchOutlined />} onClick={() => setTakeoverConfirmOpen(true)}>Átveszem</Button>
                            <Select
                              mode="multiple"
                              size="small"
                              showSearch
                              allowClear
                              placeholder="Munkatársak meghívása"
                              optionFilterProp="label"
                              style={{ minWidth: 260 }}
                              value={inviteUserIds as any}
                              onChange={(vals) => setInviteUserIds(Array.isArray(vals) ? vals.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)) : [])}
                            >
                              {allUsers.map((u) => <Select.Option key={u.id} value={u.id} label={u.name}>{u.name}</Select.Option>)}
                            </Select>
                            <Button size="small" disabled={inviteUserIds.length === 0} onClick={async () => {
                              if (inviteUserIds.length === 0) return;
                              const results = await Promise.allSettled(inviteUserIds.map((uid) => salesService.inviteUserToRfq(id as any, uid)));
                              const successCount = results.filter((r) => r.status === 'fulfilled').length;
                              const failedCount = results.length - successCount;
                              if (successCount > 0 && failedCount === 0) {
                                message.success(successCount === 1 ? 'Meghívó elküldve' : `${successCount} meghívó elküldve`);
                              } else if (successCount > 0) {
                                message.warning(`${successCount} meghívó elküldve, ${failedCount} sikertelen`);
                              } else {
                                message.error('Nem sikerült meghívni a kiválasztott felhasználókat');
                              }
                              setInviteUserIds([]);
                              load();
                            }}>Meghívás</Button>
                          </Space>
                        </div>
                      </div>
                    )
                  }]}
                />
              </div>
            </Col>

            <Col xs={24} md={10}>
              {/* ── Gyártási file-ok ─────────────────────────────────────── */}
              <div style={{
                background: rfq?.is_manufacturable ? '#d9f7be' : '#ffd6d6',
                border: `1px solid ${rfq?.is_manufacturable ? '#73d13d' : '#ff4d4f'}`,
                borderRadius: 8,
                padding: '6px 10px 6px',
                height: '100%',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: rfq?.is_manufacturable ? '#389e0d' : '#cf1322', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Gyártható: {rfq?.is_manufacturable ? 'IGEN' : 'NEM'}
                  </span>
                  <Switch
                    size="small"
                    checked={!!rfq?.is_manufacturable}
                    checkedChildren="IGEN"
                    unCheckedChildren="NEM"
                    onChange={async (checked) => {
                      // Optimistic update — frissítés azonnal
                      setRfq((prev: any) => prev ? { ...prev, is_manufacturable: checked } : prev);
                      formBasic.setFieldValue('is_manufacturable', checked);
                      try {
                        const updated = await salesService.updateQuoteRequestBasic((rfq?.id || id) as any, { is_manufacturable: checked });
                        setRfq((prev: any) => prev ? { ...prev, ...(updated || {}) } : (updated || prev));
                      } catch {
                        setRfq((prev: any) => prev ? { ...prev, is_manufacturable: !checked } : prev);
                        formBasic.setFieldValue('is_manufacturable', !checked);
                        message.error('Nem sikerült menteni a gyártható állapotot');
                      }
                    }}
                  />
                </div>
                {rfq?.is_manufacturable && manufacturableMarkedInfo && (
                  <div style={{ marginBottom: 6, fontSize: 11, color: '#237804' }}>
                    Gyárthatóvá tette: {manufacturableMarkedInfo}
                  </div>
                )}

                <div
                  style={{ marginBottom: 8, width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}
                  onMouseEnter={() => setManufacturingPanelHovered(true)}
                  onMouseLeave={() => setManufacturingPanelHovered(false)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 14,
                        background: manufacturingPanelHovered
                          ? 'linear-gradient(180deg, #ffffff 0%, #e6f4ff 100%)'
                          : 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
                        boxShadow: manufacturingPanelHovered
                          ? '0 10px 24px rgba(9, 88, 217, 0.16), inset 0 0 0 1px rgba(145, 202, 255, 0.3)'
                          : '0 6px 16px rgba(0, 0, 0, 0.08)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Upload.Dragger
                        multiple
                        showUploadList={false}
                        customRequest={async (options: any) => {
                          try {
                            await uploadManufacturingFile(options.file as File);
                            options.onSuccess?.({}, options.file);
                          } catch (error) {
                            options.onError?.(error as Error);
                          }
                        }}
                        style={{
                          width: 100,
                          height: 100,
                          padding: 0,
                          borderRadius: 14,
                          border: manufacturingPanelHovered ? '2px dashed #1677ff' : '2px dashed #8c8c8c',
                          background: 'transparent',
                        }}
                      >
                        <div style={{ width: 100, height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8, boxSizing: 'border-box', gap: 4, overflow: 'hidden' }}>
                          {manufacturingUploading > 0
                            ? <><Spin size="small" /><span style={{ fontSize: 10, color: '#595959', marginTop: 4 }}>Feltöltés…</span></>
                            : <><PaperClipOutlined style={{ fontSize: 18, color: manufacturingPanelHovered ? '#1677ff' : '#595959' }} /><div style={{ fontSize: 10, color: '#595959', lineHeight: 1.15, fontWeight: 500 }}>Húzd ide<br/>vagy Ctrl+V</div></>
                          }
                        </div>
                      </Upload.Dragger>
                    </div>
                  </div>
                  <Input
                    size="small"
                    placeholder="Megjegyzés a feltöltéshez"
                    value={rfqPendingRemark}
                    onChange={(e) => setRfqPendingRemark(e.target.value)}
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <Button size="small" icon={<RocketOutlined />} onClick={async () => {
                    const companyName = rfq?.company?.name || rfq?.company_name || '';
                    setFileSendSearch(companyName);
                    setFileSendTarget(null);
                    // Betöltjük az összes csatolmányt (include_all=1)
                    try {
                      const allAtts = await salesService.getQuoteRequestAllAttachments(rfq?.id || id as any);
                      const attsArr = Array.isArray(allAtts) ? allAtts : (allAtts?.results || []);
                      setFileSendAllFiles(attsArr);
                      setSelectedFileKeys([]);
                    } catch {
                      setFileSendAllFiles(manufacturingFiles);
                      setSelectedFileKeys([]);
                    }
                    setFileSendOpen(true);
                  }} title="File küldés más RFQ-ra">Küldés</Button>
                </div>

                <Table
                  size="small"
                  pagination={false}
                  tableLayout="fixed"
                  rowKey={(r: any) => r.row_key || String(r.id)}
                  dataSource={manufacturingFiles}
                  locale={{ emptyText: 'Nincs csatolmány.' }}
                  style={{ fontSize: 12 }}
                  columns={[
                    {
                      title: 'File neve',
                      dataIndex: 'original_filename',
                      width: '46%',
                      render: (_: any, r: any) => (
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, marginBottom: 4 }}>
                            {manufacturingRenameId === r.id ? (
                              <>
                                <Input
                                  size="small"
                                  autoFocus
                                  style={{ width: 120 }}
                                  value={manufacturingRenameVal}
                                  onChange={(e) => setManufacturingRenameVal(e.target.value)}
                                  onPressEnter={async (e) => {
                                    const val = (e.currentTarget.value || '').trim();
                                    if (!val) { setManufacturingRenameId(null); return; }
                                    try {
                                      const baseName = manufacturingNameWithExt(r);
                                      const dotIdx = baseName.lastIndexOf('.');
                                      const ext = dotIdx > 0 ? baseName.slice(dotIdx) : '';
                                      const finalName = val + ext;
                                      const res = r.source === 'item'
                                        ? await salesService.renameQuoteRequestItemAttachment(r.quote_item, r.id, finalName)
                                        : await salesService.renameQuoteRequestAttachment((rfq?.id || id) as any, r.id, finalName);
                                      setManufacturingFiles((prev: any[]) => prev.map((att) => (att.row_key || att.id) === (r.row_key || r.id) ? { ...att, original_filename: res.original_filename, file: res.file ?? att.file, file_url: res.file_url ?? att.file_url } : att));
                                      setManufacturingRenameId(null);
                                    } catch {
                                      message.error('Átnevezés sikertelen');
                                    }
                                  }}
                                  onBlur={async (e) => {
                                    const val = (e.target.value || '').trim();
                                    if (!val) { setManufacturingRenameId(null); return; }
                                    try {
                                      const baseName = manufacturingNameWithExt(r);
                                      const dotIdx = baseName.lastIndexOf('.');
                                      const ext = dotIdx > 0 ? baseName.slice(dotIdx) : '';
                                      const finalName = val + ext;
                                      const res = r.source === 'item'
                                        ? await salesService.renameQuoteRequestItemAttachment(r.quote_item, r.id, finalName)
                                        : await salesService.renameQuoteRequestAttachment((rfq?.id || id) as any, r.id, finalName);
                                      setManufacturingFiles((prev: any[]) => prev.map((att) => (att.row_key || att.id) === (r.row_key || r.id) ? { ...att, original_filename: res.original_filename, file: res.file ?? att.file, file_url: res.file_url ?? att.file_url } : att));
                                    } catch {
                                      message.error('Átnevezés sikertelen');
                                    } finally {
                                      setManufacturingRenameId(null);
                                    }
                                  }}
                                />
                                {(() => {
                                  const baseName = manufacturingNameWithExt(r);
                                  const dotIdx = baseName.lastIndexOf('.');
                                  const ext = dotIdx > 0 ? baseName.slice(dotIdx) : '';
                                  return ext ? <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>{ext}</span> : null;
                                })()}
                              </>
                            ) : (() => {
                              const fn = r.original_filename || r.file?.split('/').pop() || `#${r.id}`;
                              const fileUrl = r.file_url || r.file;
                              const isImage = !!fileUrl && (((r.content_type || '').toLowerCase().startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn));
                              const isPdfFile = !!fileUrl && (/\.pdf(\?|$)/i.test(fileUrl) || /\.pdf$/i.test(fn));
                              const tooltipContent = isPdfFile ? (
                                <div style={{ width: 260 }}>
                                  <iframe title={fn} src={fileUrl} style={{ width: 240, height: 180, border: 0, display: 'block', marginBottom: 6, borderRadius: 4 }} />
                                  <div style={{ fontSize: 11, color: '#bbb', wordBreak: 'break-all' }}>{fn}</div>
                                </div>
                              ) : isImage ? (
                                <div style={{ maxWidth: 260 }}>
                                  <img src={fileUrl} alt={fn} style={{ maxWidth: 240, maxHeight: 180, display: 'block', marginBottom: 6, borderRadius: 4 }} />
                                  <div style={{ fontSize: 11, color: '#bbb', wordBreak: 'break-all' }}>{fn}</div>
                                </div>
                              ) : (
                                <div style={{ maxWidth: 260, wordBreak: 'break-all' }}>{fn}</div>
                              );
                              return (
                                <Tooltip placement="top" title={tooltipContent}>
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openManufacturingAttachmentPreview(r);
                                    }}
                                  >
                                    {fn}
                                  </a>
                                </Tooltip>
                              );
                            })()}
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined style={{ fontSize: 11 }} />}
                              title="Átnevezés"
                              style={{ padding: '0 2px', flexShrink: 0 }}
                              onClick={() => {
                                setManufacturingRenameId(r.id);
                                const full = manufacturingNameWithExt(r);
                                const dotIdx = full.lastIndexOf('.');
                                setManufacturingRenameVal(dotIdx > 0 ? full.slice(0, dotIdx) : full);
                              }}
                            />
                          </div>
                          <Input
                            size="small"
                            placeholder="Megjegyzés"
                            value={manufacturingExistingRemarks[r.id] ?? r.remark ?? ''}
                            onChange={(e) => setManufacturingExistingRemarks((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            onBlur={async (e) => {
                              try {
                                if (r.source === 'item') {
                                  await salesService.updateQuoteRequestItemAttachmentRemark(r.quote_item, r.id, e.target.value);
                                } else {
                                  await salesService.updateQuoteRequestAttachmentRemark((rfq?.id || id) as any, r.id, e.target.value);
                                }
                                setManufacturingFiles((prev: any[]) => prev.map((att) => (att.row_key || att.id) === (r.row_key || r.id) ? { ...att, remark: e.target.value } : att));
                              } catch {
                                message.error('Nem sikerült menteni a megjegyzést');
                              }
                            }}
                          />
                        </div>
                      ),
                    },
                    {
                      title: 'Feltöltötte',
                      key: 'uploaded',
                      width: 108,
                      render: (_: any, r: any) => (
                        <div style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.uploaded_by_name || '-'}</div>
                          <div style={{ color: '#8c8c8c' }}>{r.created_at ? new Date(r.created_at).toLocaleString('hu-HU') : '-'}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Jóváhagyta',
                      key: 'approved',
                      width: 108,
                      render: (_: any, r: any) => (
                        <div style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.approved_by_name || '-'}</div>
                          <div style={{ color: '#8c8c8c' }}>{r.approved_at ? new Date(r.approved_at).toLocaleString('hu-HU') : '-'}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Művelet',
                      key: 'actions',
                      width: 104,
                      render: (_: any, r: any) => (
                        <Space size={0}>
                          <Tooltip title={r.is_manufacturing_file ? 'Gyártási file jelölés levétele' : 'Megjelölés gyártási file-ként'}>
                            <Button
                              size="small"
                              type="text"
                              icon={<ToolOutlined style={{ color: r.is_manufacturing_file ? '#fa8c16' : '#bfbfbf' }} />}
                              onClick={async () => {
                                try {
                                  const next = !r.is_manufacturing_file;
                                  if (r.source === 'item') {
                                    await salesService.setQuoteRequestItemAttachmentManufacturing(r.quote_item, r.id, next);
                                    await refreshManufacturingFiles();
                                  } else {
                                    await salesService.setQuoteRequestAttachmentManufacturing((rfq?.id || id) as any, r.id, next);
                                    setManufacturingFiles((prev: any[]) => prev.map((att) => (att.row_key || att.id) === (r.row_key || r.id) ? { ...att, is_manufacturing_file: next } : att));
                                  }
                                  message.success(next ? 'Megjelölve gyártási file-ként' : 'Gyártási file jelölés levéve');
                                } catch {
                                  message.error('Nem sikerült módosítani');
                                }
                              }}
                            />
                          </Tooltip>
                          {r.source !== 'item' && (
                          <Tooltip title={r.approved_at ? 'Jóváhagyva' : 'Jóváhagyás'}>
                            <Button
                              size="small"
                              type="text"
                              icon={<CheckCircleOutlined style={{ color: r.approved_at ? '#52c41a' : '#1677ff' }} />}
                              onClick={async () => {
                                try {
                                  await salesService.approveQuoteRequestAttachment((rfq?.id || id) as any, r.id);
                                  message.success('Jóváhagyva');
                                  await refreshManufacturingFiles();
                                } catch {
                                  message.error('Nem sikerült jóváhagyni');
                                }
                              }}
                            />
                          </Tooltip>
                          )}
                          <Popconfirm
                            title="Biztosan törlöd ezt a fájlt?"
                            okText="Igen"
                            cancelText="Mégse"
                            onConfirm={async () => {
                              try {
                                if (r.source === 'item') {
                                  await salesService.deleteQuoteRequestItemAttachment(r.quote_item, r.id);
                                } else {
                                  await salesService.deleteQuoteRequestAttachment((rfq?.id || id) as any, r.id);
                                }
                                message.success('Törölve');
                                await refreshManufacturingFiles();
                              } catch {
                                message.error('Nem sikerült törölni');
                              }
                            }}
                          >
                            <Tooltip title="Törlés">
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                            </Tooltip>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ] as any}
                />
              </div>
            </Col>
          </Row>

          {/* ── Ügyfél + Projekt ─────────────────────────────────────── */}
          <Row gutter={10} style={{ marginBottom: 8 }}>
            <Col xs={24} md={16}>
              <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '6px 12px 4px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
                <Row gutter={[8, 4]}>
                  <Col xs={24} md={10}>
                    <Form.Item label="Cég" style={{ marginBottom: 4 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="company_id" noStyle>
                          <Select size="small" showSearch filterOption={filterOptionAccents} placeholder="Válassz céget" style={{ width: 'calc(100% - 24px)' }}
                            onFocus={async () => {
                              const list = await crmService.getCompanies({ is_customer: true, compact: true });
                              const loaded = ((list as any).results ?? list) || [];
                              const merged = Array.isArray(loaded) ? [...loaded] : [];
                              if (rfq?.company?.id && !merged.find((c: any) => c.id === rfq.company.id)) merged.unshift({ id: rfq.company.id, name: rfq.company.name });
                              setCompanies(merged);
                            }}
                            onChange={async (val) => {
                              try {
                                if (val === 'private') { const list = await crmService.getPrivateContacts(); setContacts((list as any).results ?? list); formBasic.setFieldValue('contact_ids', []); }
                                else { const list = await crmService.getContactsByCompany(val); setContacts((list as any).results ?? list); formBasic.setFieldValue('contact_ids', []); }
                              } catch {}
                            }}
                          >
                            <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                            {(companies || []).map((c: any) => <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>)}
                          </Select>
                        </Form.Item>
                        <Button size="small" icon={<PlusOutlined />} title="Új cég" onClick={() => { setSelectedCountry('Magyarország'); companyForm.resetFields(); companyForm.setFieldsValue({ country: 'Magyarország', is_customer: true, is_supplier: false }); setIsCompanyModalVisible(true); }} />
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={14}>
                    <Form.Item label="Kapcsolattartók" style={{ marginBottom: 4 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="contact_ids" noStyle>
                          <Select size="small" mode="multiple" allowClear showSearch filterOption={filterOptionAccents} optionLabelProp="label" placeholder="Kapcsolattartók" style={{ width: 'calc(100% - 72px)' }}
                            value={Array.isArray(formBasic.getFieldValue('contact_ids')) ? formBasic.getFieldValue('contact_ids') : []}
                            options={(contacts || []).map((p: any, idx: number) => ({ value: getContactOptionValue(p, idx), label: contactOptionLabel(p, !formBasic.getFieldValue('company_id')) }))}
                            onFocus={async () => {
                              const cid = formBasic.getFieldValue('company_id');
                              if (cid === 'private') { const l = await crmService.getPrivateContacts(); setContacts((l as any).results ?? l); }
                              else if (cid) { const l = await crmService.getContactsByCompany(cid); setContacts((l as any).results ?? l); }
                              else { const l = await crmService.getContacts(); setContacts(((l as any).results ?? l) || []); }
                            }}
                            onChange={async (val: any) => {
                              formBasic.setFieldsValue({ contact_ids: val });
                              const cid = formBasic.getFieldValue('company_id');
                              if (!cid && Array.isArray(val) && val.length > 0) {
                                const lastId = val[val.length - 1];
                                const chosen = contacts.find((c: any) => (
                                  getContactOptionValue(c) === String(lastId) || String(c.id) === String(lastId)
                                ));
                                const chosenCid = chosen?.customer || chosen?.customer_id || chosen?.company || chosen?.company_id;
                                if (chosenCid) {
                                  formBasic.setFieldsValue({ company_id: chosenCid });
                                  const cl = await crmService.getContactsByCompany(chosenCid);
                                  const loaded: any[] = ((cl as any).results ?? cl) || [];
                                  const merged = [...loaded];
                                  (val as any[]).forEach((selId: any) => {
                                    if (!merged.find((c: any) => getContactOptionValue(c) === String(selId) || String(c.id) === String(selId))) {
                                      const ex = contacts.find((c: any) => getContactOptionValue(c) === String(selId) || String(c.id) === String(selId));
                                      if (ex) merged.push(ex);
                                    }
                                  });
                                  setContacts(merged);
                                  const cname = chosen?.customer_name || chosen?.company_name;
                                  if (cname) setCompanies((prev: any[]) => prev.find((c: any) => String(c.id) === String(chosenCid)) ? prev : [{ id: chosenCid, name: cname }, ...prev]);
                                } else {
                                  formBasic.setFieldsValue({ company_id: 'private' });
                                  const l = await crmService.getPrivateContacts();
                                  const loaded: any[] = ((l as any).results ?? l) || [];
                                  const merged = [...loaded];
                                  (val as any[]).forEach((selId: any) => {
                                    if (!merged.find((c: any) => getContactOptionValue(c) === String(selId) || String(c.id) === String(selId))) {
                                      const ex = contacts.find((c: any) => getContactOptionValue(c) === String(selId) || String(c.id) === String(selId));
                                      if (ex) merged.push(ex);
                                    }
                                  });
                                  setContacts(merged);
                                }
                              }
                            }}
                          />
                        </Form.Item>
                        <Button size="small" icon={<PlusOutlined />} title="Új kapcsolattartó" onClick={() => { const cid = formBasic.getFieldValue('company_id'); let url = '/crm/contacts?action=create'; if (cid && cid !== 'private') { url += `&company=${cid}`; const co = companies.find((c: any) => c.id === cid); if (co?.name) url += `&company_name=${encodeURIComponent(co.name)}`; } window.open(url, '_blank'); }} />
                        <Button size="small" onClick={async () => { const cid = formBasic.getFieldValue('company_id'); if (cid === 'private') { const l = await crmService.getPrivateContacts(); setContacts((l as any).results ?? l); message.success('Frissítve'); } else if (cid) { const l = await crmService.getContactsByCompany(cid); setContacts((l as any).results ?? l); message.success('Frissítve'); } else { message.warning('Először válassz céget'); } }}>↺</Button>
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '6px 12px 4px', height: '100%' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#d46b08', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projekt</div>
                <Form.Item label="Projekt" name="project_id" style={{ marginBottom: 4 }}>
                  <Select size="small" allowClear showSearch optionFilterProp="label" placeholder="Válassz projektet"
                    onChange={(v: number | undefined) => {
                      if (!v) return;
                      const proj = (projects || []).find((p: any) => p.id === v);
                      if (proj?.company && rfq?.company?.id && proj.company !== rfq.company.id) {
                        message.warning(`Ez a projekt más ügyfélhez tartozik (${proj.company_name || proj.company}).`);
                        formBasic.setFieldValue('project_id', undefined);
                      }
                    }}
                  >
                    {(projects || []).filter((p: any) => p.status === 'open' && (!p.company || !rfq?.company?.id || p.company === rfq.company.id)).map((p: any) => {
                      const co = p.company_name || '';
                      const label = co ? `${co} – ${p.name}` : p.name;
                      return <Select.Option key={p.id} value={p.id} label={label}>{co ? <><Tooltip title={co}><span>{co.length > 15 ? co.slice(0,15)+'…' : co}</span></Tooltip> – {p.name}</> : p.name}</Select.Option>;
                    })}
                  </Select>
                </Form.Item>
              </div>
            </Col>
          </Row>

          {/* ── Tételek ──────────────────────────────────────────────── */}
          {!editContext && (
          <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '6px 12px 4px', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0958d9', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tételek</div>
            <ItemsTable
              items={rfq.items || []}
              onRefresh={refreshItems}
              quoteRequestId={id as any}
              currency={activeCurrency}
              onEditItem={(item) => { setEditContext({ item }); setSelectorType(item.item_type); }}
              onWorkHours={async (item) => {
                setWorkHoursItemId(item.id);
                setWorkHoursItemName(item.product_name || item.manufacturing_product_name || item.service_name || `Tétel #${item.id}`);
                setCheckedWorkLogKeys([]); setWorkLogs([]); setWorkHoursOpen(true); setWorkHoursLoading(true);
                try {
                  const data = await salesService.getWorkLogsByRfq((rfq?.id || id) as any);
                  const results = Array.isArray(data) ? data : (data?.results || []);
                  setWorkLogs(results);
                  const wfs = await salesService.getFrequentWorkflows();
                  setFrequentWorkflows(Array.isArray(wfs) ? wfs : []);
                } catch { message.error('Nem sikerült betölteni a munkaórákat'); }
                finally { setWorkHoursLoading(false); }
              }}
              currencySelector={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 500, whiteSpace: 'nowrap', fontSize: 13 }}>Pénznem:</span>
                  <Form.Item name="currency_code" noStyle>
                    <Select showSearch optionFilterProp="label" placeholder="Válassz pénznemet" style={{ width: 200 }} size="small">
                      {(currencyList || []).map((c: any) => <Select.Option key={c.id} value={c.code} label={`${c.code} – ${c.name}`}>{c.code} – {c.name} {c.symbol ? `(${c.symbol})` : ''}</Select.Option>)}
                    </Select>
                  </Form.Item>
                </div>
              }
            />
          </div>
          )}
        </Form>

        {/* ── Inline item editor ───────────────────────────────────── */}
        {editContext && (
        <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 8 }}>
          <ItemSelectorModal
            renderInline saveRef={itemSaveRef} open={true} mode="edit" defaultType={selectorType}
            onCancel={() => {}}
            onAdd={async (p) => onEditSelected(p)}
            rfqId={id as any} rfqCurrency={activeCurrency} hideCodeField
            initialSelection={editItemModalInitialSelection || undefined}
            initialValues={editItemModalInitialValues}
            initialFormulas={editContext.item.formulas || {}}
            quoteItemId={editContext.item.id}
            onManufacturingMarked={refreshManufacturingFiles}
          />
        </div>
        )}

        <AttachmentPreviewModal
          open={filePreviewOpen} title={filePreviewTitle} url={filePreviewUrl}
          onClose={() => { setFilePreviewOpen(false); setFilePreviewUrl(null); setFilePreviewTitle(''); }}
        />

        {/* ── File küldés más RFQ-ra ────────────────────────────────── */}
        <Modal
          title="File küldés más RFQ-ra"
          open={fileSendOpen}
          onCancel={() => { setFileSendOpen(false); setFileSendTarget(null); setFileSendPickerOpen(false); }}
          width={860}
          footer={[
            <Button key="cancel" onClick={() => { setFileSendOpen(false); setFileSendTarget(null); }}>Mégse</Button>,
            <Button key="send" type="primary" loading={fileSendSending}
              disabled={!fileSendTarget || selectedFileKeys.length === 0}
              onClick={async () => {
                if (!fileSendTarget) return;
                const mfgIds: number[] = [];
                const itemIds: number[] = [];
                selectedFileKeys.forEach(k => {
                  const att = manufacturingFiles.find((a: any) => (a.row_key || String(a.id)) === k);
                  if (!att) return;
                  if (att.source === 'item') itemIds.push(att.id);
                  else mfgIds.push(att.id);
                });
                setFileSendSending(true);
                try {
                  const res = await salesService.copyRfqAttachments(rfq?.id || id as any, fileSendTarget.id, mfgIds, itemIds);
                  message.success(`${res.copied} fájl másolva → ${fileSendTarget.request_number}`);
                  setFileSendOpen(false);
                  setSelectedFileKeys([]);
                } catch {
                  message.error('Hiba a fájlok küldésekor');
                } finally {
                  setFileSendSending(false);
                }
              }}
            >Küldés ({selectedFileKeys.length} fájl)</Button>,
          ]}
        >
          {/* Célállomás RFQ választó */}
          {fileSendTarget ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: '#1677ff' }}>{fileSendTarget.request_number}</span>
                {fileSendTarget.company_name && <span style={{ color: '#555', marginLeft: 8 }}>{fileSendTarget.company_name}</span>}
                {fileSendTarget.title && fileSendTarget.title !== fileSendTarget.request_number && (
                  <span style={{ color: '#389e0d', marginLeft: 8, fontSize: 12 }}>{fileSendTarget.title}</span>
                )}
              </div>
              <Button size="small" onClick={() => setFileSendPickerOpen(true)}>Csere</Button>
            </div>
          ) : (
            <Button block icon={<RocketOutlined />} style={{ marginBottom: 12 }} onClick={() => setFileSendPickerOpen(true)}>
              Célállomás RFQ kiválasztása…
            </Button>
          )}

          {/* Fájlok listája 2 csoportban — IDE kerültek a checkboxok */}
          {(() => {
            const allFiles = fileSendAllFiles.length > 0 ? fileSendAllFiles : manufacturingFiles;
            const mfgFiles = allFiles.filter((a: any) => a.is_manufacturing_file);
            const normalFiles = allFiles.filter((a: any) => !a.is_manufacturing_file);
            const renderGroup = (groupTitle: string, files: any[]) => files.length === 0 ? null : (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{groupTitle}</div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r: any) => r.row_key || String(r.id)}
                  dataSource={files}
                  rowSelection={{
                    selectedRowKeys: selectedFileKeys,
                    onChange: (keys) => setSelectedFileKeys(prev => {
                      // A többi csoport kijelölése maradjon, csak ezt a csoportot módosítjuk
                      const groupKeys = files.map((f: any) => f.row_key || String(f.id));
                      const otherKeys = prev.filter(k => !groupKeys.includes(k));
                      return [...otherKeys, ...(keys as string[])];
                    }),
                  }}
                  columns={[
                    { title: 'File neve', key: 'name', ellipsis: true,
                      render: (_: any, r: any) => {
                        const fn = r.original_filename || r.file?.split('/').pop() || `#${r.id}`;
                        const fileUrl = r.file_url || r.file;
                        const isImg = !!fileUrl && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn);
                        const tip = isImg ? <img src={fileUrl} alt={fn} style={{ maxWidth: 200, maxHeight: 150, borderRadius: 4 }} /> : fn;
                        return <Tooltip title={tip}><a href={fileUrl} target="_blank" rel="noreferrer" onClick={(e) => { if (isPdf(fileUrl)) { e.preventDefault(); openPdfPreview(fileUrl); } }}>{fn}</a></Tooltip>;
                      }},
                    { title: 'Jóváhagyva', key: 'approved', width: 90, align: 'center' as const,
                      render: (_: any, r: any) => r.approved_at ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : null },
                    { title: 'Megjegyzés', key: 'remark', width: 160,
                      render: (_: any, r: any) => <span style={{ fontSize: 11, color: '#888' }}>{r.remark || ''}</span> },
                  ]}
                />
              </div>
            );
            return <>{renderGroup('Gyártási csatolmányok', mfgFiles)}{renderGroup('Csatolmányok', normalFiles)}</>;
          })()}
        </Modal>

        {/* RFQ picker a File küldéshez — valós idejű keresés */}
        <Modal
          title="Célállomás RFQ kiválasztása"
          open={fileSendPickerOpen}
          onCancel={() => setFileSendPickerOpen(false)}
          footer={null}
          width={820}
        >
          <Input
            placeholder="Keresés: ajánlatszám, ügyfél, tétel neve, leírás…"
            value={fileSendSearch}
            allowClear
            autoFocus
            style={{ marginBottom: 12 }}
            onChange={(e) => setFileSendSearch(e.target.value)}
          />
          <Table
            size="small"
            loading={fileSendLoading}
            rowKey="id"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ y: 360 }}
            dataSource={fileSendFiltered}
            locale={{ emptyText: fileSendResults.length === 0 ? 'Betöltés…' : 'Nincs találat' }}
            columns={[
              { title: 'Ajánlatszám', key: 'rfq_num', width: 120,
                render: (_: any, r: any) => <span style={{ color: '#1677ff', fontWeight: 500 }}>{r.request_number}</span> },
              { title: 'Ügyfél', key: 'company', width: 150,
                render: (_: any, r: any) => r.company_name || r.company?.name || '—' },
              { title: 'Tétel neve', key: 'item', width: 180, ellipsis: true,
                render: (_: any, r: any) => r.primary_item_name || r.title || '—' },
              { title: 'Mennyiség', key: 'qty', width: 80,
                render: (_: any, r: any) => r.primary_quantity != null ? `${r.primary_quantity} ${r.primary_unit || 'db'}` : '—' },
              { title: 'Leírás', key: 'desc', ellipsis: true,
                render: (_: any, r: any) => {
                  // HTML tag-ek eltávolítása
                  const raw = r.primary_item_description || '';
                  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '—';
                } },
              { title: '', key: 'action', width: 80,
                render: (_: any, r: any) => (
                  <Button size="small" type="primary" onClick={() => {
                    setFileSendTarget({ id: r.id, request_number: r.request_number, company_name: r.company_name || r.company?.name || '', title: r.title || r.primary_item_name || '' });
                    setFileSendPickerOpen(false);
                  }}>Kiválaszt</Button>
                )},
            ]}
          />
        </Modal>

        {/* ── Munkanapló (inline) ──────────────────────────────────── */}
        <div style={{ background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 8, padding: '6px 12px 8px', marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#531dab', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Munkanapló
              {workLogs.length > 0 && (() => {
                const totalSec = workLogs.reduce((a: number, l: any) => a + (l.duration_seconds || 0), 0);
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                return <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: '#531dab' }}>— Összesen: {h}:{String(m).padStart(2,'0')}</span>;
              })()}
            </div>
            <Button size="small" icon={<ClockCircleOutlined />} onClick={() => setWorkHoursOpen(true)}>Részletek / Hozzáadás</Button>
          </div>
          {workLogs.length === 0 ? (
            <div style={{ color: '#888', fontSize: 12 }}>Nincs rögzített munkaóra.</div>
          ) : (() => {
            const byUser: Record<string, { user_name: string; department: string; seconds: number }> = {};
            workLogs.forEach((l: any) => {
              const key = String(l.user);
              if (!byUser[key]) {
                byUser[key] = {
                  user_name: l.user_name || `User ${l.user}`,
                  department: (l.department_names && l.department_names.length > 0) ? l.department_names.join(', ') : '-',
                  seconds: 0,
                };
              }
              byUser[key].seconds += l.duration_seconds || 0;
            });
            const summaryRows = Object.values(byUser);
            return (
              <Table
                size="small"
                dataSource={summaryRows}
                rowKey="user_name"
                pagination={false}
                style={{ fontSize: 12 }}
                columns={[
                  { title: 'HR osztály', dataIndex: 'department', key: 'department' },
                  { title: 'Felhasználó', dataIndex: 'user_name', key: 'user_name' },
                  { title: 'Idő', key: 'time', width: 120, render: (_: any, r: any) => { const h = Math.floor(r.seconds/3600); const m = Math.floor((r.seconds%3600)/60); return `${h}h ${m}p (${(r.seconds/3600).toFixed(2)}h)`; } },
                ] as any}
              />
            );
          })()}
        </div>

        {/* ── Napló (inline) ───────────────────────────────────────── */}
        <Collapse size="small" style={{ marginTop: 8, background: '#f5f5f5', border: '1px solid #d9d9d9' }} ghost
          items={[{
            key: 'naplo',
            label: <span style={{ fontSize: 11, fontWeight: 600, color: '#595959', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Napló {logs.length > 0 ? `(${logs.length})` : ''}</span>,
            extra: <Button size="small" icon={<HistoryOutlined />} onClick={(e) => { e.stopPropagation(); setActivityLogOpen(true); }}>Aktivitás napló</Button>,
            children: logs.length === 0 ? (
              <div style={{ color: '#888', fontSize: 12, padding: '2px 0' }}>Nincs naplóbejegyzés.</div>
            ) : (
              <>
                <Table
                  size="small"
                  dataSource={logs.slice(0, 10)}
                  rowKey={(r: any) => String(r.id)}
                  pagination={false}
                  style={{ fontSize: 12 }}
                  columns={[
                    { title: 'Dátum', dataIndex: 'created_at', width: 130, render: (d: string) => <span style={{ whiteSpace: 'nowrap' }}>{new Date(d).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}</span> },
                    { title: 'Felhasználó', dataIndex: 'user_name', width: 130 },
                    {
                      title: 'Művelet', dataIndex: 'action',
                      render: (action: string, row: any) => renderLogAction(action, row),
                    },
                  ] as any}
                />
                {logs.length > 10 && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>+{logs.length - 10} további bejegyzés</div>}
              </>
            ),
          }]}
        />

      </Card>
      <Modal title="Átveszem" open={takeoverConfirmOpen} onCancel={() => setTakeoverConfirmOpen(false)} onOk={async () => {
        try { await salesService.takeoverQuoteRequest(id as any); message.success('Átvetted'); setTakeoverConfirmOpen(false); load(); } catch { message.error('Nem sikerült átvenni'); }
      }}>
        Biztosan átveszed? Mindenki más lekerül a feladatról és csak te maradsz.
      </Modal>
      <Modal title="Ajánlat kiküldése e-mailen" open={sendOpen} onOk={async () => {
        const v = await sendForm.validateFields();
        try {
          await salesService.sendQuoteRequestEmail(id as any, v);
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
                    const p = await salesService.renderQuoteRequestEmail(id as any, { 
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
              const p = await salesService.renderQuoteRequestEmail(id as any, { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) });
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
        rfqId={id as any}
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
            {
              title: 'Művelet',
              dataIndex: 'action',
              render: (action: string, row: any) => renderLogAction(action, row),
            },
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
        rfqId={id as any} 
        title={`Chat - ${rfq.number || rfq.request_number}`}
      />

      <ActivityLogModal
        visible={activityLogOpen}
        onClose={() => setActivityLogOpen(false)}
        objectType="quoterequest"
        objectId={id as any}
        objectTitle={rfq.number || rfq.request_number || ''}
      />

      {/* Work Hours Modal */}
      <Modal
        title={<Space><ClockCircleOutlined /> Munkaórák{workHoursItemName ? ` – ${workHoursItemName}` : ''}</Space>}
        open={workHoursOpen}
        onCancel={() => { setWorkHoursOpen(false); setCheckedWorkLogKeys([]); }}
        footer={null}
        width={760}
      >
        {workHoursLoading ? <Spin style={{ display: 'block', textAlign: 'center' }} /> : (() => {
          const fmtTime = (sec: number) => {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const decH = (sec / 3600).toFixed(2).replace(/\.?0+$/, '');
            return `${h}h ${m}p (${decH}h)`;
          };

          // Filter logs to selected item
          const visibleLogs = workHoursItemId != null
            ? workLogs.filter((l: any) => l.quote_item_id === workHoursItemId)
            : workLogs;

          // Total of visible logs
          const totalSec = visibleLogs.reduce((s: number, l: any) => s + (l.duration_seconds || 0), 0);

          // Total of checked logs
          const checkedLogs = visibleLogs.filter((l: any) => checkedWorkLogKeys.includes(l.id));
          const checkedSec = checkedLogs.reduce((s: number, l: any) => s + (l.duration_seconds || 0), 0);

          // Aggregate by user (from visible logs)
          const byUser: Record<string, { user_name: string; department: string; seconds: number }> = {};
          visibleLogs.forEach((l: any) => {
            const key = String(l.user);
            if (!byUser[key]) {
              byUser[key] = {
                user_name: l.user_name || `User ${l.user}`,
                department: (l.department_names && l.department_names.length > 0)
                  ? l.department_names.join(', ')
                  : '-',
                seconds: 0,
              };
            }
            byUser[key].seconds += l.duration_seconds || 0;
          });
          const summaryRows = Object.values(byUser);

          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 16 }}>
                <Statistic title="Összes idő" value={fmtTime(totalSec)} style={{ textAlign: 'center' }} />
                {checkedWorkLogKeys.length > 0 && (
                  <Statistic
                    title={`Kijelölt (${checkedWorkLogKeys.length} sor)`}
                    value={fmtTime(checkedSec)}
                    valueStyle={{ color: '#1677ff' }}
                    style={{ textAlign: 'center' }}
                  />
                )}
              </div>

              <Divider orientation="left">Összesítés (HR osztály / Felhasználó)</Divider>
              <Table
                size="small"
                dataSource={summaryRows}
                pagination={false}
                rowKey="user_name"
                locale={{ emptyText: 'Nincs rögzített munkaóra' }}
                columns={[
                  { title: 'HR osztály', dataIndex: 'department', key: 'department' },
                  { title: 'Felhasználó', dataIndex: 'user_name', key: 'user_name' },
                  { title: 'Idő', key: 'time', render: (_: any, r: any) => fmtTime(r.seconds) },
                ]}
              />

              <Divider orientation="left">Bejegyzések</Divider>
              <div style={{ marginBottom: 8, textAlign: 'right' }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={() => {
                    addWorkLogForm.resetFields();
                    addWorkLogForm.setFieldsValue({ date: dayjs(), time_h: 0, time_m: 0 });
                    setAddWorkLogOpen(true);
                  }}
                >
                  Munkaóra hozzáadása
                </Button>
              </div>
              <Table
                size="small"
                dataSource={visibleLogs}
                rowKey="id"
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                locale={{ emptyText: 'Nincs rögzített munkaóra' }}
                rowSelection={{
                  selectedRowKeys: checkedWorkLogKeys,
                  onChange: (keys) => setCheckedWorkLogKeys(keys),
                  columnWidth: 32,
                }}
                columns={[
                  {
                    title: 'Dátum',
                    dataIndex: 'started_at',
                    key: 'started_at',
                    render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
                    width: 100,
                  },
                  {
                    title: 'Költség Tétel',
                    dataIndex: 'sub_item_name',
                    key: 'sub_item_name',
                    render: (v: string, r: any) => v || r.order_label || '-',
                  },
                  {
                    title: 'Munkafolyamat',
                    dataIndex: 'workflow_name',
                    key: 'workflow_name',
                  },
                  {
                    title: 'Felhasználó',
                    dataIndex: 'user_name',
                    key: 'user_name',
                    width: 120,
                  },
                  {
                    title: 'Idő',
                    key: 'duration',
                    width: 110,
                    render: (_: any, r: any) => fmtTime(r.duration_seconds || 0),
                  },
                ]}
              />
            </>
          );
        })()}
      </Modal>

      {/* Add Work Log Modal */}
      <Modal
        title="Munkaóra hozzáadása"
        open={addWorkLogOpen}
        onCancel={() => setAddWorkLogOpen(false)}
        onOk={() => addWorkLogForm.submit()}
        okText="Mentés"
        cancelText="Mégsem"
        confirmLoading={addWorkLogSaving}
      >
        <Form
          form={addWorkLogForm}
          layout="vertical"
          onFinish={async (vals) => {
            if (!user?.id) { message.error('Nincs bejelentkezett felhasználó'); return; }
            const h = vals.time_h || 0;
            const m = vals.time_m || 0;
            const totalSecs = h * 3600 + m * 60;
            if (totalSecs <= 0) { message.error('Az idő nem lehet nulla'); return; }
            const date = vals.date ? dayjs(vals.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            const started = `${date}T08:00:00`;
            const ended = dayjs(started).add(totalSecs, 'second').toISOString();
            setAddWorkLogSaving(true);
            try {
              await salesService.createManualWorkLog({
                user: user.id,
                workflow_name: vals.workflow_name,
                order_label: vals.cost_label || '',
                started_at: started,
                ended_at: ended,
                duration_seconds: totalSecs,
                customer_order: null,
              });
              message.success('Munkaóra rögzítve');
              setAddWorkLogOpen(false);
              // reload work logs
              const data = await salesService.getWorkLogsByRfq((rfq?.id || id) as any);
              setWorkLogs(Array.isArray(data) ? data : (data?.results || []));
            } catch (e: any) {
              message.error(e?.response?.data?.detail || 'Nem sikerült rögzíteni');
            } finally {
              setAddWorkLogSaving(false);
            }
          }}
        >
          <Form.Item name="date" label="Dátum" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="cost_label" label="Költség Tétel">
            <Input placeholder="pl. Szortírozás, Médianyomtatás..." />
          </Form.Item>
          <Form.Item name="workflow_name" label="Munkafolyamat" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <AutoComplete
              options={frequentWorkflows.map((w) => ({ value: w }))}
              placeholder="Munkafolyamat neve..."
              filterOption={(input, option) =>
                (option?.value as string || '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item label="Idő">
            <Space>
              <Form.Item name="time_h" noStyle>
                <InputNumber min={0} max={99} addonAfter="h" style={{ width: 90 }} />
              </Form.Item>
              <Form.Item name="time_m" noStyle>
                <InputNumber min={0} max={59} addonAfter="m" style={{ width: 90 }} />
              </Form.Item>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RFQDetail;
