import React, { useEffect, useState } from 'react';
import { contactAPI } from '../services/api';

export default function EmailModal({
  isOpen,
  onClose,
  onSend,
  defaultFrom,
  defaultReplyTo = '',
  defaultTo = [],
  defaultCc = [],
  defaultBcc = [],
  defaultSubject = '',
  defaultBody = '',
  customerId,
  invoiceId,
  attachmentsHint,
  attachments = [],
}) {
  const [from, setFrom] = useState(defaultFrom || '');
  const [replyTo, setReplyTo] = useState(defaultReplyTo || '');
  const [to, setTo] = useState(defaultTo.join(', '));
  const [cc, setCc] = useState(defaultCc.join(', '));
  const [bcc, setBcc] = useState(defaultBcc.join(', '));
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [assignTarget, setAssignTarget] = useState('to');
  const [htmlMode, setHtmlMode] = useState(false); // false = visual preview, true = raw HTML source

  // New features
  const [showStatus, setShowStatus] = useState(false);
  const [statusLog, setStatusLog] = useState([]);
  const [statusError, setStatusError] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFrom(defaultFrom || '');
      setReplyTo(defaultReplyTo || '');
      setTo((defaultTo || []).join(', '));
      setCc((defaultCc || []).join(', '));
      setBcc((defaultBcc || []).join(', '));
      setSubject(defaultSubject || '');
      setBody(defaultBody || '');
      setSending(false);
      setShowStatus(false);
      setStatusModalOpen(false);
      setStatusLog([]);
      setStatusError(null);
      // Auto-switch to HTML source if body contains a table
      setHtmlMode(/(<table|<tr|<td|<th)/i.test(defaultBody || ''));
      // Load contacts for customer
      if (customerId) {
        contactAPI.getContacts({ customer_id: customerId, is_active: true })
          .then(res => setContacts(res.data?.results || res.data || []))
          .catch(() => setContacts([]));
      } else {
        setContacts([]);
      }
    }
  }, [isOpen, defaultFrom, defaultReplyTo, defaultTo, defaultCc, defaultBcc, defaultSubject, defaultBody, customerId]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (showStatus) {
       setStatusModalOpen(true);
       setStatusLog(['Csatlakozás a kiszolgálóhoz...', 'Levél küldése folyamatban...']);
       setStatusError(null);
    }
    setSending(true);
    try {
      await onSend({
        from,
        reply_to: replyTo,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        cc: cc.split(',').map((s) => s.trim()).filter(Boolean),
        bcc: bcc.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        body,
      });
      if (showStatus) {
        setStatusLog(prev => [...prev, 'Sikeres küldés!']);
        setTimeout(() => {
           setStatusModalOpen(false);
           onClose();
        }, 1500); 
      } else {
        onClose();
      }
    } catch (e) {
      console.error(e);
      if (showStatus) {
         // Extract error message
         const msg = e?.response?.data?.error || e.message || 'Ismeretlen hiba';
         setStatusError(`Nem sikerült csatlakozni az smtp szerverhez (${msg})`);
      } else {
         alert('Hiba az e-mail küldésekor.');
      }
    } finally {
      if (!showStatus || statusError) {
         setSending(false);
      }
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
          {attachments && attachments.length > 0 ? (
            <div style={{ gridColumn: '1 / span 2', marginTop: 6 }}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Csatolmányok:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {attachments.map(inv => (
                  <a
                    key={inv.id}
                    href={`/api/invoices/${inv.id}/pdf/`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      textDecoration: 'none',
                      color: '#3498db',
                      background: '#f8f9fa',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #dee2e6',
                      fontSize: '0.9em',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                  >
                    📄 {inv.invoice_number}.pdf
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
        <form autoComplete="off" onSubmit={e => e.preventDefault()} style={{ display: 'contents' }}>
        {/* hidden honeypot inputs to absorb Chrome autofill */}
        <input type="text" name="pxi_absorb1" style={{ display: 'none' }} />
        <input type="text" name="pxi_absorb2" style={{ display: 'none' }} />
        <div style={styles.content}>
          <label style={styles.label}>Feladó</label>
          <input style={styles.input} name="pxi_from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from@example.com" autoComplete="off" />

          <label style={styles.label}>Válaszcím (Reply-to)</label>
          <input style={styles.input} name="pxi_replyto" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reply@example.com" autoComplete="off" />

          <label style={styles.label}>Címzettek (To)</label>
          <input style={styles.input} name="pxi_to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="a@b.hu, c@d.hu" autoComplete="off" />

          <label style={styles.label}>Másolat (Cc)</label>
          <input style={styles.input} name="pxi_cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="" autoComplete="off" />

          <label style={styles.label}>Rejtett másolat (Bcc)</label>
          <input style={styles.input} name="pxi_bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="" autoComplete="off" />

          <label style={styles.label}>Tárgy</label>
          <input style={styles.input} name="pxi_subject" value={subject} onChange={(e) => setSubject(e.target.value)} autoComplete="off" />

          <label style={styles.label}>Üzenet</label>
          <div style={{ gridColumn: '1 / span 2', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => setHtmlMode(m => !m)}
                style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #ccc', borderRadius: 4, background: '#f5f5f5', cursor: 'pointer', color: '#555' }}
              >
                {htmlMode ? '👁 Előnézet' : '</> HTML forrás'}
              </button>
            </div>
            {htmlMode ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ width: '100%', minHeight: 280, fontFamily: 'monospace', fontSize: 12, border: '1px solid #d0d7de', borderRadius: 4, padding: 8, boxSizing: 'border-box', resize: 'vertical' }}
              />
            ) : (
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => setBody(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: body }}
                style={{
                  minHeight: 280, border: '1px solid #d0d7de', borderRadius: 4, padding: 12,
                  background: '#fff', fontSize: 14, lineHeight: 1.5, overflowY: 'auto',
                  outline: 'none',
                }}
              />
            )}
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
        </form>
        <div style={styles.footer}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
             <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} title="Részletes státusz megjelenítése küldés közben">
                <input type="checkbox" checked={showStatus} onChange={(e)=>setShowStatus(e.target.checked)} style={{ marginRight: 8 }} />
                Küldési státusz mutatása
             </label>
          </div>
          <button onClick={onClose} disabled={sending} style={{...styles.btnBase, ...styles.btnSecondary}}>Mégse</button>
          <button onClick={handleSend} disabled={sending} style={{...styles.btnBase, ...styles.btnPrimary}}>
            {sending ? 'Küldés...' : 'Küldés'}
          </button>
        </div>
      </div>
      
      {statusModalOpen && (
        <div style={styles.statusOverlay}>
           <div style={styles.statusBox}>
              <h4 style={{marginTop:0, marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8}}>Küldés folyamata</h4>
              <ul style={{listStyle:'none', padding:0, margin: 0}} className="status-log">
                 {statusLog.map((l,i) => <li key={i} style={{marginBottom: 4}}>✓ {l}</li>)}
              </ul>
              {statusError && (
                 <div style={{color:'#d32f2f', marginTop:12, padding: 10, background:'#ffebee', borderRadius:4, border: '1px solid #ffcdd2', fontSize: 13}}>
                    <strong>Hiba!</strong> {statusError}
                 </div>
              )}
              {statusError && (
                 <div style={{marginTop:16, textAlign:'right'}}>
                    <button onClick={() => setStatusModalOpen(false)} style={{...styles.btnBase, ...styles.btnSecondary, background: '#fff', border: '1px solid #ccc'}}>Bezárás</button>
                 </div>
              )}
           </div>
        </div>
      )}
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
  btnBase: {
    padding: '8px 16px',
    borderRadius: 6,
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    fontSize: '14px',
  },
  btnSecondary: {
    background: '#f1f2f6',
    color: '#2c3e50',
  },
  btnPrimary: {
    background: '#3498db',
    color: '#fff',
    marginLeft: 12,
  },
  statusOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255,255,255,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderRadius: 8,
  },
  statusBox: {
    background: '#fff',
    border: '1px solid #ddd',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: 24,
    borderRadius: 8,
    width: '320px',
    maxWidth: '90%',
  },
};
