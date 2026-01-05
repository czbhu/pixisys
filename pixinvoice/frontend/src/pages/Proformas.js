import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { proformaAPI } from '../services/api';
import { Edit, Trash2, Copy, FileText } from 'lucide-react';

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

const Proformas = () => {
  const [companyId, setCompanyId] = React.useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  React.useEffect(() => {
    const sync = () => {
      try { const cid = localStorage.getItem('selectedCompanyId'); setCompanyId(prev => (prev !== cid ? cid : prev)); } catch {}
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
                  <Td>{(pf.total_gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link to={`/proformas/${pf.id}/edit`} title="Szerkesztés" style={{ color: '#3498db' }}><Edit size={18} /></Link>
                      <button onClick={() => copyMutation.mutate(pf.id)} title="Másolat" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2c3e50' }}><Copy size={18} /></button>
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
    </Container>
  );
};

export default Proformas;

