import React from 'react';
import styled from 'styled-components';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { bankStatementsAPI, companyBankAccountAPI, invoiceAPI, companyAPI } from '../services/api';
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

  const selectedBankAccountId = watch('bank_account');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState({}); // invoiceId -> { invoice, note, amount }
  const queryClient = useQueryClient();

  const { data: companies } = useQuery(
    ['companies'],
    () => companyAPI.getCompanies({ is_active: true }),
    { select: (res) => res.data?.results || res.data || [] }
  );

  const selectedCompanyIdLS = React.useMemo(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  }, []);
  const { data: accounts } = useQuery(
    ['company-bank-accounts', { company_id: selectedCompanyIdLS }],
    () => companyBankAccountAPI.getAccounts(selectedCompanyIdLS ? { company_id: selectedCompanyIdLS } : {}),
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
    ['unpaid-invoices', { search }],
    () => invoiceAPI.getUnpaidInvoices({ search }),
    { select: (res) => res.data?.results || res.data?.results || [], keepPreviousData: true }
  );

  // Combine unpaid invoices with already selected invoices in edit mode so existing items are visible
  const rows = React.useMemo(() => {
    const base = unpaid || [];
    if (!isEdit) return base;
    const ids = new Set(base.map(b => b.id));
    const extra = Object.values(selected)
      .map(v => v.invoice)
      .filter(inv => inv && !ids.has(inv.id));
    return base.concat(extra);
  }, [unpaid, selected, isEdit]);

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

  const total = Object.values(selected).reduce((s, it) => s + (Number(it.amount || 0)), 0);

  const onToggle = (inv) => {
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
    setSelected(prev => ({ ...prev, [invId]: { ...(prev[invId] || {}), note } }));
  };

  const onSubmit = (values) => {
    const bankAcc = (accounts || []).find(a => a.id === values.bank_account);
    const companyId = bankAcc?.company || companies?.[0]?.id || null;
    if (!companyId) {
      toast.error('Cég nem meghatározható (válassz bankszámlát)');
      return;
    }
    const items = Object.values(selected).map(sel => ({
      // include id for existing statement items in edit mode
      ...(sel.id ? { id: sel.id } : {}),
      invoice: sel.invoice.id,
      customer: sel.invoice.customer_id,
      amount: Number(sel.amount || 0),
      note: sel.note || ''
    }));
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
  const { data: current, isLoading: loadingCurrent } = useQuery(
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
        (st.items || []).forEach(it => {
          nextSel[it.invoice] = {
            id: it.id,
            invoice: { id: it.invoice, invoice_number: it.invoice_number, customer_id: undefined, customer_name: it.customer_name },
            amount: Number(it.amount || 0),
            note: it.note || ''
          };
        });
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
            <Label>Számlák (kifizetetlen)</Label>
            <SearchRow>
              <Input placeholder="Gyors keresés ügyfél/számla" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button type="button" onClick={() => refetch()} disabled={isFetching}>Keresés</Button>
            </SearchRow>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <Table>
                <thead>
                  <tr>
                    <Th></Th>
                    <Th>Számlaszám</Th>
                    <Th>Ügyfél</Th>
                    <Th>Bruttó összeg</Th>
                    <Th>Fizetendő (most)</Th>
                    <Th>Megjegyzés</Th>
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).map((inv) => {
                    const checked = !!selected[inv.id];
                    return (
                      <tr key={inv.id}>
                        <Td>
                          <input type="checkbox" checked={checked} onChange={() => onToggle(inv)} />
                        </Td>
                        <Td>{inv.invoice_number}</Td>
                        <Td>{inv.customer_name || selected[inv.id]?.invoice?.customer_name || ''}</Td>
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
                              min={0}
                              step="0.01"
                              value={selected[inv.id]?.amount ?? ''}
                              onChange={(e) => setSelected(prev => ({ ...prev, [inv.id]: { ...(prev[inv.id] || { invoice: inv }), amount: e.target.value, note: prev[inv.id]?.note || '' } }))}
                            />
                          )}
                        </Td>
                        <Td>
                          {checked && (
                            <Input
                              type="text"
                              placeholder="Megjegyzés a tételhez"
                              value={selected[inv.id]?.note || ''}
                              onChange={(e) => onNoteChange(inv.id, e.target.value)}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
            <Button type="submit">Mentés</Button>
          </div>
        </form>
      </Content>
    </Container>
  );
};

export default BankStatementForm;
