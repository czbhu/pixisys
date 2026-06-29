import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { proformaAPI, emailSettingsAPI, emailTemplateAPI } from '../services/api';
import { Edit, Trash2, Copy, FileText, Mail, Eye, DollarSign } from 'lucide-react';
import EmailModal from '../components/EmailModal';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
`;
const Header = styled.div`
  padding: 24px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;

  @media (max-width: 768px) {
    padding: 12px;
    gap: 10px;
  }
`;
const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: #2c3e50;

  @media (max-width: 768px) {
    font-size: 20px;
    width: 100%;
  }
`;
const ActionButton = styled(Link)`
  padding: 10px 20px;
  background: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  &:hover { background: #2980b9; }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;
const TableContainer = styled.div`
  overflow-x: auto;

  @media (max-width: 768px) {
    overflow-x: hidden;
  }
`;
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;
const Th = styled.th`
  padding: 12px 16px;
  text-align: left;
  background: #f8f9fa;
  border-bottom: 2px solid #ecf0f1;
  font-size: 13px;
  color: #7f8c8d;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    ${props => props.$hideOnMobile && 'display: none;'}
    ${props => props.$mobileWidth && `width: ${props.$mobileWidth};`}
    ${props => props.$mobileTextRight && 'text-align: right;'}
  }
`;
const Td = styled.td`
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: top;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    ${props => props.$hideOnMobile && 'display: none;'}
    ${props => props.$mobileWidth && `width: ${props.$mobileWidth};`}
    ${props => props.$mobileTextRight && 'text-align: right; white-space: nowrap;'}
  }
`;
const MainActionsTd = styled(Td)`
  @media (max-width: 768px) {
    display: none;
  }
`;
const MobileActionsRow = styled.tr`
  display: none;

  @media (max-width: 768px) {
    display: ${props => (props.$open ? 'table-row' : 'none')};
  }
`;
const MobileActionsCell = styled.td`
  display: none;

  @media (max-width: 768px) {
    display: table-cell;
    padding: 8px 6px;
    border-bottom: 1px solid #ecf0f1;
    background: #fff;
  }
`;
const MobileActionsBar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;
const SmallMuted = styled.div`font-size: 11px; color: #6b7280; margin-top: 2px;`;

const ROW_COLORS = {
  unpaid: '#dbeafe',    // halvány kék
  partial: '#fef9c3',  // halvány sárga
  paid: '#fef9c3',      // halvány sárga (fizetve, nincs számla)
  invoiced: '#dcfce7', // halvány zöld
};

const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
`;
const ModalBox = styled.div`
  background: white; border-radius: 10px; padding: 28px; width: 420px; max-width: 95vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
`;
const ModalTitle = styled.h2`margin: 0 0 18px; font-size: 17px; color: #2c3e50;`;
const Label = styled.label`display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #374151;`;
const Input = styled.input`
  width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 14px; box-sizing: border-box; margin-bottom: 12px;
`;
const BtnRow = styled.div`display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px;`;
const Btn = styled.button`
  padding: 8px 18px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500;
  ${p => p.$primary ? 'background: #3498db; color: white;' : 'background: #ecf0f1; color: #374151;'}
  &:disabled { opacity: 0.6; }
`;

const formatMoney = (v) => v != null ? Number(v).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';

export default function Proformas() {
  const queryClient = useQueryClient();

  const [companyId, setCompanyId] = React.useState(() => {
    try {
      const raw = localStorage.getItem('selectedCompanyId');
      if (!raw || raw === 'undefined' || raw === 'null') return null;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRe.test(raw) ? raw : null;
    } catch { return null; }
  });

  React.useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem('selectedCompanyId');
        const cid = (raw && raw !== 'undefined' && raw !== 'null') ? raw : null;
        setCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    const id = setInterval(sync, 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, []);

  const { data, isLoading } = useQuery(
    ['proformas', { company_id: companyId }],
    () => proformaAPI.getProformas(companyId ? { company_id: companyId } : {}),
    { select: (res) => res.data?.results || res.data || [] }
  );
  const deleteMutation = useMutation((id) => proformaAPI.deleteProforma(id), {
    onSuccess: () => queryClient.invalidateQueries('proformas'),
  });
  const copyMutation = useMutation((id) => proformaAPI.copyProforma(id), {
    onSuccess: () => queryClient.invalidateQueries('proformas'),
  });

  // Mobile actions
  const [mobileActionsProformaId, setMobileActionsProformaId] = useState(null);

  const isMobileViewport = () => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  };

  const toggleMobileActionsForRow = React.useCallback((id) => {
    setMobileActionsProformaId((prev) => (prev === id ? null : id));
  }, []);

  const handleRowTouchTap = React.useCallback((event, id) => {
    if (!isMobileViewport()) return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('input,button,a,label,select,textarea,[role="button"]')) return;
    event.preventDefault();
    toggleMobileActionsForRow(id);
  }, [toggleMobileActionsForRow]);

  const handleRowContextMenu = React.useCallback((event, id) => {
    if (!isMobileViewport()) return;
    event.preventDefault();
    toggleMobileActionsForRow(id);
  }, [toggleMobileActionsForRow]);

  // Pay modal
  const [payRow, setPayRow] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [paying, setPaying] = useState(false);

  const openPay = (pf) => {
    setPayRow(pf);
    setPayAmount(String(parseFloat(pf.total_gross_amount || 0).toFixed(2)));
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  const handlePay = async () => {
    if (!payRow) return;
    setPaying(true);
    try {
      await proformaAPI.markPaid(payRow.id, payAmount, payDate);
      queryClient.invalidateQueries('proformas');
      setPayRow(null);
    } catch (e) {
      alert(e?.response?.data?.error || 'Hiba a kifizetés rögzítésekor');
    } finally {
      setPaying(false);
    }
  };

  // Email modal
  const [emailModalOpen, setEmailModalOpen] = React.useState(false);
  const [emailProforma, setEmailProforma] = React.useState(null);
  const [emailDefaults, setEmailDefaults] = React.useState({});

  const openEmailModal = async (pf) => {
    setEmailProforma(pf);
    try {
      const [settingsRes, templatesRes] = await Promise.all([
        emailSettingsAPI.getSettings(),
        emailTemplateAPI.list({
          company_id: pf?.company?.id || companyId || undefined,
        }),
      ]);
      const settings = settingsRes.data;
      const templates = Array.isArray(templatesRes.data) ? templatesRes.data : (templatesRes.data?.results || []);
      const tpl = templates.find((t) => t?.template_type === 'proforma_send' && t?.language === 'hu' && t?.is_active !== false)
        || templates.find((t) => t?.template_type === 'proforma_send' && t?.is_active !== false)
        || templates.find((t) => t?.template_type === 'invoice_send' && t?.language === 'hu' && t?.is_active !== false)
        || templates.find((t) => t?.template_type === 'invoice_send' && t?.is_active !== false)
        || templates[0];
      const replaceTpl = (source, vars) => {
        let out = String(source || '');
        Object.entries(vars || {}).forEach(([k, v]) => {
          const val = String(v ?? '');
          out = out
            .replaceAll(`{{${k}}}`, val)
            .replaceAll(`{${k}}`, val);
        });
        return out;
      };
      const vars = {
        invoice_number: pf?.proforma_number || '',
        proforma_number: pf?.proforma_number || '',
        customer_name: pf?.customer?.name || '',
        company_name: pf?.company?.name || '',
      };
      const renderedSubject = replaceTpl(tpl?.subject_template || '', vars).trim();
      const renderedBody = replaceTpl(tpl?.body_template || '', vars).trim();
      setEmailDefaults({
        defaultFrom: settings?.default_from || '',
        defaultReplyTo: settings?.default_reply_to || '',
        defaultTo: pf.customer?.email || '',
        defaultCc: '',
        defaultBcc: '',
        defaultSubject: renderedSubject || `Díjbekérő: ${pf.proforma_number}`,
        defaultBody: renderedBody || `Tisztelt Partner!<br><br>Küldjük a díjbekérőt: ${pf.proforma_number}.<br><br>Üdvözlettel,`,
      });
    } catch {
      setEmailDefaults({
        defaultFrom: '',
        defaultReplyTo: '',
        defaultTo: pf.customer?.email || '',
        defaultCc: '',
        defaultBcc: '',
        defaultSubject: `Díjbekérő: ${pf.proforma_number}`,
        defaultBody: `Tisztelt Partner!<br><br>Küldjük a díjbekérőt: ${pf.proforma_number}.<br><br>Üdvözlettel,`,
      });
    }
    setEmailModalOpen(true);
  };

  const sendEmailFromModal = async (payload) => {
    try {
      await proformaAPI.sendEmail(emailProforma.id, payload);
      alert('E-mail elküldve!');
    } catch (e) {
      const msg = e?.response?.data?.error || 'E-mail küldési hiba';
      alert(msg);
      throw e;
    }
  };

  const list = Array.isArray(data) ? data : (data?.results || []);

  return (
    <>
    <Container>
      <Header>
        <Title>Díjbekérők</Title>
        <ActionButton to="/proformas/new">Új díjbekérő</ActionButton>
      </Header>
      {isLoading ? (
        <div style={{ padding: 20 }}>Betöltés...</div>
      ) : (
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <Th>Szám</Th>
                <Th $hideOnMobile>Dátum</Th>
                <Th>Ügyfél</Th>
                <Th $mobileTextRight style={{textAlign:'right'}}>Összeg (bruttó)</Th>
                <Th $hideOnMobile>Műveletek</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((pf) => {
                const status = pf.status || 'unpaid';
                const isPaid = status === 'paid' || status === 'partial';
                const isInvoiced = status === 'invoiced';
                const gross = parseFloat(pf.total_gross_amount || 0);
                const amountPaid = parseFloat(pf.amount_paid || 0);
                const remaining = gross - amountPaid;
                const rowBg = ROW_COLORS[status] || ROW_COLORS.unpaid;
                const actionButtons = (
                  <>
                    {(status === 'unpaid' || status === 'partial') && (
                      <button onClick={() => openPay(pf)} title="Kifizetés rögzítése" style={{ border: 'none', background: '#dcfce7', color: '#166534', cursor: 'pointer', borderRadius:4, padding:'2px 8px', fontWeight:600, fontSize:12 }}>Fizet</button>
                    )}
                    <Link to={`/proformas/${pf.id}/edit`} title="Szerkesztés" style={{ color: '#3498db' }}><Edit size={18} /></Link>
                    <button onClick={() => copyMutation.mutate(pf.id)} title="Másolat" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2c3e50' }}><Copy size={18} /></button>
                    <a href={proformaAPI.getPdfUrl(pf.id)} target="_blank" rel="noreferrer" title="PDF megtekintése" style={{ color: '#16a085' }}><Eye size={18} /></a>
                    <button onClick={() => openEmailModal(pf)} title="E-mail küldése" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e67e22' }}><Mail size={18} /></button>
                    <button onClick={() => { if(window.confirm('Törlöd a díjbekérőt?')) deleteMutation.mutate(pf.id); }} title="Törlés" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e74c3c' }}><Trash2 size={18} /></button>
                    <Link to={`/invoices/new?from_proforma=${pf.id}`} title="Számla díjbekérő alapján" style={{ color: '#27ae60' }}><FileText size={18} /></Link>
                    <Link to={`/invoices/new?from_proforma=${pf.id}&advance=1`} title="Előlegszámla díjbekérő alapján" style={{ color: '#8e44ad' }}><FileText size={18} /></Link>
                  </>
                );
                return (
                  <React.Fragment key={pf.id}>
                  <tr
                    style={{ background: rowBg }}
                    onContextMenu={(event) => handleRowContextMenu(event, pf.id)}
                    onTouchEnd={(event) => handleRowTouchTap(event, pf.id)}
                  >
                    <Td>
                      <div>{pf.proforma_number}</div>
                    </Td>
                    <Td $hideOnMobile>{pf.issue_date}</Td>
                    <Td>{pf.customer?.name || ''}</Td>
                    <Td $mobileTextRight style={{textAlign:'right', fontWeight:600}}>
                      <div>{formatMoney(gross)}</div>
                      {isPaid && status !== 'partial' && pf.payment_date && (
                        <SmallMuted style={{color:'#166534'}}>Rendezve: {pf.payment_date}</SmallMuted>
                      )}
                      {status === 'partial' && (
                        <SmallMuted style={{color:'#854d0e'}}>Fizetve: {formatMoney(amountPaid)} — Maradék: {formatMoney(remaining)}</SmallMuted>
                      )}
                    </Td>
                    <MainActionsTd>
                      <div style={{ display: 'flex', gap: 8, flexWrap:'wrap' }}>
                        {actionButtons}
                      </div>
                    </MainActionsTd>
                  </tr>
                  <MobileActionsRow $open={mobileActionsProformaId === pf.id}>
                    <MobileActionsCell colSpan={5}>
                      <MobileActionsBar>
                        {actionButtons}
                      </MobileActionsBar>
                    </MobileActionsCell>
                  </MobileActionsRow>
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        </TableContainer>
      )}
      {emailModalOpen && (
        <EmailModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          onSend={sendEmailFromModal}
          defaultFrom={emailDefaults.defaultFrom}
          defaultReplyTo={emailDefaults.defaultReplyTo}
          defaultTo={emailDefaults.defaultTo}
          defaultCc={emailDefaults.defaultCc}
          defaultBcc={emailDefaults.defaultBcc}
          defaultSubject={emailDefaults.defaultSubject}
          defaultBody={emailDefaults.defaultBody}
          customerId={emailProforma?.customer?.id}
          attachmentsHint={emailProforma ? `Csatolmány: ${emailProforma.proforma_number}.pdf (díjbekérő)` : ''}
        />
      )}
    </Container>

    {payRow && (
      <ModalOverlay onClick={() => setPayRow(null)}>
        <ModalBox onClick={e => e.stopPropagation()}>
          <ModalTitle>Kifizetés rögzítése – {payRow.proforma_number}</ModalTitle>
          <Label>Kifizetett összeg ({payRow.currency || 'HUF'})</Label>
          <Input
            type="number" step="0.01" autoFocus
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
          />
          {parseFloat(payAmount || 0) < parseFloat(payRow.total_gross_amount || 0) - 0.005 && (
            <div style={{fontSize:12, color:'#b45309', marginBottom:10}}>
              Fennmaradó: {formatMoney(parseFloat(payRow.total_gross_amount||0) - parseFloat(payAmount||0))} {payRow.currency || 'HUF'}
            </div>
          )}
          <Label>Fizetés dátuma</Label>
          <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          <BtnRow>
            <Btn onClick={() => setPayRow(null)}>Mégse</Btn>
            <Btn $primary onClick={handlePay} disabled={paying || !payAmount || !payDate}>
              {paying ? 'Mentés…' : 'Kifizetés rögzítése'}
            </Btn>
          </BtnRow>
        </ModalBox>
      </ModalOverlay>
    )}
    </>
  );
}
