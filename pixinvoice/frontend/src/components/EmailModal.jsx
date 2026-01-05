import React, { useEffect, useState } from 'react';
import { contactAPI } from '../services/api';

export default function EmailModal({
  isOpen,
  onClose,
  onSend,
  defaultFrom,
  defaultTo = [],
  defaultCc = [],
  defaultBcc = [],
  defaultSubject = '',
  defaultBody = '',
  customerId,
  invoiceId,
  attachmentsHint,
  defaultUseThunderbird = false,
  defaultThunderbirdPath = '',
}) {
  const [from, setFrom] = useState(defaultFrom || '');
  const [to, setTo] = useState(defaultTo.join(', '));
  const [cc, setCc] = useState(defaultCc.join(', '));
  const [bcc, setBcc] = useState(defaultBcc.join(', '));
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [assignTarget, setAssignTarget] = useState('to');
  const [useThunderbird, setUseThunderbird] = useState(!!defaultUseThunderbird);
  const [thunderbirdPath, setThunderbirdPath] = useState(defaultThunderbirdPath || '');

  useEffect(() => {
    if (isOpen) {
      setFrom(defaultFrom || '');
      setTo((defaultTo || []).join(', '));
      setCc((defaultCc || []).join(', '));
      setBcc((defaultBcc || []).join(', '));
      setSubject(defaultSubject || '');
      setBody(defaultBody || '');
  setUseThunderbird(!!defaultUseThunderbird);
  setThunderbirdPath(defaultThunderbirdPath || '');
      setSending(false);
      // Load contacts for customer
      if (customerId) {
        contactAPI.getContacts({ customer_id: customerId, is_active: true })
          .then(res => setContacts(res.data?.results || res.data || []))
          .catch(() => setContacts([]));
      } else {
        setContacts([]);
      }
    }
  }, [isOpen, defaultFrom, defaultTo, defaultCc, defaultBcc, defaultSubject, defaultBody, customerId]);

  if (!isOpen) return null;

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend({
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        cc: cc.split(',').map((s) => s.trim()).filter(Boolean),
        bcc: bcc.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        body,
        use_thunderbird: useThunderbird,
        thunderbird_path: thunderbirdPath,
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Hiba az e-mail küldésekor.');
    } finally {
      setSending(false);
    }
  };

  const addEmail = (email) => {
    const norm = (email || '').trim();
    if (!norm) return;
    const addTo = (current) => {
      const arr = current.split(',').map(s => s.trim()).filter(Boolean);
      if (!arr.includes(norm)) arr.push(norm);
      return arr.join(', ');
    };
    if (assignTarget === 'to') setTo(prev => addTo(prev));
    else if (assignTarget === 'cc') setCc(prev => addTo(prev));
    else setBcc(prev => addTo(prev));
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>E-mail küldése</h3>
          {invoiceId && (
            <div style={{ gridColumn: '1 / span 2', marginTop: 6 }}>
              Csatolmány: <a href={`/api/invoices/${invoiceId}/pdf/`} target="_blank" rel="noreferrer">Számla PDF megnyitása</a>
            </div>
          )}
          {!invoiceId && attachmentsHint && (
            <div style={{ gridColumn: '1 / span 2', marginTop: 6, color: '#6c757d' }}>
              {attachmentsHint}
            </div>
          )}
        </div>
        <div style={styles.content}>
          <label style={styles.label}>Feladó</label>
          <input style={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from@example.com" />

          <label style={styles.label}>Címzettek (To)</label>
          <input style={styles.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="a@b.hu, c@d.hu" />

          <label style={styles.label}>Másolat (Cc)</label>
          <input style={styles.input} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="" />

          <label style={styles.label}>Rejtett másolat (Bcc)</label>
          <input style={styles.input} value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="" />

          <label style={styles.label}>Tárgy</label>
          <input style={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} />

          <label style={styles.label}>Üzenet</label>
          <textarea style={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
          <div style={{ gridColumn: '1 / span 2', display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={useThunderbird} onChange={(e)=>setUseThunderbird(e.target.checked)} />
              Thunderbird használata
            </label>
            <input
              type="text"
              placeholder="/usr/bin/thunderbird"
              value={thunderbirdPath}
              onChange={(e)=>setThunderbirdPath(e.target.value)}
              style={{ flex: 1, padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
              disabled={!useThunderbird}
            />
          </div>
          {Array.isArray(contacts) && contacts.length > 0 && (
            <div style={styles.contactsContainer}>
              <div style={styles.contactsHeader}>
                <div>Kapcsolattartók</div>
                <div>
                  <label style={{ marginRight: 8 }}>
                    <input type="radio" name="assignTarget" value="to" checked={assignTarget==='to'} onChange={() => setAssignTarget('to')} /> To
                  </label>
                  <label style={{ marginRight: 8 }}>
                    <input type="radio" name="assignTarget" value="cc" checked={assignTarget==='cc'} onChange={() => setAssignTarget('cc')} /> Cc
                  </label>
                  <label>
                    <input type="radio" name="assignTarget" value="bcc" checked={assignTarget==='bcc'} onChange={() => setAssignTarget('bcc')} /> Bcc
                  </label>
                </div>
              </div>
              <div style={styles.contactsList}>
                {contacts.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—';
                  const mail = c.email;
                  if (!mail) return null;
                  return (
                    <button key={c.id || mail} type="button" style={styles.contactChip} onClick={() => addEmail(mail)} title={mail}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={styles.footer}>
          <button onClick={onClose} disabled={sending}>Mégse</button>
          <button onClick={handleSend} disabled={sending} style={{ marginLeft: 8 }}>
            {sending ? 'Küldés...' : 'Küldés'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: 'min(900px, 94vw)',
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    background: '#fafafa',
  },
  content: {
    padding: 16,
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gridRowGap: 10,
    gridColumnGap: 12,
  },
  label: {
    alignSelf: 'center',
    fontWeight: 500,
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    gridColumn: '1 / span 2',
  },
  footer: {
    padding: 12,
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid #eee',
    background: '#fafafa',
  },
  contactsContainer: {
    gridColumn: '1 / span 2',
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #eee',
  },
  contactsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  contactsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactChip: {
    padding: '6px 10px',
    background: '#eef6ff',
    border: '1px solid #cfe2ff',
    borderRadius: 16,
    color: '#0d6efd',
    cursor: 'pointer',
  },
};
