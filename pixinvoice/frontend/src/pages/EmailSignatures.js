import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Edit, Plus, Star, Trash2 } from 'lucide-react';
import { emailSignatureAPI } from '../services/api';

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
  background: ${props => props.variant === 'danger' ? '#e74c3c' : props.variant === 'warning' ? '#f39c12' : '#3498db'};
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
  width: min(900px, 94vw);
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

const EditorWrapper = styled.div`
  margin-top: 8px;
  .ql-container { min-height: 220px; }
`;

const Actions = styled.div`
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

export default function EmailSignatures() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [endpointAvailable, setEndpointAvailable] = useState(true);

  useEffect(() => {
    const updateCid = () => {
      try { setCompanyId(localStorage.getItem('selectedCompanyId')); } catch {}
    };
    updateCid();
    window.addEventListener('companyChanged', updateCid);
    return () => window.removeEventListener('companyChanged', updateCid);
  }, []);

  const { data, isLoading } = useQuery(
    ['email-signatures', companyId],
    async () => {
      try {
        const res = await emailSignatureAPI.list({ company_id: companyId });
        setEndpointAvailable(true);
        return Array.isArray(res.data) ? res.data : (res.data?.results || []);
      } catch (error) {
        if (error?.response?.status === 404) {
          setEndpointAvailable(false);
          return [];
        }
        throw error;
      }
    },
    {
      enabled: !!companyId,
      retry: (failureCount, error) => error?.response?.status !== 404 && failureCount < 2,
    }
  );

  const setDefaultMutation = useMutation((id) => emailSignatureAPI.setDefault(id), {
    onSuccess: () => {
      toast.success('Alapértelmezett aláírás beállítva');
      queryClient.invalidateQueries(['email-signatures', companyId]);
    },
    onError: () => toast.error('Beállítási hiba'),
  });

  const deleteMutation = useMutation((id) => emailSignatureAPI.delete(id), {
    onSuccess: () => {
      toast.success('Aláírás törölve');
      queryClient.invalidateQueries(['email-signatures', companyId]);
    },
    onError: () => toast.error('Törlési hiba'),
  });

  const openNew = () => {
    if (!endpointAvailable) {
      toast.warning('Az aláírás endpoint ezen a szerveren még nem érhető el.');
      return;
    }
    setEditing({ id: null });
    setForm({
      company: companyId,
      name: '',
      content_html: '',
      is_default: false,
      is_active: true,
    });
  };

  const openEdit = (item) => {
    if (!endpointAvailable) {
      toast.warning('Az aláírás endpoint ezen a szerveren még nem érhető el.');
      return;
    }
    setEditing(item);
    setForm({
      id: item.id,
      company: item.company || companyId,
      name: item.name || '',
      content_html: item.content_html || '',
      is_default: !!item.is_default,
      is_active: !!item.is_active,
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = { ...form, company: form.company || companyId };
      if (form.id) {
        await emailSignatureAPI.update(form.id, payload);
      } else {
        await emailSignatureAPI.create(payload);
      }
      toast.success('Aláírás mentve');
      setEditing(null);
      setForm(null);
      queryClient.invalidateQueries(['email-signatures', companyId]);
    } catch {
      toast.error('Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Container>Betöltés...</Container>;
  if (!companyId) return <Container>Nincs kiválasztott cég.</Container>;

  return (
    <Container>
      <Header>
        <Title>Aláírások</Title>
        <Button onClick={openNew} disabled={!endpointAvailable}><Plus size={15} /> Új aláírás</Button>
      </Header>

      {!endpointAvailable && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: 6, color: '#664d03' }}>
          Az aláírás kezelő API ezen a környezeten még nem érhető el.
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <th>Név</th>
            <th>Alapértelmezett</th>
            <th>Státusz</th>
            <th>Műveletek</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.is_default ? 'Igen' : 'Nem'}</td>
              <td><Badge active={row.is_active}>{row.is_active ? 'Aktív' : 'Inaktív'}</Badge></td>
              <td>
                {!row.is_default && (
                  <IconButton variant="warning" title="Alapértelmezett" onClick={() => setDefaultMutation.mutate(row.id)} disabled={!endpointAvailable}>
                    <Star size={15} />
                  </IconButton>
                )}
                <IconButton title="Szerkesztés" onClick={() => openEdit(row)} disabled={!endpointAvailable}><Edit size={15} /></IconButton>
                <IconButton
                  variant="danger"
                  title="Törlés"
                  disabled={!endpointAvailable}
                  onClick={() => {
                    if (window.confirm('Biztosan törlöd ezt az aláírást?')) {
                      deleteMutation.mutate(row.id);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      {editing && form && (
        <ModalOverlay>
          <Modal>
            <Title style={{ fontSize: 20, marginBottom: 12 }}>{form.id ? 'Aláírás szerkesztése' : 'Új aláírás'}</Title>

            <Label>Név</Label>
            <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <Label>Aláírás tartalma (HTML)</Label>
            <EditorWrapper>
              <ReactQuill
                theme="snow"
                value={form.content_html || ''}
                onChange={(value) => setForm({ ...form, content_html: value })}
              />
            </EditorWrapper>

            <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                />
                Alapértelmezett
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Aktív
              </label>
            </div>

            <Actions>
              <Button variant="danger" onClick={() => { setEditing(null); setForm(null); }}>Mégse</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button>
            </Actions>
          </Modal>
        </ModalOverlay>
      )}
    </Container>
  );
}
