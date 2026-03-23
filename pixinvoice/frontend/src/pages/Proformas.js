import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { proformaAPI, emailSettingsAPI, emailTemplateAPI } from '../services/api';
import { Edit, Trash2, Copy, FileText, Mail, Eye } from 'lucide-react';
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

const normalizeCompanyId = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(raw) ? raw : null;
};

const Proformas = () => {
  const [companyId, setCompanyId] = React.useState(() => {
    try { return normalizeCompanyId(localStorage.getItem('selectedCompanyId')); } catch { return null; }
  });
  React.useEffect(() => {
    const sync = () => {
      try {
        const cid = normalizeCompanyId(localStorage.getItem('selectedCompanyId'));
        setCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    const id = setInterval(sync, 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, []);

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    ['proformas', { company_id: companyId }],
    () => proformaAPI.getProformas(companyId ? { company_id: companyId } : {}),
    { select: (res) => res.data?.results || res.data || [] }
  );

  const deleteMutation = useMutation((id) => proformaAPI.deleteProforma(id), {
    onSuccess: () => queryClient.invalidateQueries('proformas')
  });
  const copyMutation = useMutation((id) => proformaAPI.copyProforma(id), {
    onSuccess: () => queryClient.invalidateQueries('proformas')
  });

  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = React.useState(false);
  const [emailProforma, setEmailProforma] = React.useState(null);
  const [emailDefaults, setEmailDefaults] = React.useState({});

  const applyTemplateVars = (tpl, vars) => {
    let out = String(tpl || '');
    for (const [key, value] of Object.entries(vars || {})) {
      out = out.replaceAll('{' + key + '}', String(value ?? ''));
    }
    return out;
  };

  const openEmailModal = async (pf) => {
    setEmailProforma(pf);
    const defTo = [];
    if (pf?.customer?.email) defTo.push(pf.customer.email);
    const company = pf?.company || {};
    const customer = pf?.customer || {};
    let subject = `Díjbekérő ${pf.proforma_number}`;
    const userName = localStorage.getItem('userFullName') || '';
    const userPhone = localStorage.getItem('userPhone') || '';
    const companyShort = company.short_name || company.name || '';
    const companyWebsite = company.website || '';
    const companyAddr = [company.postal_code, company.city, [company.street_name, company.street_number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const companyTax = company.full_tax_number || company.tax_number || '';
    const totalStr = `${(pf.total_gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${pf.currency || ''}`;
    const templateVars = {
      customer_name: customer.name || 'Ügyfelünk',
      company_name: company.name || '',
      invoice_number: pf.proforma_number || '',
      due_date: pf.due_date || '',
      total: totalStr,
      signature_html: '',
    };
    let body = [
      `Tisztelt ${customer.name || 'Ügyfelünk'}!`,
      '',
      'Mellékelve küldöm az alábbi díjbekérőt:',
      '',
      `Díjbekérő száma: ${pf.proforma_number}`,
      `Összeg (bruttó): ${totalStr}`,
      `Fizetési határidő: ${pf.due_date || ''}`,
      '',
      'Kérem az összeg átutalásáról szíveskedjen gondoskodni a határidőig.',
      '',
      '--',
      'Üdvözlettel,',
      userName,
      userPhone,
      companyWebsite,
      companyShort,
      companyAddr,
      companyTax,
    ].join('<br>');
    let defaultFrom = company.email || '';
    let defaultReplyTo = defaultFrom;
    try {
      const cid = company.id || localStorage.getItem('selectedCompanyId');
      if (cid) {
        const [res, templateRes] = await Promise.all([
          emailSettingsAPI.getSettings({ company_id: cid }),
          emailTemplateAPI.list({ company_id: cid, template_type: 'invoice_send' }).catch(() => ({ data: [] })),
        ]);
        const s = (res.data?.results && res.data.results[0]) || (Array.isArray(res.data) ? res.data[0] : res.data);
        const templateRowsRaw = Array.isArray(templateRes?.data) ? templateRes.data : (templateRes?.data?.results || []);
        const templateRows = templateRowsRaw.filter((t) => String(t?.template_type || '') === 'invoice_send');
        const huTemplate = templateRows.find((t) => String(t?.language || 'hu') === 'hu' && t?.is_active !== false)
          || templateRows.find((t) => String(t?.language || 'hu') === 'hu')
          || null;
        if (s) {
          if (s.smtp_from) {
            defaultFrom = s.smtp_from;
            defaultReplyTo = s.smtp_from;
          }
          const fill = (tpl) => applyTemplateVars(tpl, templateVars);
          if (huTemplate?.subject_template) {
            subject = fill(huTemplate.subject_template);
            subject = subject.replace(/Számla/g, 'Díjbekérő').replace(/számla/g, 'díjbekérő');
          } else if (s.default_subject_template) {
            subject = fill(s.default_subject_template);
            subject = subject.replace(/Számla/g, 'Díjbekérő').replace(/számla/g, 'díjbekérő');
          }
          if (huTemplate?.body_template) {
            body = fill(huTemplate.body_template);
            body = body.replace(/számlát/g, 'díjbekérőt').replace(/számlákat/g, 'díjbekérőket').replace(/Számla/g, 'Díjbekérő').replace(/számla/g, 'díjbekérő');
          } else if (s.default_body_template) {
            body = fill(s.default_body_template);
            body = body.replace(/számlát/g, 'díjbekérőt').replace(/számlákat/g, 'díjbekérőket').replace(/Számla/g, 'Díjbekérő').replace(/számla/g, 'díjbekérő');
          }
        }
      }
    } catch (e) { /* settings not available, use defaults */ }
    setEmailDefaults({
      defaultFrom,
      defaultReplyTo,
      defaultTo: defTo,
      defaultCc: [],
      defaultBcc: [],
      defaultSubject: subject,
      defaultBody: body,
    });
    setEmailModalOpen(true);
  };

  const sendEmailFromModal = async (payload) => {
    if (!emailProforma) return;
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
    <Container>
      <Header>
        <Title>Díjbekérők</Title>
        <ActionButton to="/proformas/new">Új díjbekérő</ActionButton>
      </Header>
      {isLoading ? (
        <div style={{ padding: 20 }}>Betöltés...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <Th>Szám</Th>
                <Th>Dátum</Th>
                <Th>Ügyfél</Th>
                <Th>Összeg (bruttó)</Th>
                <Th>Műveletek</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((pf) => (
                <tr key={pf.id}>
                  <Td>{pf.proforma_number}</Td>
                  <Td>{pf.issue_date}</Td>
                  <Td>{pf.customer?.name || ''}</Td>
                  <Td>{Number.isFinite(Number(pf.total_gross_amount)) ? Number(pf.total_gross_amount).toLocaleString('hu-HU', { minimumFractionDigits: 2 }) : '0,00'}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link to={`/proformas/${pf.id}/edit`} title="Szerkesztés" style={{ color: '#3498db' }}><Edit size={18} /></Link>
                      <button onClick={() => copyMutation.mutate(pf.id)} title="Másolat" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2c3e50' }}><Copy size={18} /></button>
                      <a href={proformaAPI.getPdfUrl(pf.id)} target="_blank" rel="noreferrer" title="PDF megtekintése" style={{ color: '#16a085' }}><Eye size={18} /></a>
                      <button onClick={() => openEmailModal(pf)} title="E-mail küldése" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e67e22' }}><Mail size={18} /></button>
                      <button onClick={() => { if(window.confirm('Törlöd a díjbekérőt?')) deleteMutation.mutate(pf.id); }} title="Törlés" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e74c3c' }}><Trash2 size={18} /></button>
                      <Link to={`/invoices/new?from_proforma=${pf.id}`} title="Számla díjbekérő alapján" style={{ color: '#27ae60' }}><FileText size={18} /></Link>
                      <Link to={`/invoices/new?from_proforma=${pf.id}&advance=1`} title="Előlegszámla díjbekérő alapján" style={{ color: '#8e44ad' }}><FileText size={18} /></Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
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
  );
};

export default Proformas;

