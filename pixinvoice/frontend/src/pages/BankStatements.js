import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { bankStatementsAPI, companyAPI } from '../services/api';
import { toast } from 'react-toastify';
import { Edit2, Save, X, Trash2 } from 'lucide-react';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
`;

const Header = styled.div`
  padding: 20px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: #2c3e50;
`;

const ActionButton = styled(Link)`
  padding: 8px 14px;
  background: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
`;

const ImportButton = styled.button`
  padding: 8px 14px;
  background: #2ecc71;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
`;

const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 10000;
`;
const ModalContent = styled.div`
  width: 90%;
  max-width: 1600px;
  max-height: 95vh;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;
const ModalHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee;
`;
const ModalTitle = styled.h3`
  margin: 0; font-size: 18px; color: #2c3e50;
`;
const ModalBody = styled.div`
  padding: 16px;
  flex: 1;
  overflow: auto;
`;
const CloseBtn = styled.button`
  padding: 6px 10px; background: #eee; border: none; border-radius: 4px; cursor: pointer;
`;
const DropArea = styled.div`
  border: 2px dashed #95a5a6; border-radius: 6px; padding: 16px; text-align: center; color: #7f8c8d;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;
const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
  background: #f8f9fa;
`;
const Td = styled.td`
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
`;

const BankStatements = () => {
  const [selectedCompanyId, setSelectedCompanyId] = React.useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });

  // Keep selectedCompanyId in sync with sidebar's selection stored in localStorage
  React.useEffect(() => {
    const readLS = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setSelectedCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    const onFocus = () => readLS();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(readLS, 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  // Fallback: if no company selected in localStorage, default to first active company
  const { data: companiesData } = useQuery(
    ['companies', { is_active: true }],
    () => companyAPI.getCompanies({ is_active: true }),
    { select: (res) => res.data?.results || [] }
  );

  React.useEffect(() => {
    if (!selectedCompanyId && Array.isArray(companiesData) && companiesData.length > 0) {
      const first = companiesData[0];
      setSelectedCompanyId(first.id);
      try { localStorage.setItem('selectedCompanyId', first.id); } catch {}
    }
  }, [selectedCompanyId, companiesData]);

  const { data, isLoading, refetch } = useQuery(
    ['bank-statements', { company: selectedCompanyId }],
    () => bankStatementsAPI.getStatements(selectedCompanyId ? { company: selectedCompanyId } : {}),
    { select: (res) => res.data?.results || res.data || [] }
  );

  const [editId, setEditId] = React.useState(null);
  const [editValue, setEditValue] = React.useState('');
  const [showImport, setShowImport] = React.useState(false);
  const [tab, setTab] = React.useState('zip'); // zip | stm
  const [files, setFiles] = React.useState([]);
  const [importing, setImporting] = React.useState(false);
  const [stmPreview, setStmPreview] = React.useState(null);
  const [zipPreview, setZipPreview] = React.useState(null);
  const fileInputRef = React.useRef(null);

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const extsOk = (nm) => {
      const n = (nm||'').toLowerCase();
      // Allow zip or xml (and stm for legacy support just in case, but prefer xml)
      return n.endsWith('.zip') || n.endsWith('.xml') || n.endsWith('.stm');
    };
    const added = Array.from(e.dataTransfer.files || []).filter(x => extsOk(x.name));
    setFiles(prev => {
      const byKey = new Map(prev.map(f => [`${f.name}::${f.size}::${f.lastModified}`, f]));
      for (const f of added) byKey.set(`${f.name}::${f.size}::${f.lastModified}`, f);
      return Array.from(byKey.values());
    });
    // Auto-detect tab mode based on first file
    if(added.length > 0) {
      const first = added[0].name.toLowerCase();
      if(first.endsWith('.zip')) setTab('zip');
      else setTab('stm'); // stm mode handles xml too via existing API
    }
  };
  const onPick = (e) => {
    const extsOk = (nm) => {
      const n = (nm||'').toLowerCase();
      return n.endsWith('.zip') || n.endsWith('.xml') || n.endsWith('.stm');
    };
    const added = Array.from(e.target.files || []).filter(x => extsOk(x.name));
    setFiles(prev => {
      const byKey = new Map(prev.map(f => [`${f.name}::${f.size}::${f.lastModified}`, f]));
      for (const f of added) byKey.set(`${f.name}::${f.size}::${f.lastModified}`, f);
      return Array.from(byKey.values());
    });
    if(added.length > 0) {
      const first = added[0].name.toLowerCase();
      if(first.endsWith('.zip')) setTab('zip');
      else setTab('stm');
    }
  };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i!==idx));
  const doImport = async () => {
    if (!selectedCompanyId) { toast.error('Válassz céget'); return; }
    if (!files.length) { toast.info('Válassz fájlokat'); return; }
    setImporting(true);
    try {
      if (tab === 'zip') {
        const res = await bankStatementsAPI.importZipDryRun(selectedCompanyId, files);
        setZipPreview(res.data || {});
      } else {
        const res = await bankStatementsAPI.importStmDryRun(selectedCompanyId, files);
        // Auto-approve all items by default as OK column is removed
        const preview = (res.data?.preview || []).map(h => ({
           ...h,
           items: (h.items||[]).map(it => ({ ...it, approved: true }))
        }));
        setStmPreview(preview);
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Import hiba');
    } finally { setImporting(false); }
  };

  const commitZip = async () => {
    if (!selectedCompanyId) { toast.error('Válassz céget'); return; }
    if (!files.length) { toast.info('Válassz fájlokat'); return; }
    setImporting(true);
    try {
      const res = await bankStatementsAPI.importZipCommit(selectedCompanyId, files);
      const cr = res.data || {};
      toast.success(`Import kész: ${cr.created} új, kihagyva: ${(cr.skipped||[]).length}`);
      setShowImport(false); setFiles([]); setZipPreview(null); refetch();
      if ((cr.errors||[]).length) console.warn('Import hibák', cr.errors);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Import hiba');
    } finally { setImporting(false); }
  };

  const toggleApprove = (hIdx, iIdx) => {
    setStmPreview(prev => prev.map((h, hi) => hi!==hIdx? h : ({
      ...h,
      items: h.items.map((it, ii) => ii!==iIdx? it : ({ ...it, approved: !it.approved }))
    })));
  };
  const setCustomer = (hIdx, iIdx, cust) => {
    setStmPreview(prev => prev.map((h, hi) => hi!==hIdx? h : ({
      ...h,
      items: h.items.map((it, ii) => ii!==iIdx? it : ({ ...it, proposed_customer: cust }))
    })));
  };
  const setInvoice = (hIdx, iIdx, inv) => {
    setStmPreview(prev => prev.map((h, hi) => hi!==hIdx? h : ({
      ...h,
      items: h.items.map((it, ii) => ii!==iIdx? it : ({ ...it, proposed_invoice: inv }))
    })));
  };
  const setSaveBankAccount = (hIdx, iIdx, val) => {
    setStmPreview(prev => prev.map((h, hi) => hi!==hIdx? h : ({
      ...h,
      items: h.items.map((it, ii) => ii!==iIdx? it : ({ ...it, save_bank_account: val }))
    })));
  };
  const commitStm = async () => {
    try {
      const payload = (stmPreview||[]).map(h => ({
        account_id: h.account_id,
        statement_date: h.statement_date,
        sequence_number: h.sequence_number,
        currency: h.currency,
        items: (h.items||[]).map(it => ({
          approved: !!it.approved,
          customer_id: it.proposed_customer?.id,
          invoice_id: it.proposed_invoice?.id,
          amount: it.amount,
          remittance: it.remittance,
          counterparty_account: it.counterparty_account,
          save_bank_account: !!it.save_bank_account,
        }))
      }));
      const res = await bankStatementsAPI.importStmCommit(selectedCompanyId, payload);
      toast.success(`Mentve: ${res.data?.created_items||0} tétel`);
      setShowImport(false); setFiles([]); setStmPreview(null); refetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Mentési hiba');
    }
  };

  const startEdit = (st) => { setEditId(st.id); setEditValue(st.sequence_number); };
  const cancelEdit = () => { setEditId(null); setEditValue(''); };
  const saveEdit = async (id) => {
    await bankStatementsAPI.updateStatement(id, { sequence_number: editValue });
    cancelEdit();
    refetch();
  };
  const deleteRow = async (id) => {
    if (!window.confirm('Biztosan törlöd a bankkivonatot?')) return;
    await bankStatementsAPI.deleteStatement(id);
    refetch();
  };

  const list = Array.isArray(data) ? data : (data?.results || []);

  return (
    <Container>
      <Header>
        <Title>Bank kivonatok</Title>
        <div style={{ display:'flex', gap:8 }}>
          <ImportButton onClick={()=>setShowImport(true)}>Import</ImportButton>
          <ActionButton to="/bank-statements/new">Új bankkivonat</ActionButton>
        </div>
      </Header>
      {isLoading ? (
        <div style={{ padding: 20 }}>Betöltés...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <Th>Dátum</Th>
                <Th>Sorszám</Th>
                <Th>Számlaszám</Th>
                <Th>Összeg</Th>
                <Th>Megjegyzés</Th>
                <Th>Műveletek</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((st) => (
                <tr key={st.id}>
                  <Td>{st.statement_date}</Td>
                  <Td>
                    {editId === st.id ? (
                      <input style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4 }} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                    ) : (
                      st.sequence_number
                    )}
                  </Td>
                  <Td>{st.bank_account_name || st.bank_account || ''}</Td>
                  <Td>{st.total_amount?.toLocaleString?.('hu-HU', { minimumFractionDigits: 2 }) || ''}</Td>
                  <Td>{st.note || ''}</Td>
                  <Td>
                    {editId === st.id ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button title="Mentés" onClick={() => saveEdit(st.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#27ae60' }}>
                          <Save size={18} />
                        </button>
                        <button title="Mégse" onClick={cancelEdit} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e67e22' }}>
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link title="Kivonat szerkesztése (tételek)" to={`/bank-statements/${st.id}/edit`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2c3e50', textDecoration: 'none' }}>
                          <Edit2 size={18} /> Szerk.
                        </Link>
                        <button title="Szám szerkesztése" onClick={() => startEdit(st)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3498db' }}>
                          <Edit2 size={18} />
                        </button>
                        <button title="Törlés" onClick={() => deleteRow(st.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e74c3c' }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {showImport && (
        <ModalOverlay onClick={()=>setShowImport(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Új bankkivonat - Import</ModalTitle>
              <CloseBtn onClick={()=>setShowImport(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ display:'flex', gap:8, marginBottom: 8, display: 'none' }}>
                <button onClick={()=>{ setTab('zip'); setStmPreview(null); setZipPreview(null); }} style={{ padding:'6px 10px', borderRadius:4, border:'1px solid #ccc', background: tab==='zip'?'#3498db':'#fff', color: tab==='zip'?'#fff':'#2c3e50' }}>ZIP</button>
                <button onClick={()=>{ setTab('stm'); setStmPreview(null); setZipPreview(null); }} style={{ padding:'6px 10px', borderRadius:4, border:'1px solid #ccc', background: tab==='stm'?'#3498db':'#fff', color: tab==='stm'?'#fff':'#2c3e50' }}>STM</button>
              </div>
              <div style={{ marginBottom: 8, color:'#7f8c8d' }}>Tölts fel ZIP archívumot vagy ISO20022 XML (camt.053) kivonatot.</div>
              <DropArea 
                onDragOver={(e)=>{e.preventDefault();}} 
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', borderColor: '#3498db', background: '#f0f8ff' }}
              >
                Húzd ide a fájlokat (ZIP, XML), vagy klikkelj a kiválasztáshoz.
              </DropArea>
              <input 
                type="file" 
                ref={fileInputRef} 
                accept=".zip,.xml,.stm" 
                multiple 
                onChange={onPick} 
                style={{ display: 'none' }} 
              />
              {files.length>0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Kiválasztott fájlok:</div>
                  {files.map((f, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 8px', border:'1px solid #eee', borderRadius:4, marginBottom:6 }}>
                      <div>{f.name}</div>
                      <button onClick={()=>removeFile(i)} style={{ border:'none', background:'transparent', color:'#e74c3c', cursor:'pointer' }}>Eltávolítás</button>
                    </div>
                  ))}
                </div>
              )}
              {tab==='zip' && zipPreview ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight:600, marginBottom:8 }}>ZIP előnézet</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                    <colgroup>
                      <col style={{ width: '36%' }} />
                      <col style={{ width: '34%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Fájl</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számla</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Dátum</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Deviza</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Állapot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(zipPreview.preview||[]).map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.file}>{p.file}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                            {p.account_label || '-'}
                          </td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.statement_date || '-'}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.currency || '-'}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                            {p.creatable ? 'Új' : (p.exists ? 'Már létezik' : (p.reason || 'Kihagyva'))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop: 12 }}>
                    <div style={{ color:'#7f8c8d' }}>
                      Összesítés: új {zipPreview.counts?.creatable||0}, létező {zipPreview.counts?.existing||0}, kihagyva {zipPreview.counts?.skipped||0}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <CloseBtn onClick={()=>{ setZipPreview(null); setFiles([]); }}>Vissza</CloseBtn>
                      <ImportButton onClick={commitZip} disabled={importing}>{importing? 'Mentés…':'Import'}</ImportButton>
                    </div>
                  </div>
                </div>
              ) : !stmPreview ? (
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop: 12 }}>
                  <CloseBtn onClick={()=>setShowImport(false)}>Mégse</CloseBtn>
                  <ImportButton onClick={doImport} disabled={importing}>{importing? 'Feldolgozás…': (tab==='zip'?'Előnézet':'Előnézet')}</ImportButton>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight:600, marginBottom:8 }}>Előnézet és jóváhagyás</div>
                  {(stmPreview||[]).map((h, hIdx) => (
                    <div key={hIdx} style={{ border:'1px solid #eee', borderRadius:6, marginBottom:10, overflow:'hidden' }}>
                      <div style={{ position:'sticky', top:0, background:'#fafafa', padding:'8px 8px', borderBottom:'1px solid #eee', color:'#2c3e50', zIndex:1 }}>
                        Számla: {h.account_label || h.account_id} | Dátum: {h.statement_date} | Sorszám: {h.sequence_number || '-'} | Deviza: {h.currency}
                      </div>
                      <div style={{ padding:8 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                        <colgroup>
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '23%' }} />
                          <col style={{ width: '15%' }} />
                          <col style={{ width: '17%' }} />
                          <col style={{ width: '17%' }} />
                          <col style={{ width: '5%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Összeg</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Értéknap</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Közlemény</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>P.Számlaszám</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Partner</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számla</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Mentés</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(h.items||[]).map((it, iIdx) => (
                            <tr key={iIdx}>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', whiteSpace:'nowrap' }}>{(it.amount!=null)? it.amount.toLocaleString('hu-HU', { minimumFractionDigits: 2 }): '-' } {it.currency}</td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{it.value_date || '-'}</td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.remittance || it.comment || ''}>
                                  {it.remittance || it.comment || ''}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', fontSize: '0.85em', color: '#555' }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.counterparty_account || ''}>
                                  {it.counterparty_account || '-'}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.proposed_customer?.name || it.counterparty_name || ''}>
                                    {it.proposed_customer?.name || it.counterparty_name || '-'}
                                  </div>
                                  {(it.customer_candidates?.length>0) && (
                                    <select style={{ width:'100%', fontSize:'0.9em' }} onChange={(e)=>{
                                      const [id, name] = (e.target.value||'').split('::');
                                      if (id) setCustomer(hIdx, iIdx, { id, name });
                                    }} defaultValue="">
                                      <option value="">— Partner kiválasztása —</option>
                                      {it.customer_candidates.map(c => (
                                        <option key={c.id} value={`${c.id}::${c.name}`}>{c.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.proposed_invoice?.invoice_number || ''}>
                                    {it.proposed_invoice?.invoice_number || '-'}
                                  </div>
                                  {(it.candidates?.length>1) && (
                                    <select style={{ width:'100%', fontSize:'0.9em' }} onChange={(e)=>{
                                      const [id, invoice_number] = (e.target.value||'').split('::');
                                      if (id) setInvoice(hIdx, iIdx, { id, invoice_number });
                                    }} defaultValue="">
                                      <option value="">— Számla kiválasztása —</option>
                                      {it.candidates.map(c => (
                                        <option key={c.id} value={`${c.id}::${c.invoice_number}`}>{c.invoice_number} ({(c.amount||0).toLocaleString('hu-HU',{minimumFractionDigits:2})})</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <label style={{ display:'inline-flex', alignItems:'center', gap:6, cursor: 'pointer', whiteSpace: 'nowrap' }} title="Bankszámla mentés az ügyfélhez">
                                  <input type="checkbox" checked={!!it.save_bank_account} onChange={(e)=>setSaveBankAccount(hIdx, iIdx, e.target.checked)} />
                                  mentés
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                       </table>
                      </div>
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop: 12 }}>
                    <CloseBtn onClick={()=>{ setStmPreview(null); setFiles([]); }}>Vissza</CloseBtn>
                    <ImportButton onClick={commitStm}>Mentés</ImportButton>
                  </div>
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default BankStatements;
