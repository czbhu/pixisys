import React from 'react';
import styled from 'styled-components';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import api, { bankStatementsAPI, companyBankAccountAPI, invoiceAPI, companyAPI, customerAPI } from '../services/api';
import { toast } from 'react-toastify';
import { useParams, useNavigate } from 'react-router-dom';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
`;

const Header = styled.div`
  padding: 20px;
  border-bottom: 1px solid #ecf0f1;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: #2c3e50;
`;

const Content = styled.div`
  padding: 20px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
`;

const Field = styled.div``;
const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  color: #34495e;
`;
const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
`;
const Select = styled.select`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
`;

const SearchRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;
const Button = styled.button`
  padding: 8px 14px;
  background: ${props => props.variant === 'secondary' ? '#95a5a6' : '#3498db'};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;
const Th = styled.th`
  text-align: left;
  padding: 10px;
  border-bottom: 1px solid #ecf0f1;
  background: #f8f9fa;
`;
const Td = styled.td`
  padding: 10px;
  border-bottom: 1px solid #ecf0f1;
`;

const TotalBar = styled.div`
  display: flex;
  justify-content: flex-end;
  font-weight: 600;
  color: #2c3e50;
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
`;

const ModalContent = styled.div`
  width: 90%;
  max-width: 860px;
  max-height: 90vh;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.h3`
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
`;

const ModalBody = styled.div`
  padding: 16px;
  overflow: auto;
`;


const BankStatementForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { register, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: {
      statement_date: new Date().toISOString().slice(0, 10),
      sequence_number: '',
      bank_account: '',
      note: '',
    }
  });

  const normalizeCompanyId = React.useCallback((value) => {
    const normalized = (value || '').toString().trim();
    if (!normalized || normalized === 'null' || normalized === 'undefined') {
      return null;
    }
    return normalized;
  }, []);

  const [selectedCompanyId, setSelectedCompanyId] = React.useState(() => {
    try { return normalizeCompanyId(localStorage.getItem('selectedCompanyId')); } catch { return null; }
  });
  const prevSelectedCompanyIdRef = React.useRef(selectedCompanyId);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState({}); // invoiceId -> { invoice, note, amount }
  const [editItems, setEditItems] = React.useState([]); // saved statement items in edit mode
  const [manualRows, setManualRows] = React.useState([]);
  const [addInvoiceModal, setAddInvoiceModal] = React.useState({
    open: false,
    mode: 'outgoing',
    customerId: '',
    customerSearch: '',
    invoiceSearch: '',
    selectedInvoiceId: '',
    loading: false,
    invoices: [],
  });
  const queryClient = useQueryClient();

  const { data: companies } = useQuery(
    ['companies'],
    () => companyAPI.getCompanies({ is_active: true }),
    { select: (res) => res.data?.results || res.data || [] }
  );

  const { data: modalCustomers } = useQuery(
    ['customers-for-bank-statement-modal', { company_id: selectedCompanyId, search: addInvoiceModal.customerSearch }],
    () => customerAPI.getCustomers({
      company_id: selectedCompanyId,
      is_active: true,
      page_size: 1000,
      search: (addInvoiceModal.customerSearch || '').trim() || undefined,
    }),
    {
      select: (res) => res.data?.results || res.data || [],
      enabled: !!selectedCompanyId && !!addInvoiceModal.open,
      keepPreviousData: true,
    }
  );

  React.useEffect(() => {
    const syncCompany = () => {
      try {
        setSelectedCompanyId(normalizeCompanyId(localStorage.getItem('selectedCompanyId')));
      } catch {
        setSelectedCompanyId(null);
      }
    };
    window.addEventListener('companyChanged', syncCompany);
    return () => window.removeEventListener('companyChanged', syncCompany);
  }, [normalizeCompanyId]);

  React.useEffect(() => {
    const prevCompanyId = prevSelectedCompanyIdRef.current;
    if (!isEdit && prevCompanyId !== null && selectedCompanyId !== prevCompanyId) {
      setSelected({});
    }
    prevSelectedCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId, isEdit]);

  const { data: accounts } = useQuery(
    ['company-bank-accounts', { company_id: selectedCompanyId }],
    () => companyBankAccountAPI.getAccounts(selectedCompanyId ? { company_id: selectedCompanyId } : {}),
    { select: (res) => res.data?.results || res.data || [] }
  );

  // Default to primary bank account on load (new mode)
  React.useEffect(() => {
    if (isEdit) return;
    const current = watch('bank_account');
    if (current) return;
    const primary = (accounts || []).find(a => a.is_primary) || (accounts || [])[0];
    if (primary) setValue('bank_account', primary.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, isEdit]);

  // Auto-increment sequence number when bank account changes (new mode)
  React.useEffect(() => {
    if (isEdit) return;
    const acct = watch('bank_account');
    if (!acct) return;
    (async () => {
      try {
        const res = await bankStatementsAPI.getStatements({ bank_account: acct, page_size: 1 });
        const rows = res.data?.results || res.data || [];
        const last = rows[0];
        const buildNext = (prev) => {
          const s = (prev || '').toString().trim();
          if (!s) {
            return new Date().getFullYear() + '/001';
          }
          const m = s.match(/^(.*?)(\d+)$/);
          if (m) {
            const prefix = m[1];
            const digits = m[2];
            const width = digits.length;
            const n = (parseInt(digits, 10) || 0) + 1;
            return prefix + String(n).padStart(width, '0');
          }
          return s + '/001';
        };
        const next = buildNext(last ? last.sequence_number : '');
        setValue('sequence_number', next);
      } catch (e) {
        // ignore, backend still autogenerates if empty
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('bank_account'), isEdit]);

  const { data: unpaid, refetch, isFetching } = useQuery(
    ['unpaid-invoices', { search, company_id: selectedCompanyId }],
    () => invoiceAPI.getUnpaidInvoices({ search, company_id: selectedCompanyId }),
    {
      select: (res) => res.data?.results || res.data?.results || [],
      keepPreviousData: true,
      enabled: !!selectedCompanyId && !isEdit,
    }
  );

  const rows = React.useMemo(() => {
    if (isEdit) {
      const q = String(search || '').trim().toLowerCase();
      if (!q) return editItems || [];
      return (editItems || []).filter((it) => {
        const invNo = String(it?.invoice_number || '').toLowerCase();
        const customerName = String(it?.customer_name || '').toLowerCase();
        const note = String(it?.note || '').toLowerCase();
        return invNo.includes(q) || customerName.includes(q) || note.includes(q);
      });
    }

    const baseAll = unpaid || [];
    const hasCompanyIdInPayload = baseAll.some((inv) => inv && inv.company_id);
    const base = selectedCompanyId
      ? (hasCompanyIdInPayload
          ? baseAll.filter((inv) => String(inv.company_id || '') === String(selectedCompanyId))
          : baseAll)
      : [];
    const manual = Array.isArray(manualRows) ? manualRows : [];
    const seen = new Set(manual.map((inv) => String(inv?.id || '')));
    return [...manual, ...base.filter((inv) => !seen.has(String(inv?.id || '')))];
  }, [unpaid, isEdit, selectedCompanyId, search, editItems, manualRows]);

  const closeAddInvoiceModal = React.useCallback(() => {
    setAddInvoiceModal({
      open: false,
      mode: 'outgoing',
      customerId: '',
      customerSearch: '',
      invoiceSearch: '',
      selectedInvoiceId: '',
      loading: false,
      invoices: [],
    });
  }, []);

  const openAddInvoiceModal = React.useCallback((mode) => {
    setAddInvoiceModal({
      open: true,
      mode,
      customerId: '',
      customerSearch: '',
      invoiceSearch: '',
      selectedInvoiceId: '',
      loading: false,
      invoices: [],
    });
  }, []);

  const loadModalInvoices = React.useCallback(async () => {
    if (!selectedCompanyId) {
      toast.error('Válassz céget.');
      return;
    }
    const customer = (modalCustomers || []).find((c) => String(c?.id) === String(addInvoiceModal.customerId));
    if (!customer) {
      toast.info('Előbb válassz ügyfelet.');
      return;
    }

    const normText = (v) => String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normDigits = (v) => String(v || '').replace(/\D+/g, '');
    const customerNameNorm = normText(customer?.name || '');
    const customerTaxCandidates = [customer?.tax_number, customer?.full_tax_number, customer?.vat_group_member_tax_number]
      .map(normDigits)
      .filter(Boolean);

    setAddInvoiceModal((prev) => ({ ...prev, loading: true, invoices: [], selectedInvoiceId: '' }));
    try {
      if (addInvoiceModal.mode === 'outgoing') {
        const searchVal = (addInvoiceModal.invoiceSearch || '').trim();
        const res = await invoiceAPI.getUnpaidInvoices({
          company_id: selectedCompanyId,
          customer_id: customer.id,
          search: searchVal || undefined,
        });
        const list = (res?.data?.results || res?.data || []).map((inv) => ({
          id: String(inv?.id),
          row_id: String(inv?.id),
          invoice_type: 'outgoing',
          invoice_number: inv?.invoice_number || String(inv?.id),
          customer_id: customer.id,
          customer_name: customer.name,
          currency: inv?.currency || 'HUF',
          gross_amount: Number(inv?.gross_amount || 0),
          outstanding: Number(inv?.outstanding || inv?.gross_amount || 0),
        }));
        setAddInvoiceModal((prev) => ({ ...prev, loading: false, invoices: list }));
      } else {
        const searchVal = (addInvoiceModal.invoiceSearch || '').trim() || customer.name;
        const res = await api.get('/api/invoices/incoming/', {
          params: {
            company_id: selectedCompanyId,
            page: 1,
            page_size: 1000,
            search: searchVal,
          },
        });
        const items = res?.data?.items || [];
        const filtered = items.filter((inv) => {
          const supplierNameNorm = normText(inv?.supplierName);
          const supplierTax = normDigits(inv?.supplierTaxNumber);
          const taxMatch = customerTaxCandidates.some((ct) => supplierTax && (supplierTax === ct || (ct.length >= 8 && supplierTax.length >= 8 && supplierTax.slice(0, 8) === ct.slice(0, 8))));
          const nameMatch = customerNameNorm && supplierNameNorm && (supplierNameNorm.includes(customerNameNorm) || customerNameNorm.includes(supplierNameNorm));
          const gross = Math.abs(Number(inv?.grossAmount || 0));
          const paid = Math.abs(Number(inv?.bankPaidAmount || 0));
          const remaining = gross > 0.0001 ? Math.max(gross - paid, 0) : gross;
          return (taxMatch || nameMatch) && (gross <= 0.0001 || remaining > 0.005);
        }).map((inv) => {
          const gross = Number(inv?.grossAmount || 0);
          const paid = Math.abs(Number(inv?.bankPaidAmount || 0));
          const grossAbs = Math.abs(gross);
          const remainingAbs = grossAbs > 0.0001 ? Math.max(grossAbs - paid, 0) : grossAbs;
          const signedOutstanding = gross >= 0 ? -remainingAbs : remainingAbs;
          return {
            id: `incoming-${inv?.id || inv?.invoiceNumber}`,
            row_id: String(inv?.id || inv?.invoiceNumber),
            invoice_type: 'incoming',
            invoice_number: inv?.invoiceNumber || String(inv?.id),
            customer_id: customer.id,
            customer_name: customer.name,
            currency: inv?.currency || 'HUF',
            gross_amount: gross,
            outstanding: signedOutstanding,
          };
        });
        setAddInvoiceModal((prev) => ({ ...prev, loading: false, invoices: filtered }));
      }
    } catch {
      setAddInvoiceModal((prev) => ({ ...prev, loading: false }));
      toast.error('Számlák betöltése sikertelen.');
    }
  }, [addInvoiceModal.customerId, addInvoiceModal.invoiceSearch, addInvoiceModal.mode, modalCustomers, selectedCompanyId]);

  const addInvoiceFromModal = React.useCallback(() => {
    const picked = (addInvoiceModal.invoices || []).find((inv) => String(inv?.id) === String(addInvoiceModal.selectedInvoiceId));
    if (!picked) {
      toast.info('Válassz számlát.');
      return;
    }

    if (isEdit) {
      const rowKey = `manual-${picked.invoice_type}-${picked.row_id}`;
      setEditItems((prev) => {
        const exists = (prev || []).some((it) => String(it.rowKey || it.id) === String(rowKey));
        if (exists) return prev;
        return [
          {
            rowKey,
            id: null,
            invoice: picked.invoice_type === 'outgoing' ? picked.row_id : null,
            incoming_invoice: picked.invoice_type === 'incoming' ? picked.row_id : null,
            invoice_type: picked.invoice_type,
            invoice_number: picked.invoice_number,
            customer: picked.customer_id,
            customer_name: picked.customer_name,
            currency: picked.currency || 'HUF',
            gross_amount: Number(picked.gross_amount || 0),
            amount: Number(picked.outstanding || 0),
            note: '',
            checked: true,
          },
          ...(prev || []),
        ];
      });
    } else {
      setManualRows((prev) => {
        const exists = (prev || []).some((it) => String(it?.id) === String(picked.id));
        if (exists) return prev;
        return [
          {
            id: picked.id,
            invoice_type: picked.invoice_type,
            source_invoice_id: picked.row_id,
            invoice_number: picked.invoice_number,
            customer_id: picked.customer_id,
            customer_name: picked.customer_name,
            currency: picked.currency || 'HUF',
            gross_amount: Number(picked.gross_amount || 0),
            outstanding: Number(picked.outstanding || 0),
          },
          ...(prev || []),
        ];
      });
      setSelected((prev) => ({
        ...prev,
        [picked.id]: {
          invoice: {
            id: picked.id,
            source_invoice_id: picked.row_id,
            invoice_type: picked.invoice_type,
            invoice_number: picked.invoice_number,
            customer_id: picked.customer_id,
            customer_name: picked.customer_name,
            currency: picked.currency || 'HUF',
            gross_amount: Number(picked.gross_amount || 0),
            outstanding: Number(picked.outstanding || 0),
          },
          amount: Number(picked.outstanding || 0),
          note: '',
        },
      }));
    }
    closeAddInvoiceModal();
  }, [addInvoiceModal.invoices, addInvoiceModal.selectedInvoiceId, closeAddInvoiceModal, isEdit]);

  const createMutation = useMutation(
    (payload) => isEdit ? bankStatementsAPI.updateStatement(id, payload) : bankStatementsAPI.createStatement(payload),
    {
      onSuccess: () => {
        toast.success(isEdit ? 'Bankkivonat frissítve' : 'Bankkivonat mentve és számlák kiegyenlítve');
        queryClient.invalidateQueries('bank-statements');
        setSelected({});
        navigate('/bank-statements');
      },
      onError: () => toast.error('Hiba történt mentés közben'),
    }
  );

  const total = React.useMemo(() => {
    if (isEdit) {
      return (editItems || []).reduce((sum, it) => {
        if (!it?.checked) return sum;
        return sum + Number(it.amount || 0);
      }, 0);
    }
    return Object.values(selected).reduce((s, it) => s + (Number(it.amount || 0)), 0);
  }, [isEdit, editItems, selected]);

  const onToggle = (inv) => {
    if (isEdit) {
      const key = inv.rowKey || inv.id;
      setEditItems((prev) => (prev || []).map((it) => {
        const itKey = it.rowKey || it.id;
        if (String(itKey) !== String(key)) return it;
        return { ...it, checked: !it.checked };
      }));
      return;
    }

    setSelected(prev => {
      const exists = !!prev[inv.id];
      const next = { ...prev };
      if (exists) {
        delete next[inv.id];
      } else {
        const def = typeof inv.outstanding === 'number' ? inv.outstanding : inv.gross_amount;
        next[inv.id] = { invoice: inv, note: '', amount: def };
      }
      return next;
    });
  };

  const onNoteChange = (invId, note) => {
    if (isEdit) {
      setEditItems((prev) => (prev || []).map((it) => {
        const key = it.rowKey || it.id;
        if (String(key) !== String(invId)) return it;
        return { ...it, note };
      }));
      return;
    }
    setSelected(prev => ({ ...prev, [invId]: { ...(prev[invId] || {}), note } }));
  };

  const onSubmit = (values) => {
    const bankAcc = (accounts || []).find(a => a.id === values.bank_account);
    const companyId = bankAcc?.company || companies?.[0]?.id || null;
    if (!companyId) {
      toast.error('Cég nem meghatározható (válassz bankszámlát)');
      return;
    }
    const items = isEdit
      ? (editItems || [])
          .filter((it) => !!it.checked)
          .map((it) => ({
            ...(it.id ? { id: it.id } : {}),
            ...(it.invoice ? { invoice: it.invoice } : {}),
            ...(it.incoming_invoice ? { incoming_invoice: it.incoming_invoice } : {}),
            ...(it.customer ? { customer: it.customer } : {}),
            amount: Number(it.amount || 0),
            note: it.note || '',
          }))
      : Object.values(selected).map(sel => {
          const invoiceType = sel?.invoice?.invoice_type;
          const sourceInvoiceId = sel?.invoice?.source_invoice_id || sel?.invoice?.id;
          return {
            ...(sel.id ? { id: sel.id } : {}),
            ...(invoiceType === 'incoming'
              ? { incoming_invoice: sourceInvoiceId }
              : { invoice: sourceInvoiceId }),
            customer: sel?.invoice?.customer_id,
            amount: Number(sel.amount || 0),
            note: sel.note || ''
          };
        });
    if (!isEdit) {
      if (!items.length) {
        toast.error('Válassz legalább egy kiegyenlítendő számlát');
        return;
      }
    }
    const payload = {
      company: companyId,
      bank_account: values.bank_account || null,
      statement_date: values.statement_date,
      sequence_number: values.sequence_number,
      currency: 'HUF',
      note: values.note || '',
      ...(items ? { items } : {}),
    };
    createMutation.mutate(payload);
  };

  // Load for edit
  useQuery(
    ['bank-statement', id],
    () => bankStatementsAPI.getStatement(id),
    {
      enabled: isEdit,
      select: (res) => res.data,
      onSuccess: (st) => {
        reset({
          statement_date: st.statement_date,
          sequence_number: st.sequence_number,
          bank_account: st.bank_account,
          note: st.note || ''
        });
        const nextSel = {};
        const nextEditItems = [];
        (st.items || []).forEach((it, idx) => {
          const rowKey = it.id || `${it.invoice || it.incoming_invoice || 'row'}-${idx}`;
          const signedAmount = Number(it.amount || 0);
          nextEditItems.push({
            rowKey,
            id: it.id,
            invoice: it.invoice || null,
            incoming_invoice: it.incoming_invoice || null,
            invoice_type: it.invoice_type || null,
            invoice_number: it.invoice_number || '',
            customer: it.customer || null,
            customer_name: it.customer_name || '',
            currency: st.currency || 'HUF',
            gross_amount: signedAmount,
            amount: signedAmount,
            note: it.note || '',
            checked: true,
          });

          if (it.invoice) {
            nextSel[it.invoice] = {
              id: it.id,
              invoice: { id: it.invoice, invoice_number: it.invoice_number, customer_id: it.customer, customer_name: it.customer_name },
              amount: signedAmount,
              note: it.note || ''
            };
          }
        });
        setEditItems(nextEditItems);
        setSelected(nextSel);
      }
    }
  );

  return (
    <Container>
      <Header>
        <Title>{isEdit ? 'Bankkivonat szerkesztése' : 'Új bankkivonat'}</Title>
      </Header>
      <Content>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Row>
            <Field>
              <Label>Dátum</Label>
              <Input type="date" {...register('statement_date')} />
            </Field>
            <Field>
              <Label>Sorszám</Label>
              <Input type="text" placeholder="pl. 2025/001" {...register('sequence_number')} />
            </Field>
            <Field>
              <Label>Bankszámlaszám</Label>
              <Select {...register('bank_account')} value={watch('bank_account')} onChange={(e) => setValue('bank_account', e.target.value)}>
                <option value="">Válassz...</option>
                {(accounts || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name ? `${a.bank_name} - ` : ''}{a.iban || a.account_number}
                  </option>
                ))}
              </Select>
            </Field>
          </Row>

          <Field>
            <Label>Megjegyzés (opcionális)</Label>
            <Input type="text" placeholder="Megjegyzés a kivonathoz" {...register('note')} />
          </Field>

          <div>
            <Label>{isEdit ? 'Mentett tételek' : 'Számlák (kifizetetlen)'}</Label>
            <SearchRow>
              <Input placeholder={isEdit ? 'Gyors keresés mentett tételek között' : 'Gyors keresés ügyfél/számla'} value={search} onChange={(e) => setSearch(e.target.value)} />
              {!isEdit && <Button type="button" onClick={() => refetch()} disabled={isFetching}>Keresés</Button>}
            </SearchRow>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button type="button" onClick={() => openAddInvoiceModal('incoming')} disabled={!selectedCompanyId}>
                Új bejövő számla hozzáadása
              </Button>
              <Button type="button" onClick={() => openAddInvoiceModal('outgoing')} disabled={!selectedCompanyId}>
                Új kimenő számla hozzáadása
              </Button>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <Table>
                <thead>
                  <tr>
                    <Th></Th>
                    <Th>Számlaszám</Th>
                    <Th>Ügyfél</Th>
                    <Th>Devizanem</Th>
                    <Th>Bruttó összeg</Th>
                    <Th>Fizetendő (most)</Th>
                    <Th>Megjegyzés</Th>
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).map((inv) => {
                    const rowKey = isEdit ? (inv.rowKey || inv.id) : inv.id;
                    const checked = isEdit ? !!inv.checked : !!selected[inv.id];
                    return (
                      <tr key={rowKey}>
                        <Td>
                          <input type="checkbox" checked={checked} onChange={() => onToggle(inv)} />
                        </Td>
                        <Td>{inv.invoice_number}</Td>
                        <Td>{inv.customer_name || (!isEdit ? selected[inv.id]?.invoice?.customer_name : '') || ''}</Td>
                        <Td>{inv.currency || 'HUF'}</Td>
                        <Td>
                          {typeof inv.gross_amount === 'number' ? inv.gross_amount.toLocaleString('hu-HU', { minimumFractionDigits: 2 }) : '—'}
                          {typeof inv.amount_paid === 'number' && inv.amount_paid > 0 ? (
                            <div style={{ fontSize: 12, color: '#7f8c8d' }}>
                              Fizetve: {inv.amount_paid.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} — Hátralék: {(inv.outstanding || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2 })}
                            </div>
                          ) : null}
                        </Td>
                        <Td>
                          {checked && (
                            <Input
                              type="number"
                              min={isEdit ? undefined : 0}
                              step="0.01"
                              value={isEdit ? (inv.amount ?? '') : (selected[inv.id]?.amount ?? '')}
                              onChange={(e) => {
                                if (isEdit) {
                                  const value = e.target.value;
                                  setEditItems((prev) => (prev || []).map((it) => {
                                    const key = it.rowKey || it.id;
                                    if (String(key) !== String(rowKey)) return it;
                                    return { ...it, amount: value };
                                  }));
                                  return;
                                }
                                setSelected(prev => ({ ...prev, [inv.id]: { ...(prev[inv.id] || { invoice: inv }), amount: e.target.value, note: prev[inv.id]?.note || '' } }));
                              }}
                            />
                          )}
                        </Td>
                        <Td>
                          {checked && (
                            <Input
                              type="text"
                              placeholder="Megjegyzés a tételhez"
                              value={isEdit ? (inv.note || '') : (selected[inv.id]?.note || '')}
                              onChange={(e) => onNoteChange(rowKey, e.target.value)}
                            />
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <TotalBar>Összesen: {total.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} HUF</TotalBar>
          </div>

          {addInvoiceModal.open && (
            <ModalOverlay onClick={closeAddInvoiceModal}>
              <ModalContent onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                  <ModalTitle>
                    {addInvoiceModal.mode === 'incoming' ? 'Bejövő számla hozzáadása' : 'Kimenő számla hozzáadása'}
                  </ModalTitle>
                </ModalHeader>
                <ModalBody>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label>Ügyfél</label>
                    <Input
                      placeholder="Ügyfél keresése..."
                      value={addInvoiceModal.customerSearch}
                      onChange={(e) => setAddInvoiceModal((prev) => ({ ...prev, customerSearch: e.target.value }))}
                    />
                    <select
                      value={addInvoiceModal.customerId}
                      onChange={(e) => setAddInvoiceModal((prev) => ({ ...prev, customerId: e.target.value }))}
                      style={{ height: 36, borderRadius: 8, border: '1px solid #ddd', padding: '0 8px' }}
                    >
                      <option value="">Válassz ügyfelet...</option>
                      {(modalCustomers || [])
                        .filter((c) => {
                          const q = String(addInvoiceModal.customerSearch || '').trim().toLowerCase();
                          if (!q) return true;
                          return String(c?.name || '').toLowerCase().includes(q);
                        })
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <label>Számla keresés</label>
                    <Input
                      placeholder="Számlaszám vagy név..."
                      value={addInvoiceModal.invoiceSearch}
                      onChange={(e) => setAddInvoiceModal((prev) => ({ ...prev, invoiceSearch: e.target.value }))}
                    />
                    <Button type="button" onClick={loadModalInvoices} disabled={!addInvoiceModal.customerId || addInvoiceModal.loading}>
                      {addInvoiceModal.loading ? 'Betöltés...' : 'Kifizetetlen számlák betöltése'}
                    </Button>
                  </div>

                  <div style={{ display: 'grid', gap: 8, maxHeight: '45vh', overflow: 'auto' }}>
                    {(addInvoiceModal.invoices || []).map((inv) => (
                      <label key={inv.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8, alignItems: 'center' }}>
                        <input
                          type="radio"
                          name="modal-selected-invoice"
                          checked={String(addInvoiceModal.selectedInvoiceId) === String(inv.id)}
                          onChange={() => setAddInvoiceModal((prev) => ({ ...prev, selectedInvoiceId: inv.id }))}
                        />
                        <span>{inv.invoice_number} - {inv.customer_name}</span>
                        <span>{Number(inv.outstanding || 0).toLocaleString('hu-HU')} {inv.currency || ''}</span>
                      </label>
                    ))}
                    {!addInvoiceModal.loading && (addInvoiceModal.invoices || []).length === 0 && (
                      <div>Nincs találat.</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button type="button" onClick={closeAddInvoiceModal}>Mégse</Button>
                    <Button type="button" onClick={addInvoiceFromModal} disabled={!addInvoiceModal.selectedInvoiceId}>Hozzáadás</Button>
                  </div>
                </ModalBody>
              </ModalContent>
            </ModalOverlay>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
            {isEdit && (
              <Button
                type="button"
                onClick={() => navigate(`/bank-statements/import/preview?openUploaded=${id}&source=uploaded`)}
                style={{ background: '#2980b9', color: '#fff', borderColor: '#2980b9' }}
              >
                Megnyitás importnézetben
              </Button>
            )}
            <Button type="submit">Mentés</Button>
          </div>
        </form>
      </Content>
    </Container>
  );
};

export default BankStatementForm;
