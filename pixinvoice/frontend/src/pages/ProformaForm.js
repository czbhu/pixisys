import React from 'react';
import styled from 'styled-components';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { proformaAPI, customerAPI, companyAPI } from '../services/api';
import { toast } from 'react-toastify';

const Container = styled.div`
  background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px;
`;
const Row = styled.div` display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; `;
const Field = styled.div``;
const Label = styled.label` display:block; margin-bottom: 6px; color:#34495e;`;
const Input = styled.input` width:100%; padding:8px 10px; border:1px solid #ddd; border-radius:4px; `;
const Select = styled.select` width:100%; padding:8px 10px; border:1px solid #ddd; border-radius:4px; `;
const Button = styled.button` padding:8px 14px; background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer; `;

const ProformaForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const copyFrom = params.get('copy_from') || '';
  const [selectedCompanyId, setSelectedCompanyId] = React.useState(() => {
    try { return localStorage.getItem('selectedCompanyId') || ''; } catch { return ''; }
  });
  const { register, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: { issue_date: new Date().toISOString().slice(0,10), due_date: new Date().toISOString().slice(0,10), currency: 'HUF', payment_method: 'transfer' }
  });
  const [items, setItems] = React.useState([{ description: '', quantity: 1, unit_price: 0, vat_rate: 27 }]);

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, vat_rate: 27 }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, key, val) => setItems(prev => prev.map((it,i)=> i===idx ? { ...it, [key]: val } : it));

  const { data: companies } = useQuery(['companies', { is_active: true }], () => companyAPI.getCompanies({ is_active: true }), { select: (res) => res.data });
  const { data: customers } = useQuery(
    ['customers', { company_id: selectedCompanyId || '' }],
    () => customerAPI.getCustomers({ page_size: 5000, company_id: selectedCompanyId || undefined }),
    { select: (res) => res.data }
  );

  // Default company to sidebar selection on new
  React.useEffect(() => {
    if (isEdit) return;
    try {
      const cid = localStorage.getItem('selectedCompanyId');
      if (cid) {
        setValue('company_id', cid);
        setSelectedCompanyId(cid);
      }
    } catch {}
  }, [isEdit, setValue]);

  React.useEffect(() => {
    const sub = watch((value, meta) => {
      if (meta?.name === 'company_id') {
        setSelectedCompanyId(value?.company_id || '');
      }
    });
    return () => sub.unsubscribe();
  }, [watch]);

  const createMutation = useMutation((payload) => isEdit ? proformaAPI.updateProforma(id, payload) : proformaAPI.createProforma(payload), {
    onSuccess: () => { toast.success(isEdit ? 'Díjbekérő frissítve' : 'Díjbekérő létrehozva'); queryClient.invalidateQueries('proformas'); navigate('/proformas'); },
    onError: () => toast.error('Hiba történt mentés közben'),
  });

  useQuery(['proforma', id], () => proformaAPI.getProforma(id), {
    enabled: isEdit,
    select: (res) => res.data,
    onSuccess: (pf) => {
      reset({
        proforma_number: pf.proforma_number,
        issue_date: pf.issue_date,
        due_date: pf.due_date,
        currency: pf.currency,
        payment_method: pf.payment_method,
        notes: pf.notes || '',
        company_id: pf.company?.id,
        customer_id: pf.customer?.id,
      });
      const mapped = Array.isArray(pf.items) ? pf.items.map(it => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, vat_rate: it.vat_rate || 27 })) : [];
      if (mapped.length) setItems(mapped);
    }
  });

  // Prefill from copy_from
  React.useEffect(() => {
    if (!copyFrom || isEdit) return;
    (async () => {
      try {
        const res = await proformaAPI.getProforma(copyFrom);
        const pf = res.data;
        if (!pf) return;
        reset({
          proforma_number: '', // új sorszám generálódik backend oldalon
          issue_date: pf.issue_date,
          due_date: pf.due_date,
          currency: pf.currency,
          payment_method: pf.payment_method,
          notes: pf.notes || '',
          company_id: pf.company?.id,
          customer_id: pf.customer?.id,
        });
        const mapped = Array.isArray(pf.items) ? pf.items.map(it => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, vat_rate: it.vat_rate || 27 })) : [];
        if (mapped.length) setItems(mapped);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyFrom, isEdit]);

  const onSubmit = (values) => {
    // compute clean items and totals (optional)
    const payload = {
      proforma_number: values.proforma_number || undefined,
      company_id: values.company_id,
      customer_id: values.customer_id,
      issue_date: values.issue_date,
      due_date: values.due_date,
      currency: values.currency,
      payment_method: values.payment_method,
      notes: values.notes || '',
      items: items.map(it => ({ description: it.description, quantity: Number(it.quantity||0), unit_price: Number(it.unit_price||0), vat_rate: Number(it.vat_rate||0) })),
    };
    createMutation.mutate(payload);
  };

  return (
    <Container>
      <h1>{isEdit ? 'Díjbekérő szerkesztése' : 'Új díjbekérő'}</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Row>
          <Field>
            <Label>Díjbekérő száma (opcionális)</Label>
            <Input type="text" {...register('proforma_number')} placeholder="pl. 20250502001" />
          </Field>
          <Field>
            <Label>Cég</Label>
            <Select {...register('company_id')} defaultValue="">
              <option value="">Válassz...</option>
              {(companies?.results || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </Row>
        <Row>
          <Field>
            <Label>Ügyfél</Label>
            <Select {...register('customer_id')} defaultValue="">
              <option value="">Válassz...</option>
              {(customers?.results || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field>
            <Label>Kelt</Label>
            <Input type="date" {...register('issue_date')} />
          </Field>
        </Row>
        <Row>
          <Field>
            <Label>Esedékesség</Label>
            <Input type="date" {...register('due_date')} />
          </Field>
          <Field>
            <Label>Pénznem</Label>
            <Input type="text" {...register('currency')} />
          </Field>
        </Row>
        <Row>
          <Field>
            <Label>Fizetési mód</Label>
            <Select {...register('payment_method')} defaultValue="transfer">
              <option value="transfer">Átutalás</option>
              <option value="cash">Készpénz</option>
              <option value="card">Bankkártya</option>
              <option value="voucher">Utalvány</option>
              <option value="cod">Utánvét</option>
              <option value="other">Egyéb</option>
            </Select>
          </Field>
          <Field>
            <Label>Megjegyzés</Label>
            <Input type="text" {...register('notes')} />
          </Field>
        </Row>
        <div style={{ marginTop: 16 }}>
          <h3>Tételek</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', padding:8 }}>Megnevezés</th>
                  <th style={{ textAlign:'left', padding:8 }}>Mennyiség</th>
                  <th style={{ textAlign:'left', padding:8 }}>Egységár</th>
                  <th style={{ textAlign:'left', padding:8 }}>ÁFA %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ padding:8 }}><Input value={it.description} onChange={e=>updateItem(idx,'description', e.target.value)} placeholder="Megnevezés" /></td>
                    <td style={{ padding:8 }}><Input type="number" step="0.01" value={it.quantity} onChange={e=>updateItem(idx,'quantity', e.target.value)} /></td>
                    <td style={{ padding:8 }}><Input type="number" step="0.01" value={it.unit_price} onChange={e=>updateItem(idx,'unit_price', e.target.value)} /></td>
                    <td style={{ padding:8 }}><Input type="number" step="0.01" value={it.vat_rate} onChange={e=>updateItem(idx,'vat_rate', e.target.value)} /></td>
                    <td style={{ padding:8 }}><button type="button" onClick={()=>removeItem(idx)} style={{ border:'none', background:'#e74c3c', color:'#fff', padding:'6px 10px', borderRadius:4, cursor:'pointer' }}>Törlés</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', gap:8, margin:'10px 0' }}>
            <button type="button" onClick={addItem} style={{ border:'none', background:'#2ecc71', color:'#fff', padding:'8px 12px', borderRadius:4, cursor:'pointer' }}>+ Tétel hozzáadása</button>
          </div>
          <div style={{ marginTop: 12, textAlign:'right', color:'#2c3e50' }}>
            {(() => {
              const totals = items.reduce((acc, it) => {
                const q = Number(it.quantity||0);
                const p = Number(it.unit_price||0);
                const r = Number(it.vat_rate||0);
                const net = q * p;
                const vat = net * (r/100);
                return { net: acc.net + net, vat: acc.vat + vat, gross: acc.gross + net + vat };
              }, { net:0, vat:0, gross:0 });
              return <div>Összesen: Nettó {totals.net.toLocaleString('hu-HU',{minimumFractionDigits:2})} | ÁFA {totals.vat.toLocaleString('hu-HU',{minimumFractionDigits:2})} | Bruttó {totals.gross.toLocaleString('hu-HU',{minimumFractionDigits:2})}</div>;
            })()}
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
          <Button type="submit">Mentés</Button>
        </div>
      </form>
    </Container>
  );
};

export default ProformaForm;
