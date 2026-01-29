import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Send, 
  Eye,
  Filter,
  Download,
  Copy,
  FileDiff,
  Mail,
  RefreshCw,
  ArrowUp
} from 'lucide-react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import { invoiceAPI, invoiceBlockAPI, emailSettingsAPI } from '../services/api';
import EmailModal from '../components/EmailModal';
import Modal from '../components/Modal';

const InvoicesContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const InvoicesHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const SearchContainer = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 200px;
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
`;

const ActionButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2980b9;
  }
`;

const TableContainer = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.thead`
  background-color: #f8f9fa;
`;

const TableHeaderCell = styled.th`
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #ecf0f1;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  &:hover {
    background-color: #f8f9fa;
  }
  ${props => props.$storno ? 'background: #ffe5e5;' : ''}
  ${props => props.$cancelled ? 'background: #ffe5e5;' : ''}
  ${props => (!props.$storno && props.$paid) ? 'background: #eafaf1;' : ''}
  ${props => (!props.$storno && !props.$paid && props.$unpaid) ? 'background: #f3e8ff;' : ''}
`;

const TableCell = styled.td`
  padding: 16px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${props => {
    switch (props.status) {
      case 'draft': return '#f39c12';
      case 'sent': return '#3498db';
      case 'paid': return '#27ae60';
      case 'cancelled': return '#e74c3c';
      case 'submitted_to_nav': return '#9b59b6';
      case 'nav_processed': return '#27ae60';
      case 'nav_rejected': return '#e74c3c';
      default: return '#95a5a6';
    }
  }};
  color: white;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  background-color: ${props => {
    switch (props.variant) {
      case 'edit': return '#3498db';
      case 'delete': return '#e74c3c';
      case 'send': return '#27ae60';
      case 'view': return '#6c757d';
      case 'status': return '#8e44ad';
      case 'copy': return '#2c3e50'; // sötétkék
      case 'correct': return '#ff6b6b'; // világos piros
      case 'storno': return '#c0392b'; // sötét piros
      case 'nav': return '#27ae60'; // zöld
      case 'email': return '#3498db'; // kék
      default: return '#f8f9fa';
    }
  }};
  color: white;
  font-size: ${props => props.$fontSize || '16px'};
  font-weight: ${props => props.$fontWeight || 'normal'};

  &:hover {
    opacity: 0.8;
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  gap: 8px;
`;

const PaginationButton = styled.button`
  padding: 8px 12px;
  border: 1px solid #ddd;
  background: white;
  color: #2c3e50;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #f8f9fa;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.active {
    background-color: #3498db;
    color: white;
    border-color: #3498db;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
`;

const Invoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  
  const queryClient = useQueryClient();
  const [navStatusMap, setNavStatusMap] = useState({});
  const [navStatusLoading, setNavStatusLoading] = useState({});
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState(null);
  const [emailDefaults, setEmailDefaults] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [stornoModalOpen, setStornoModalOpen] = useState(false);
  const [stornoInvoice, setStornoInvoice] = useState(null);
  const [stornoProcessing, setStornoProcessing] = useState(false);

  // Keep company selection in sync with sidebar/localStorage
  React.useEffect(() => {
    const sync = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setSelectedCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    const id = setInterval(sync, 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, []);

  // Reset page when company changes
  React.useEffect(() => { setCurrentPage(1); }, [selectedCompanyId]);

  const { data: invoiceBlocks } = useQuery(
    ['invoiceBlocks', { company_id: selectedCompanyId }],
    () => invoiceBlockAPI.getInvoiceBlocks({ company_id: selectedCompanyId }).then(res => res.data?.results || res.data),
    { enabled: !!selectedCompanyId }
  );

  const { data: invoices, isLoading, error } = useQuery(
    ['invoices', { search: searchTerm, status: statusFilter, block: blockFilter, page: currentPage, company_id: selectedCompanyId }],
    () => invoiceAPI.getInvoices({
      search: searchTerm || undefined,
      status: statusFilter || undefined,
      invoice_block: blockFilter || undefined,
      page: currentPage,
      company_id: selectedCompanyId || undefined,
    }),
    {
      keepPreviousData: true,
      select: (response) => response.data,
    }
  );

  const deleteInvoiceMutation = useMutation(
    (id) => invoiceAPI.deleteInvoice(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('invoices');
        toast.success('Számla törölve');
      },
      onError: () => {
        toast.error('Hiba történt a számla törlése során');
      },
    }
  );

  const submitToNAVMutation = useMutation(
    (id) => invoiceAPI.submitToNAV(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('invoices');
        toast.success('Számla elküldve a NAV-nak');
      },
      onError: (e) => {
        const msg = e?.response?.data?.error || e?.response?.data?.error_message || e?.message || 'Hiba történt a NAV-nak való küldés során';
        toast.error(msg);
        if (e?.response?.data?.func_code) {
          // optional console detail to debug NAV funcCode
          // eslint-disable-next-line no-console
          console.warn('NAV func_code:', e.response.data.func_code);
        }
      },
    }
  );

  const handleDelete = (id) => {
    if (window.confirm('Biztosan törölni szeretné ezt a számlát?')) {
      deleteInvoiceMutation.mutate(id);
    }
  };

  const handleSubmitToNAV = (id) => {
    if (window.confirm('Biztosan elküldi ezt a számlát a NAV-nak?')) {
      submitToNAVMutation.mutate(id);
    }
  };

  const handleCheckNAVStatus = async (id) => {
    try {
      setNavStatusLoading((s) => ({ ...s, [id]: true }));
      const res = await invoiceAPI.getNAVStatus(id);
      const data = res.data || {};
      setNavStatusMap((m) => ({
        ...m,
        [id]: {
          processing_status: data.processing_status || data.invoice_status || 'ismeretlen',
          error: data.error_message || data.error || null,
          success: data.success !== false,
        },
      }));
    } catch (e) {
      setNavStatusMap((m) => ({
        ...m,
        [id]: { processing_status: 'ismeretlen', error: 'Lekérdezési hiba', success: false },
      }));
    } finally {
      setNavStatusLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const handleStornoConfirm = async () => {
    if (!stornoInvoice) return;
    
    setStornoProcessing(true);
    try {
      let createdIds = [];
      
      if (stornoInvoice.invoice_category === 'ADVANCE') {
        const { data } = await invoiceAPI.advanceUsage(stornoInvoice.id);
        const finals = data?.results || [];
        if (finals.length) {
          // Cascade storno for advance invoices
          const response = await invoiceAPI.cascadeStorno(stornoInvoice.id);
          createdIds = response.data?.created_storno_ids || [];
        } else {
          const response = await invoiceAPI.storno(stornoInvoice.id);
          createdIds = response.data?.created_storno_ids || [response.data?.id];
        }
      } else {
        const response = await invoiceAPI.storno(stornoInvoice.id);
        createdIds = response.data?.created_storno_ids || [response.data?.id];
      }
      
      // Automatikusan NAV-hoz küldés minden létrehozott sztornó számláról
      for (const id of createdIds) {
        if (id) {
          try {
            await invoiceAPI.submitToNAV(id);
          } catch (navErr) {
            console.error('NAV submission error for invoice', id, navErr);
            toast.error(`Hiba a NAV-hoz küldés során: ${id}`);
          }
        }
      }
      
      toast.success('Sztornózás kész és elküldve a NAV-nak!');
      setStornoModalOpen(false);
      setStornoInvoice(null);
      queryClient.invalidateQueries('invoices');
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Hiba történt a sztornózás során';
      toast.error(msg);
    } finally {
      setStornoProcessing(false);
    }
  };

  const openEmailModal = async (invoice) => {
    setEmailInvoice(invoice);
    setBulkMode(false);
    const defTo = [];
    if (invoice?.customer?.email) defTo.push(invoice.customer.email);
  let subject = `Számla ${invoice.invoice_number}`;
  const company = invoice?.company || {};
  const customer = invoice?.customer || {};
  const userName = localStorage.getItem('userFullName') || '';
  const userPhone = localStorage.getItem('userPhone') || '';
  const companyShort = company.short_name || company.name || '';
  const companyWebsite = company.website || '';
  const companyAddr = [company.postal_code, company.city, [company.street_name, company.street_number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const companyTax = company.full_tax_number || company.tax_number || '';
  const row = `${invoice.invoice_number}\t${invoice.issue_date}\t${(invoice.total_net_amount||0).toLocaleString('hu-HU')} (HUF)\t${(invoice.total_vat_amount||0).toLocaleString('hu-HU')} (HUF)`;
  let body = [
    `Tisztelt ${customer.name || 'Ügyfelünk'}!`,
    '',
    'Mellékelve küldöm az alábbi számlát/számlákat:',
    '',
    'Számla sorszám\tKelt\tNetto(HUF)\tÁfa(HUF)',
    row,
    '',
    'Kérem nyomtassa ki és továbbítsa könyvelőjének.',
    '',
    'A küldött számla nem E-számla, a befogadónak a kinyomtatott, papír alapú számlát kell könyvelésében rögzítenie, tárolnia.',
    '',
    'A számlák aláírás és pecsét nélkül is érvényes!',
    '--',
    'Üdvözlettel,',
    userName,
    userPhone,
    companyWebsite,
    companyShort,
    `${companyAddr}`,
    `${companyTax}`,
  ].join('\n');
    let defaultFrom = invoice?.company?.email || '';
    let defaultReplyTo = defaultFrom;
    let defaultUseThunderbird = false;
    let defaultThunderbirdPath = '';
    try {
      const companyId = invoice?.company?.id || localStorage.getItem('selectedCompanyId');
      if (companyId) {
        const res = await emailSettingsAPI.getSettings({ company_id: companyId });
        const s = (res.data?.results && res.data.results[0]) || (Array.isArray(res.data) ? res.data[0] : res.data);
        if (s) {
          if (s.smtp_from) {
             defaultFrom = s.smtp_from;
             defaultReplyTo = s.smtp_from;
          }
          defaultUseThunderbird = !!s.use_thunderbird;
          defaultThunderbirdPath = s.thunderbird_path || '';
          const bilingual = (invoice.currency || '').toUpperCase() !== 'HUF';

          // Generate items table string
          let itemsTable = 'Megnevezés\tMennyiség\tNettó ár\tBruttó ár';
          if (Array.isArray(invoice.items)) {
             const lines = invoice.items.map(item => {
                 const n = item.name || '';
                 const q = `${item.quantity || 0} ${item.unit || ''}`;
                 const net = (item.net_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                 const gr = (item.gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                 return `${n}\t${q}\t${net}\t${gr}`;
             });
             if (lines.length > 0) itemsTable += '\n' + lines.join('\n');
          }

          const fill = (tpl) => (tpl || '')
            .replace(/{invoice_number}/g, invoice.invoice_number || '')
            .replace(/{customer_name}/g, invoice.customer?.name || '')
            .replace(/{company_name}/g, invoice.company?.name || '')
            .replace(/{due_date}/g, invoice.due_date || '')
            .replace(/{total}/g, `${(invoice.total_gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${invoice.currency || ''}`)
            .replace(/{invoice_items_table}/g, itemsTable);

          if (s.default_subject_template) subject = fill(s.default_subject_template);
          if (s.default_body_template) body = fill(s.default_body_template);
          if (bilingual) {
            const enSubj = fill(s.subject_template_en) || `Invoice ${invoice.invoice_number}`;
            const enBody = fill(s.body_template_en) || `Dear ${invoice.customer?.name || 'Customer'},\n\nPlease find attached invoice ${invoice.invoice_number}.\n\nBest regards,\n${invoice.company?.name || ''}`;
            subject = `${enSubj} / ${subject}`;
            body = `${enBody}\n\n---\n\n${body}`;
          }
        }
      }
    } catch (e) {}
    setEmailDefaults({
      defaultFrom,
      defaultReplyTo,
      defaultTo: defTo,
      defaultCc: [],
      defaultBcc: [],
      defaultSubject: subject,
      defaultBody: body,
      defaultUseThunderbird: false,
      defaultThunderbirdPath: '',
    });
    setEmailModalOpen(true);
  };

  const openBulkEmailModal = async () => {
    const list = (invoices?.results || []).filter(inv => selectedIds.has(inv.id));
    if (!list.length) return;
    setEmailInvoice(null);
    setBulkMode(true);
    const companyId = list[0]?.company?.id || localStorage.getItem('selectedCompanyId');
    let defaultFrom = list[0]?.company?.email || '';
    let defaultReplyTo = defaultFrom;
    let to = [];
    const sameCustomer = list.every(inv => inv.customer?.id === list[0]?.customer?.id);
    if (sameCustomer && list[0]?.customer?.email) to = [list[0].customer.email];
    let subject = '';
    let body = '';
    let defaultUseThunderbird = false;
    let defaultThunderbirdPath = '';
    try {
      if (companyId) {
        const res = await emailSettingsAPI.getSettings({ company_id: companyId });
        const s = (res.data?.results && res.data.results[0]) || (Array.isArray(res.data) ? res.data[0] : res.data);
        if (s) {
          if (s.smtp_from) {
             defaultFrom = s.smtp_from;
             defaultReplyTo = s.smtp_from;
          }
          defaultUseThunderbird = !!s.use_thunderbird;
          defaultThunderbirdPath = s.thunderbird_path || '';
          const fill = (tpl, inv) => (tpl || '')
            .replace('{invoice_number}', (inv?.invoice_number) || '')
            .replace('{customer_name}', (inv?.customer?.name) || list[0]?.customer?.name || '')
            .replace('{company_name}', list[0]?.company?.name || '');
          if (s.default_subject_template) subject = fill(s.default_subject_template, list[0]);
          if (s.default_body_template) body = fill(s.default_body_template, list[0]);
          const anyFx = list.some(inv => (inv.currency || '').toUpperCase() !== 'HUF');
          if (anyFx) {
            const enSubj = fill(s.subject_template_en, list[0]) || `Invoice ${list[0]?.invoice_number || ''}`;
            const enBody = fill(s.body_template_en, list[0]) || `Dear ${list[0]?.customer?.name || 'Customer'},\n\nPlease find attached invoice(s).\n\nBest regards,\n${list[0]?.company?.name || ''}`;
            subject = subject ? `${subject} / ${enSubj}` : enSubj;
            body = body ? `${body}\n\n---\n\n${enBody}` : enBody;
          }
          if (defaultUseThunderbird) {
            try {
              const resDraft = await invoiceAPI.draftBulkEML({
                invoice_ids: list.map(i=>i.id),
                to,
                cc: [],
                bcc: [],
                subject,
                body,
              });
              const blob = new Blob([resDraft.data], { type: 'message/rfc822' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `invoices_${list.length}_db.eml`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
              toast.success('EML letöltve');
              return; // do not open modal
            } catch (err) {
              toast.error('EML generálási hiba');
              return;
            }
          }
        }
      }
    } catch (e) {}

    if (!body) {
      const rows = [
        'Számla sorszám\tKelt\tNetto(HUF)\tÁfa(HUF)'
      ];
      list.forEach(inv => {
        rows.push(`${inv.invoice_number}\t${inv.issue_date}\t${(inv.total_net_amount||0).toLocaleString('hu-HU')} (HUF)\t${(inv.total_vat_amount||0).toLocaleString('hu-HU')} (HUF)`);
      });
      const header = [
        `Tisztelt ${list[0]?.customer?.name || 'Ügyfelünk'}!`,
        '',
        'Mellékelve küldöm az alábbi számlát/számlákat:',
        '',
      ];
      const footer = [
        '',
        'Kérem nyomtassa ki és továbbítsa könyvelőjének.',
        '',
        'A küldött számla nem E-számla, a befogadónak a kinyomtatott, papír alapú számlát kell könyvelésében rögzítenie, tárolnia.',
        '',
        'A számlák aláírás és pecsét nélkül is érvényes!'
      ];
      body = [...header, ...rows, ...footer].join('\n');
    }
    if (!subject) {
      subject = list.length === 1 ? `Számla ${list[0].invoice_number}` : `Számlák: ${list.map(i=>i.invoice_number).join(', ')}`;
    }

    setEmailDefaults({
      defaultFrom,
      defaultReplyTo,
      defaultTo: to,
      defaultCc: [],
      defaultBcc: [],
      defaultSubject: subject,
      defaultBody: body,
      invoiceIds: list.map(i=>i.id),
      defaultUseThunderbird,
      defaultThunderbirdPath,
    });
    setEmailModalOpen(true);
  };

  const sendEmailFromModal = async (payload) => {
    try {
      if (bulkMode) {
        const ids = emailDefaults?.invoiceIds || Array.from(selectedIds);
        await invoiceAPI.sendBulkEmail({ ...payload, invoice_ids: ids });
      } else {
        if (!emailInvoice) return;
        await invoiceAPI.sendEmail(emailInvoice.id, payload);
      }
      toast.success('E-mail elküldve');
      queryClient.invalidateQueries('invoices');
      if (bulkMode) setSelectedIds(new Set());
    } catch (e) {
      const msg = e?.response?.data?.error || 'E-mail küldési hiba';
      toast.error(msg);
      throw e; // keep modal button state consistent
    }
  };

  const formatCurrency = (amount, currency = 'HUF') => {
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'HUF' ? 0 : 2,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('hu-HU');
  };

  const getStatusLabel = (status) => {
    const labels = {
      'draft': 'Draft',
      'sent': 'Elküldve',
      'paid': 'Fizetve',
      'cancelled': 'Törölve',
      'submitted_to_nav': 'NAV-ban',
      'nav_processed': 'NAV feldolgozva',
      'nav_rejected': 'NAV elutasítva',
    };
    return labels[status] || status;
  };

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (error) {
    return (
      <div style={{ color: '#e74c3c', textAlign: 'center', padding: '40px' }}>
        Hiba történt az adatok betöltése során
      </div>
    );
  }

  return (
    <>
    <InvoicesContainer>
      <InvoicesHeader>
        <Title>Számlák</Title>
        <SearchContainer>
          <SearchInput
            type="text"
            placeholder="Keresés számlaszám, ügyfél vagy megjegyzés alapján..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Összes státusz</option>
            <option value="draft">Draft</option>
            <option value="sent">Elküldve</option>
            <option value="paid">Fizetve</option>
            <option value="cancelled">Törölve</option>
            <option value="submitted_to_nav">NAV-ban</option>
            <option value="nav_processed">NAV feldolgozva</option>
            <option value="nav_rejected">NAV elutasítva</option>
          </FilterSelect>
          <FilterSelect
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            <option value="">Összes számlatömb</option>
            {(invoiceBlocks || []).map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.prefix})
              </option>
            ))}
          </FilterSelect>
          <ActionButton to="/invoices/new">
            <Plus size={16} />
            Új számla
          </ActionButton>
        </SearchContainer>
      </InvoicesHeader>

      <TableContainer>
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>
                <input
                  type="checkbox"
                  onChange={(e)=>{
                    const checked = e.target.checked;
                    const set = new Set(selectedIds);
                    const rows = invoices?.results || [];
                    if (checked) rows.forEach(inv=>set.add(inv.id));
                    else rows.forEach(inv=>set.delete(inv.id));
                    setSelectedIds(set);
                  }}
                  checked={(invoices?.results || []).length>0 && (invoices?.results || []).every(inv=>selectedIds.has(inv.id))}
                />
              </TableHeaderCell>
              <TableHeaderCell>Számlaszám</TableHeaderCell>
              <TableHeaderCell>Ügyfél</TableHeaderCell>
              <TableHeaderCell>Kelt</TableHeaderCell>
              <TableHeaderCell>Teljesítés</TableHeaderCell>
              <TableHeaderCell>Esedékesség</TableHeaderCell>
              <TableHeaderCell>Fizetési mód</TableHeaderCell>
              <TableHeaderCell>Összeg</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {(() => {
              const list = invoices?.results || [];
              const isStorno = (inv) => (inv?.notes || '').toLowerCase().includes('sztornó');
              // Gyűjtsük az eredeti -> sztornó számlák mappingot, és az eredetik készletét
              const stornoByOriginal = new Map();
              list.forEach(inv => {
                if (isStorno(inv)) {
                  const orig = inv.original_invoice_number || inv.order_reference;
                  if (orig) {
                    const arr = stornoByOriginal.get(orig) || [];
                    arr.push(inv.invoice_number);
                    stornoByOriginal.set(orig, arr);
                  }
                }
              });
              const stornoOriginals = new Set(stornoByOriginal.keys());

              const payLabel = (pm) => ({
                transfer: 'Átutalás',
                cash: 'Készpénz',
                card: 'Bankkártya',
                voucher: 'Utalvány',
                cod: 'Utánvét',
                other: 'Egyéb',
              })[pm] || pm;

              return list.map((invoice) => {
                const isSt = isStorno(invoice) || stornoOriginals.has(invoice.invoice_number);
                const isPaid = (invoice.status === 'paid') || (invoice.payment_method && !['transfer','cod'].includes(invoice.payment_method));
                const isCancelled = invoice.status === 'cancelled';
                const isUnpaid = !isPaid && !isCancelled; // minden nem-fizetett (draft, sent, részben fizetett, stb.)
                return (
              <TableRow key={invoice.id} $storno={isSt} $cancelled={isCancelled} $paid={isPaid} $unpaid={isUnpaid}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(invoice.id)}
                    onChange={(e)=>{
                      const set = new Set(selectedIds);
                      if (e.target.checked) set.add(invoice.id); else set.delete(invoice.id);
                      setSelectedIds(set);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div>{invoice.invoice_number}</div>
                  {invoice.invoice_category === 'ADVANCE' && (
                    <div style={{ fontSize: 12, color: '#8e44ad' }}>
                      előleg
                    </div>
                  )}
                  {invoice.invoice_category === 'FINAL' && Array.isArray(invoice.advances_used) && invoice.advances_used.length > 0 && (
                    <div style={{ fontSize: 12, color: '#2c3e50' }}>
                      Felhasznált előlegek: {invoice.advances_used.map(a => a.invoice_number).join(', ')}
                    </div>
                  )}
                  {isStorno(invoice) && (
                    <div style={{ fontSize: 12, color: '#e74c3c' }}>
                      Eredeti: {invoice.original_invoice_number || invoice.order_reference || '—'}
                    </div>
                  )}
                  {(!isStorno(invoice) && stornoByOriginal.has(invoice.invoice_number)) && (
                    <div style={{ fontSize: 12, color: '#e74c3c' }}>
                      Sztornózott: {stornoByOriginal.get(invoice.invoice_number).join(', ')}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span title={invoice.customer.name}>
                    {(() => { const n = invoice.customer.name || ''; return n.length > 30 ? (n.slice(0,30) + '…') : n; })()}
                  </span>
                </TableCell>
                <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                <TableCell>{invoice.delivery_date ? formatDate(invoice.delivery_date) : '—'}</TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell>{payLabel(invoice.payment_method)}</TableCell>
                <TableCell>
                  {(() => {
                    const amount = parseFloat(invoice.total_gross_amount || 0);
                    const curr = invoice.currency || 'HUF';
                    const rate = parseFloat(invoice.exchange_rate || 1);
                    return (
                      <>
                        <div style={{ fontWeight: 500 }}>{formatCurrency(amount, curr)}</div>
                        {curr !== 'HUF' && (
                          <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2 }}>
                            {formatCurrency(amount * rate, 'HUF')}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status}>
                    {getStatusLabel(invoice.status)}
                  </StatusBadge>
                  {navStatusLoading[invoice.id] && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#7f8c8d' }}>
                      (lekérdezés...)
                    </span>
                  )}
                  {navStatusMap[invoice.id] && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: '#2c3e50' }}>
                        NAV: {navStatusMap[invoice.id].processing_status}
                      </span>
                      {navStatusMap[invoice.id].error && (
                        <div style={{ fontSize: 12, color: '#e74c3c' }}>
                          Hiba: {navStatusMap[invoice.id].error}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    {/* Előnézet (nyomtatási kép) gomb eltávolítva kérésre */}
                    <IconButton
                      variant="view"
                      title="Megnyitás (olvasás)"
                      as={Link}
                      to={`/invoices/${invoice.id}/edit?mode=view`}
                    >
                      <Eye size={16} />
                    </IconButton>
                    <IconButton
                      variant="copy"
                      title="Új számla a meglévő alapján"
                      as={Link}
                      to={`/invoices/new?copy_from=${invoice.id}`}
                    >
                      <Copy size={16} />
                    </IconButton>
                    <IconButton
                      variant="correct"
                      title="Helyesbítő számla készítése"
                      as={Link}
                      to={`/invoices/new?correct_from=${invoice.id}`}
                    >
                      <FileDiff size={16} />
                    </IconButton>
                    {!isStorno(invoice) && (
                      <IconButton
                        variant="storno"
                        title="Sztornó számla készítése"
                        onClick={(e) => {
                          e.preventDefault();
                          setStornoInvoice(invoice);
                          setStornoModalOpen(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                    {((!invoice.nav_transaction_id) || invoice.status === 'draft' || invoice.status === 'nav_rejected') && (
                      <IconButton
                        variant="nav"
                        title="NAV-nak küldés"
                        onClick={() => handleSubmitToNAV(invoice.id)}
                        style={{ position: 'relative', fontSize: '10px', fontWeight: 'bold' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <ArrowUp size={10} />
                          <span style={{ fontSize: 8 }}>NAV</span>
                        </div>
                      </IconButton>
                    )}
                    <IconButton
                      variant="nav"
                      title={['draft','nav_rejected'].includes(invoice.status) ? 'Újraküldés a NAV-nak' : 'NAV státusz lekérdezése'}
                      onClick={() => {
                        if (['draft','nav_rejected'].includes(invoice.status)) {
                          if (window.confirm('Elküldöd a számlát a NAV-nak?')) {
                            submitToNAVMutation.mutate(invoice.id);
                          }
                        } else {
                          handleCheckNAVStatus(invoice.id);
                        }
                      }}
                      style={{ position: 'relative', fontSize: '10px', fontWeight: 'bold' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <RefreshCw size={10} />
                        <span style={{ fontSize: 8 }}>NAV</span>
                      </div>
                    </IconButton>
                    <IconButton
                      variant="email"
                      title="Számla küldése e-mailben (PDF)"
                      onClick={() => openEmailModal(invoice)}
                    >
                      <Mail size={16} />
                    </IconButton>
                    {/* Törlés letiltva: csak sztornó */}
                  </ActionButtons>
                </TableCell>
              </TableRow>
              );});
            })()}
          </TableBody>
        </Table>
      </TableContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div>{selectedIds.size} kiválasztva</div>
        <div>
          <button onClick={openBulkEmailModal} disabled={selectedIds.size===0} style={{ padding: '8px 12px' }}>
            Kijelöltek e-mailben küldése
          </button>
        </div>
      </div>

      {(!invoices?.results || invoices.results.length === 0) && (
        <EmptyState>
          <p>Nincsenek számlák</p>
          <ActionButton to="/invoices/new" style={{ marginTop: '16px' }}>
            <Plus size={16} />
            Új számla létrehozása
          </ActionButton>
        </EmptyState>
      )}

      {invoices?.count > 0 && (
        <Pagination>
          <PaginationButton
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={!invoices.previous}
          >
            Előző
          </PaginationButton>
          
          {Array.from({ length: Math.ceil(invoices.count / 20) }, (_, i) => i + 1)
            .slice(Math.max(0, currentPage - 3), currentPage + 2)
            .map((page) => (
              <PaginationButton
                key={page}
                className={page === currentPage ? 'active' : ''}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </PaginationButton>
            ))}
          
          <PaginationButton
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={!invoices.next}
          >
            Következő
          </PaginationButton>
        </Pagination>
      )}
    </InvoicesContainer>
    {emailModalOpen && (
      <EmailModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onSend={sendEmailFromModal}
        defaultFrom={emailDefaults.defaultFrom}
        defaultReplyTo={emailDefaults.defaultReplyTo}
        defaultTo={emailDefaults.defaultTo}
        defaultCc={emailDefaults.defaultCc}
        defaultBcc={emailDefaults.defaultBcc}
        defaultSubject={emailDefaults.defaultSubject}
        defaultBody={emailDefaults.defaultBody}
        customerId={bulkMode ? null : emailInvoice?.customer?.id}
        invoiceId={bulkMode ? null : emailInvoice?.id}
        attachmentsHint={bulkMode ? 'A kijelölt számlák PDF-jei csatolva lesznek a levélhez.' : null}
        defaultUseThunderbird={emailDefaults.defaultUseThunderbird}
        defaultThunderbirdPath={emailDefaults.defaultThunderbirdPath}
      />
    )}
    {stornoModalOpen && stornoInvoice && (
      <Modal
        isOpen={stornoModalOpen}
        title="Sztornó számla készítése"
        onClose={() => !stornoProcessing && setStornoModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setStornoModalOpen(false)}
              disabled={stornoProcessing}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: 4,
                background: '#fff',
                cursor: stornoProcessing ? 'not-allowed' : 'pointer',
                opacity: stornoProcessing ? 0.5 : 1,
              }}
            >
              Mégse
            </button>
            <button
              onClick={handleStornoConfirm}
              disabled={stornoProcessing}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 4,
                background: '#e74c3c',
                color: '#fff',
                fontWeight: 500,
                cursor: stornoProcessing ? 'not-allowed' : 'pointer',
                opacity: stornoProcessing ? 0.5 : 1,
              }}
            >
              {stornoProcessing ? 'Feldolgozás...' : 'Igen, sztornózom'}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 16px 0', fontWeight: 500 }}>
            Biztosan sztornózni szeretnéd a következő számlát?
          </p>
          <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 6, marginBottom: 16 }}>
            <div><strong>Számlaszám:</strong> {stornoInvoice.invoice_number}</div>
            <div><strong>Ügyfél:</strong> {stornoInvoice.customer?.name}</div>
            <div><strong>Összeg:</strong> {formatCurrency(stornoInvoice.total_gross_amount, stornoInvoice.currency)}</div>
          </div>
          
          {/* Tételek táblázat */}
          {Array.isArray(stornoInvoice.items) && stornoInvoice.items.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Sztornózandó tételek:</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  fontSize: 13,
                  border: '1px solid #ddd'
                }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Megnevezés</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Cikkszám</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Mennyiség</th>
                      <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Egység</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Nettó</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Nettó összesen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stornoInvoice.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px' }}>{item.description}</td>
                        <td style={{ padding: '8px' }}>{item.product_code_value || '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{item.unit_of_measure || 'db'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unit_price, stornoInvoice.currency)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.net_amount, stornoInvoice.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {stornoInvoice.invoice_category === 'ADVANCE' && (
            <p style={{ color: '#e67e22', marginBottom: 12, fontSize: 14 }}>
              <strong>Figyelem:</strong> Ez egy előleg számla. Ha már felhasználásra került végszámlákon, 
              azok is sztornózásra kerülnek.
            </p>
          )}
          {Array.isArray(stornoInvoice.advances_used) && stornoInvoice.advances_used.length > 0 && (
            <p style={{ color: '#e67e22', marginBottom: 12, fontSize: 14 }}>
              <strong>Figyelem:</strong> Ez a végszámla előlegeket használt fel. 
              A sztornózás visszavonja ezeket a felhasználásokat.
            </p>
          )}
          <p style={{ margin: '0', fontSize: 14, color: '#27ae60', fontWeight: 500 }}>
            A sztornó számla létrehozása után automatikusan elküldésre kerül a NAV-hoz.
          </p>
        </div>
      </Modal>
    )}
  </>
  );
};

export default Invoices;
