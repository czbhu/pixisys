import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { emailSettingsAPI } from '../services/api';
import { toast } from 'react-toastify';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 24px;
  max-width: 900px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 24px 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 12px;
`;

const Label = styled.label`
  align-self: center;
`; 

const Input = styled.input`
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
`;

const Textarea = styled.textarea`
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
`;

const Row = styled.div`
  grid-column: 1 / span 2;
`;

const Actions = styled.div`
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;
`;

export default function EmailSettings() {
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({ smtp: false, imap: false });
  const [testTo, setTestTo] = useState('');
  const [mailboxes, setMailboxes] = useState([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentEmails, setRecentEmails] = useState([]);

  useEffect(() => {
    const cid = localStorage.getItem('selectedCompanyId');
    setCompanyId(cid);
  }, []);

  useEffect(() => {
    async function load() {
      if (!companyId) { setLoading(false); return; }
      setLoading(true);
      try {
        const res = await emailSettingsAPI.getSettings({ company_id: companyId });
        const rec = (res.data?.results && res.data.results[0]) || (Array.isArray(res.data) ? res.data[0] : res.data) || null;
        setData(rec || { company: companyId, smtp_port: 587, smtp_use_tls: true, imap_port: 993, imap_sent_folder: 'Sent' });
      } catch (e) {
        setData({ company: companyId, smtp_port: 587, smtp_use_tls: true, imap_port: 993, imap_sent_folder: 'Sent' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const payload = { ...data };
      if (!payload.company && companyId) payload.company = companyId;
      const toInt = (v, def) => (v === '' || v == null ? def : parseInt(v, 10));
      payload.smtp_port = toInt(payload.smtp_port, 587);
      payload.imap_port = toInt(payload.imap_port, 993);
      if (data.id) {
        await emailSettingsAPI.update(data.id, payload);
      } else {
        const res = await emailSettingsAPI.create(payload);
        setData(res.data);
      }
      toast.success('E-mail beállítások mentve');
    } catch (e) {
      toast.error('Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const testSMTP = async () => {
    setTesting((t)=>({ ...t, smtp: true }));
    try {
      const payload = {
        smtp_host: data?.smtp_host,
        smtp_port: data?.smtp_port,
        smtp_user: data?.smtp_user,
        smtp_password: data?.smtp_password,
        smtp_use_tls: data?.smtp_use_tls,
        smtp_from: data?.smtp_from,
      };
      if (companyId) payload.company_id = companyId;
      if (testTo && testTo.trim()) payload.to = testTo.trim();
      const res = await emailSettingsAPI.testSMTP(payload);
      if (res.data?.success) {
        toast.success(res.data?.message || 'SMTP rendben');
      } else {
        toast.error(res.data?.error || 'SMTP hiba');
      }
    } catch (e) {
      toast.error('SMTP hiba');
    } finally {
      setTesting((t)=>({ ...t, smtp: false }));
    }
  };

  const testIMAP = async () => {
    setTesting((t)=>({ ...t, imap: true }));
    try {
      const payload = {
        imap_host: data?.imap_host,
        imap_user: data?.imap_user,
        imap_password: data?.imap_password,
        imap_port: data?.imap_port,
      };
      if (companyId) payload.company_id = companyId;
      const res = await emailSettingsAPI.testIMAP(payload);
      if (res.data?.success) {
        toast.success(res.data?.message || 'IMAP rendben');
      } else {
        toast.error(res.data?.error || 'IMAP hiba');
      }
    } catch (e) {
      toast.error('IMAP hiba');
    } finally {
      setTesting((t)=>({ ...t, imap: false }));
    }
  };

  const fetchRecentIMAP = async () => {
    setRecentLoading(true);
    try {
      const payload = {
        imap_host: data?.imap_host,
        imap_user: data?.imap_user,
        imap_password: data?.imap_password,
        imap_port: data?.imap_port,
      };
      if (companyId) payload.company_id = companyId;
      const res = await emailSettingsAPI.imapRecent(payload);
      if (res.data?.success) {
        setRecentEmails(res.data.messages || []);
        setRecentOpen(true);
      } else {
        toast.error(res.data?.error || 'IMAP lekérdezési hiba');
      }
    } catch (e) {
      toast.error('IMAP lekérdezési hiba');
    } finally {
      setRecentLoading(false);
    }
  };

  if (loading) return <Container>Betöltés...</Container>;
  if (!companyId) return <Container>Nincs kiválasztott cég.</Container>;

  return (
    <Container>
      <Title>E-mail beállítások</Title>
      <Grid>
        <Label>SMTP host</Label>
        <Input value={data?.smtp_host || ''} onChange={(e)=>setData({ ...data, smtp_host: e.target.value })} />

        <Label>SMTP port</Label>
        <Input inputMode="numeric" pattern="[0-9]*" value={data?.smtp_port ?? 587}
          onChange={(e)=>{
            const v = e.target.value.replace(/[^0-9]/g,'');
            setData({ ...data, smtp_port: v === '' ? '' : parseInt(v,10) });
          }} />

        <Label>SMTP user</Label>
        <Input value={data?.smtp_user || ''} onChange={(e)=>setData({ ...data, smtp_user: e.target.value })} />

        <Label>SMTP password</Label>
        <Input type="password" value={data?.smtp_password || ''} onChange={(e)=>setData({ ...data, smtp_password: e.target.value })} />

        <Label>Use TLS</Label>
        <input type="checkbox" checked={!!data?.smtp_use_tls} onChange={(e)=>setData({ ...data, smtp_use_tls: e.target.checked })} />

        <Label>From e-mail</Label>
        <Input value={data?.smtp_from || ''} onChange={(e)=>setData({ ...data, smtp_from: e.target.value })} />

        <Row />
        <Label>IMAP host</Label>
        <Input value={data?.imap_host || ''} onChange={(e)=>setData({ ...data, imap_host: e.target.value })} />

        <Label>IMAP user</Label>
        <Input value={data?.imap_user || ''} onChange={(e)=>setData({ ...data, imap_user: e.target.value })} />

        <Label>IMAP password</Label>
        <Input type="password" value={data?.imap_password || ''} onChange={(e)=>setData({ ...data, imap_password: e.target.value })} />

        <Label>IMAP port</Label>
        <Input inputMode="numeric" pattern="[0-9]*" value={data?.imap_port ?? 993}
          onChange={(e)=>{
            const v = e.target.value.replace(/[^0-9]/g,'');
            setData({ ...data, imap_port: v === '' ? '' : parseInt(v,10) });
          }} />

        <Label>Sent mappa</Label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input style={{ flex: 1 }} value={data?.imap_sent_folder || 'Sent'} onChange={(e)=>setData({ ...data, imap_sent_folder: e.target.value })} />
          <button
            type="button"
            onClick={async ()=>{
              try {
                const payload = {
                  imap_host: data?.imap_host,
                  imap_user: data?.imap_user,
                  imap_password: data?.imap_password,
                  imap_port: data?.imap_port,
                };
                if (companyId) payload.company_id = companyId;
                const res = await emailSettingsAPI.detectIMAPSent(payload);
                if (res && res.success) {
                  setMailboxes(res.mailboxes || []);
                  if (res.suggested) {
                    setData({ ...data, imap_sent_folder: res.suggested });
                    toast.success(`Talált Sent mappa: ${res.suggested}`);
                  } else if ((res.mailboxes || []).length) {
                    toast.info('Válassz a listából a Sent mappát.');
                  } else {
                    toast.info('Nem találtunk mappákat.');
                  }
                } else {
                  toast.error((res && res.error) || 'IMAP mappa lekérdezési hiba');
                }
              } catch (e) {
                toast.error('IMAP mappa lekérdezési hiba');
              }
            }}
          >Auto-detekció</button>
          {mailboxes.length > 0 && (
            <select
              onChange={(e)=>{
                const val = e.target.value;
                if (val) setData({ ...data, imap_sent_folder: val });
              }}
              value=""
            >
              <option value="" disabled>Válaszd ki a Sent mappát…</option>
              {mailboxes.map((mb, idx)=> (
                <option key={`${mb.name}-${idx}`} value={mb.name}>{mb.label || mb.name}</option>
              ))}
            </select>
          )}
        </div>

        <Row />
        <Label>Alap tárgy sablon</Label>
        <Input value={data?.default_subject_template || ''} onChange={(e)=>setData({ ...data, default_subject_template: e.target.value })} />

        <Label>Alap levél sablon</Label>
        <Textarea rows={8} value={data?.default_body_template || ''} onChange={(e)=>setData({ ...data, default_body_template: e.target.value })} />

        <Row />
        <Label>Angol tárgy sablon</Label>
        <Input value={data?.subject_template_en || ''} onChange={(e)=>setData({ ...data, subject_template_en: e.target.value })} />

        <Label>Angol levél sablon</Label>
        <Textarea rows={8} value={data?.body_template_en || ''} onChange={(e)=>setData({ ...data, body_template_en: e.target.value })} />

        <Row />
        <Label>Feladó neve</Label>
        <Input value={data?.default_sender_name || ''} onChange={(e)=>setData({ ...data, default_sender_name: e.target.value })} />

        <Label>Feladó telefon</Label>
        <Input value={data?.default_sender_phone || ''} onChange={(e)=>setData({ ...data, default_sender_phone: e.target.value })} />

        <Row />
        <Label>Thunderbird használata</Label>
        <input type="checkbox" checked={!!data?.use_thunderbird} onChange={(e)=>setData({ ...data, use_thunderbird: e.target.checked })} />

        <Label>Thunderbird elérési út</Label>
        <Input placeholder="pl. /usr/bin/thunderbird" value={data?.thunderbird_path || ''} onChange={(e)=>setData({ ...data, thunderbird_path: e.target.value })} />
      </Grid>

      <Actions>
        <button onClick={save} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</button>
        <div style={{ flex: 1 }} />
        <input placeholder="Teszt e-mail cím" value={testTo} onChange={(e)=>setTestTo(e.target.value)} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }} />
        <button onClick={testSMTP} disabled={testing.smtp}>{testing.smtp ? 'SMTP teszt...' : 'SMTP teszt'}</button>
        <button onClick={testIMAP} disabled={testing.imap}>{testing.imap ? 'IMAP teszt...' : 'IMAP teszt'}</button>
        <button onClick={fetchRecentIMAP} disabled={recentLoading}>{recentLoading ? 'IMAP olvasás...' : 'IMAP legutóbbi 5'}</button>
      </Actions>

      {recentOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={()=>setRecentOpen(false)}>
          <div style={{ background: 'white', padding: 20, borderRadius: 8, width: 'min(800px, 95vw)', maxHeight: '80vh', overflow: 'auto' }} onClick={(e)=>e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>IMAP – legutóbbi 5 üzenet</h3>
              <button onClick={()=>setRecentOpen(false)}>Bezár</button>
            </div>
            <div style={{ marginTop: 12 }}>
              {recentEmails.length === 0 ? (
                <div>Nincs üzenet az INBOX-ban.</div>
              ) : (
                recentEmails.map((m) => (
                  <div key={m.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                    <div><strong>Dátum:</strong> {m.date || '-'}</div>
                    <div><strong>Feladó:</strong> {m.from || '-'}</div>
                    <div><strong>Tárgy:</strong> {m.subject || '-'}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
