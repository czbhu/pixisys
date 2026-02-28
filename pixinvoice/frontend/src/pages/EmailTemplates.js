import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Edit, RefreshCw } from 'lucide-react';
import { emailTemplateAPI } from '../services/api';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: ${props => props.variant === 'danger' ? '#e74c3c' : '#3498db'};
  color: white;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  th, td { padding: 10px; border-bottom: 1px solid #ecf0f1; text-align: left; }
  th { background: #f8f9fa; color: #2c3e50; }
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => props.active ? '#d4edda' : '#f8d7da'};
  color: ${props => props.active ? '#155724' : '#721c24'};
`;

const IconButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: white;
  background: ${props => props.variant === 'danger' ? '#e74c3c' : '#3498db'};
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  width: min(980px, 94vw);
  max-height: 92vh;
  overflow: auto;
  background: white;
  border-radius: 8px;
  padding: 20px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: #2c3e50;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  margin-bottom: 12px;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  margin-bottom: 12px;
  background: white;
`;

const Help = styled.div`
  margin: 10px 0 12px 0;
  font-size: 13px;
  color: #555;
  line-height: 1.6;
`;

const Code = styled.code`
  background: #f4f6f8;
  border-radius: 4px;
  padding: 2px 6px;
  margin-right: 6px;
`;

const EditorWrapper = styled.div`
  margin-top: 8px;
  .ql-container { min-height: 260px; }
`;

const Actions = styled.div`
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
`;

const SaveButton = styled.button`
  padding: 10px 16px;
  border-radius: 6px;
  border: none;
  background: #3498db;
  color: white;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const TEMPLATE_TYPES = [
  { value: 'invoice_send', label: 'Számlaküldés' },
  { value: 'arrears', label: 'Kintlévőségi' },
  { value: 'reminder_1', label: '1. felszólítás' },
  { value: 'reminder_2', label: '2. felszólítás' },
  { value: 'legal', label: 'Ügyvédi' },
  { value: 'payment_order', label: 'Fizetési meghagyás' },
  { value: 'litigation', label: 'Peresítés' },
];

const typeLabel = (value) => TEMPLATE_TYPES.find(t => t.value === value)?.label || value;

export default function EmailTemplates() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const updateCid = () => {
      try { setCompanyId(localStorage.getItem('selectedCompanyId')); } catch {}
    };
    updateCid();
    window.addEventListener('companyChanged', updateCid);
    return () => window.removeEventListener('companyChanged', updateCid);
  }, []);

  const { data, isLoading } = useQuery(
    ['email-templates', companyId],
    async () => {
      try {
        await emailTemplateAPI.ensureDefaults({ company_id: companyId });
      } catch (error) {
        if (error?.response?.status !== 404) {
          throw error;
        }
      }
      const res = await emailTemplateAPI.list({ company_id: companyId });
      const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      return list;
    },
    { enabled: !!companyId }
  );

  const groupedRows = useMemo(() => {
    const typeOrder = new Map(TEMPLATE_TYPES.map((item, idx) => [item.value, idx]));
    const sorted = [...(data || [])].sort((a, b) => {
      const t = (typeOrder.get(a.template_type) ?? 999) - (typeOrder.get(b.template_type) ?? 999);
      if (t !== 0) return t;
      return String(a.language || '').localeCompare(String(b.language || ''));
    });

    const byType = new Map();
    sorted.forEach((item) => {
      const key = item.template_type;
      if (!byType.has(key)) {
        byType.set(key, { template_type: key, hu: null, en: null });
      }
      const group = byType.get(key);
      if (item.language === 'en') group.en = item;
      else group.hu = item;
    });

    return TEMPLATE_TYPES
      .map((type) => byType.get(type.value))
      .filter(Boolean)
      .map((group) => ({
        ...group,
        is_active: !!(group.hu?.is_active || group.en?.is_active),
      }));
  }, [data]);

  const openEditor = (group) => {
    setEditing(group);
    setForm({
      company: group.hu?.company || group.en?.company || companyId,
      template_type: group.template_type,
      is_active: !!(group.hu?.is_active || group.en?.is_active),
      hu_id: group.hu?.id || null,
      hu_name: group.hu?.name || typeLabel(group.template_type),
      hu_subject_template: group.hu?.subject_template || '',
      hu_body_template: group.hu?.body_template || '',
      en_id: group.en?.id || null,
      en_name: group.en?.name || typeLabel(group.template_type),
      en_subject_template: group.en?.subject_template || '',
      en_body_template: group.en?.body_template || '',
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updates = [];

      if (form.hu_id) {
        updates.push(emailTemplateAPI.update(form.hu_id, {
          company: form.company || companyId,
          template_type: form.template_type,
          language: 'hu',
          name: form.hu_name,
          subject_template: form.hu_subject_template,
          body_template: form.hu_body_template,
          is_active: !!form.is_active,
        }));
      }

      if (form.en_id) {
        updates.push(emailTemplateAPI.update(form.en_id, {
          company: form.company || companyId,
          template_type: form.template_type,
          language: 'en',
          name: form.en_name,
          subject_template: form.en_subject_template,
          body_template: form.en_body_template,
          is_active: !!form.is_active,
        }));
      }

      if (!updates.length) {
        throw new Error('Nincs menthető sablon rekord.');
      }

      await Promise.all(updates);
      toast.success('Sablon mentve');
      setEditing(null);
      setForm(null);
      queryClient.invalidateQueries(['email-templates', companyId]);
    } catch {
      toast.error('Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const runEnsureDefaults = async () => {
    if (!companyId) return;
    try {
      await emailTemplateAPI.ensureDefaults({ company_id: companyId });
      toast.success('Sablonok szinkronizálva');
      queryClient.invalidateQueries(['email-templates', companyId]);
    } catch (error) {
      if (error?.response?.status === 404) {
        toast.warning('A sablon-szinkron endpoint ezen a szerveren még nem érhető el.');
        return;
      }
      toast.error('Szinkronizálási hiba');
    }
  };

  if (isLoading) return <Container>Betöltés...</Container>;
  if (!companyId) return <Container>Nincs kiválasztott cég.</Container>;

  return (
    <Container>
      <Header>
        <Title>E-mail sablonok</Title>
        <HeaderActions>
          <Button onClick={runEnsureDefaults}><RefreshCw size={15} /> Hiányzók létrehozása</Button>
        </HeaderActions>
      </Header>

      <Table>
        <thead>
          <tr>
            <th>Típus</th>
            <th>Magyar tárgy</th>
            <th>Angol tárgy</th>
            <th>Státusz</th>
            <th>Műveletek</th>
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((row) => (
            <tr key={row.template_type}>
              <td>{typeLabel(row.template_type)}</td>
              <td>{row.hu?.subject_template || '-'}</td>
              <td>{row.en?.subject_template || '-'}</td>
              <td><Badge active={row.is_active}>{row.is_active ? 'Aktív' : 'Inaktív'}</Badge></td>
              <td>
                <IconButton onClick={() => openEditor(row)} title="Szerkesztés"><Edit size={15} /></IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      {editing && form && (
        <ModalOverlay>
          <Modal>
            <Title style={{ fontSize: 20, marginBottom: 12 }}>Sablon szerkesztése</Title>

            <Label>Típus</Label>
            <Select
              value={form.template_type}
              disabled
              onChange={(e) => setForm({ ...form, template_type: e.target.value })}
            >
              {TEMPLATE_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>

            <Label>Magyar tárgy sablon</Label>
            <Input value={form.hu_subject_template || ''} onChange={(e) => setForm({ ...form, hu_subject_template: e.target.value })} />

            <Help>
              Használható változók:{' '}
              <Code>{'{customer_name}'}</Code>
              <Code>{'{company_name}'}</Code>
              <Code>{'{invoice_number}'}</Code>
              <Code>{'{as_of_date}'}</Code>
              <Code>{'{today_date}'}</Code>
              <Code>{'{today_city_date}'}</Code>
              <Code>{'{total_outstanding}'}</Code>
              <Code>{'{invoice_count}'}</Code>
              <Code>{'{currency}'}</Code>
              <Code>{'{invoices_table}'}</Code>
              <Code>{'{signature_html}'}</Code>
            </Help>

            <Label>Magyar levél sablon (HTML)</Label>
            <EditorWrapper>
              <ReactQuill
                theme="snow"
                value={form.hu_body_template || ''}
                onChange={(value) => setForm({ ...form, hu_body_template: value })}
              />
            </EditorWrapper>

            <Label style={{ marginTop: 14 }}>Angol tárgy sablon</Label>
            <Input value={form.en_subject_template || ''} onChange={(e) => setForm({ ...form, en_subject_template: e.target.value })} />

            <Label>Angol levél sablon (HTML)</Label>
            <EditorWrapper>
              <ReactQuill
                theme="snow"
                value={form.en_body_template || ''}
                onChange={(value) => setForm({ ...form, en_body_template: value })}
              />
            </EditorWrapper>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Aktív sablon (mindkét nyelven)
              </label>
            </div>

            <Actions>
              <Button variant="danger" onClick={() => { setEditing(null); setForm(null); }}>Mégse</Button>
              <SaveButton onClick={save} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</SaveButton>
            </Actions>
          </Modal>
        </ModalOverlay>
      )}
    </Container>
  );
}
