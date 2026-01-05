import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import styled from 'styled-components';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import { vatTypesAPI } from '../services/api';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 24px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const Title = styled.h1`
  font-size: 22px;
  margin: 0;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  th, td { border-bottom: 1px solid #ecf0f1; padding: 8px; text-align: left; }
  th { background: #f8f9fa; }
`;

const Input = styled.input`
  width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px;
`;
const Select = styled.select`
  width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; background: white;
`;
const Button = styled.button`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border: none; border-radius: 4px; color: white; cursor: pointer;
  background: ${p => p.variant === 'danger' ? '#e74c3c' : '#3498db'};
`;

const VATTypes = () => {
  const qc = useQueryClient();
  const { data } = useQuery(['vat-types'], () => vatTypesAPI.getVATTypes({}), { select: res => res.data });
  const [rows, setRows] = React.useState([]);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState('');

  React.useEffect(() => {
    const list = Array.isArray(data) ? data : (data?.results || []);
    setRows(list);
  }, [data]);

  const createMut = useMutation((payload) => vatTypesAPI.createVATType(payload), {
    onSuccess: () => qc.invalidateQueries(['vat-types'])
  });
  const updateMut = useMutation(({ id, payload }) => vatTypesAPI.updateVATType(id, payload), {
    onSuccess: () => qc.invalidateQueries(['vat-types'])
  });
  const deleteMut = useMutation((id) => vatTypesAPI.deleteVATType(id), {
    onSuccess: () => qc.invalidateQueries(['vat-types'])
  });

  const addRow = () => {
    setRows([{ code: '', name: '', category: 'PERCENT', percentage: 27, active: true, sort_order: 0, _isNew: true }, ...rows]);
  };

  const saveRow = async (row) => {
    const payload = { ...row };
    delete payload._isNew; delete payload.id;
    if (row.category !== 'PERCENT') payload.percentage = null;
    if (row.id) {
      await updateMut.mutateAsync({ id: row.id, payload });
    } else {
      await createMut.mutateAsync(payload);
    }
  };

  const parseCategory = (s) => {
    const t = (s||'').toString().trim().toUpperCase();
    if (['PERCENT','SZAZ','SZAZALEKOS','SZAZALEK','SZÁZALÉKOS','SZÁZ'].includes(t)) return 'PERCENT';
    if (['EXEMPT','MENTES','ADO MENTES','ADOMENTES','ADÓMENTES','AAM','TAM','EAM','KBAET'].includes(t)) return 'EXEMPT';
    if (['REVERSE','FORD','FORDITOTT','FORDÍTOTT'].includes(t)) return 'REVERSE';
    if (['MARGIN','KULONBOZETI','KÜLÖNBÖZETI'].includes(t)) return 'MARGIN';
    return 'OTHER';
  };

  const bulkImport = async () => {
    const lines = bulkText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
      // Accept CSV or ; separated: code;name;category;percentage
      const parts = line.split(/[;,\t]/).map(p=>p.trim());
      if (!parts[0] || !parts[1]) continue;
      const [code, name, cat, perc] = parts;
      const category = parseCategory(cat);
      const percentage = category==='PERCENT' ? (perc!==undefined && perc!=='' ? Number(perc) : null) : null;
      items.push({ code, name, category, percentage, active: true });
    }
    for (const it of items) {
      try { await vatTypesAPI.createVATType(it); } catch (e) { /* ignore single-line errors */ }
    }
    setBulkText(''); setBulkOpen(false);
    qc.invalidateQueries(['vat-types']);
  };

  return (
    <Container>
      <Header>
        <Title>ÁFA típusok</Title>
        <Button onClick={addRow}><Plus size={16}/> Új</Button>
      </Header>
      <div style={{ marginBottom: 12 }}>
        <button onClick={()=>setBulkOpen(v=>!v)} style={{ border:'none', background:'#6c757d', color:'#fff', borderRadius:4, padding:'6px 10px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}>
          <Upload size={16}/> Tömeges felvitel
        </button>
        {bulkOpen && (
          <div style={{ marginTop: 8, background:'#f8f9fa', border:'1px solid #e9ecef', borderRadius:6, padding:12 }}>
            <div style={{ marginBottom:8, color:'#2c3e50' }}>Soronkent: code;name;category;percentage — például: 27;ÁFA 27%;PERCENT;27 vagy AAM;Alanyi adómentes;EXEMPT;</div>
            <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={6} style={{ width:'100%', border:'1px solid #ddd', borderRadius:4, padding:8 }} />
            <div style={{ marginTop:8, display:'flex', gap:8 }}>
              <Button onClick={bulkImport}><Upload size={14}/> Import</Button>
              <Button onClick={()=>{ setBulkText(''); setBulkOpen(false); }} variant="danger">Mégse</Button>
            </div>
          </div>
        )}
      </div>
      <Table>
        <thead>
          <tr>
            <th>Kód</th>
            <th>Név</th>
            <th>Kategória</th>
            <th>Százalék</th>
            <th>Aktív</th>
            <th>Sorrend</th>
            <th>Művelet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id || idx}>
              <td><Input value={r.code || ''} onChange={e => {
                const v=[...rows]; v[idx]={...v[idx], code:e.target.value}; setRows(v);
              }}/></td>
              <td><Input value={r.name || ''} onChange={e => {
                const v=[...rows]; v[idx]={...v[idx], name:e.target.value}; setRows(v);
              }}/></td>
              <td>
                <Select value={r.category || 'PERCENT'} onChange={e => {
                  const v=[...rows]; v[idx]={...v[idx], category:e.target.value}; if (e.target.value!=='PERCENT') v[idx].percentage=null; setRows(v);
                }}>
                  <option value="PERCENT">Százalékos</option>
                  <option value="EXEMPT">Adómentes</option>
                  <option value="REVERSE">Fordított</option>
                  <option value="MARGIN">Különbözeti</option>
                  <option value="OTHER">Egyéb</option>
                </Select>
              </td>
              <td>
                <Input type="number" step="0.01" disabled={r.category!=='PERCENT'} value={r.percentage ?? ''} onChange={e => {
                  const v=[...rows]; v[idx]={...v[idx], percentage:e.target.value}; setRows(v);
                }}/>
              </td>
              <td>
                <input type="checkbox" checked={!!r.active} onChange={e=>{
                  const v=[...rows]; v[idx]={...v[idx], active:e.target.checked}; setRows(v);
                }}/>
              </td>
              <td>
                <Input type="number" value={r.sort_order ?? 0} onChange={e=>{
                  const v=[...rows]; v[idx]={...v[idx], sort_order: Number(e.target.value||0)}; setRows(v);
                }}/>
              </td>
              <td style={{display:'flex', gap:8}}>
                <Button onClick={()=>saveRow(r)}><Save size={14}/> Mentés</Button>
                {r.id && <Button variant="danger" onClick={()=>deleteMut.mutate(r.id)}><Trash2 size={14}/> Törlés</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Container>
  );
};

export default VATTypes;
