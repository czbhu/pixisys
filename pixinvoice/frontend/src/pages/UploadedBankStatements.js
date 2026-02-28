import React from 'react';
import { useQuery } from 'react-query';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Pagination } from 'antd';
import { Edit2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { bankStatementsAPI, companyAPI } from '../services/api';

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

const BackButton = styled(Link)`
  padding: 8px 14px;
  background: #95a5a6;
  color: white;
  text-decoration: none;
  border-radius: 4px;
`;

const Body = styled.div`
  padding: 16px;
`;

const DateFilterPanel = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
  margin-bottom: 14px;
`;

const DateFilterTitle = styled.div`
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 10px;
`;

const QuickRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const QuickButton = styled.button`
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: ${props => props.$active ? '#e5e7eb' : '#f3f4f6'};
  color: #4b5563;
  cursor: pointer;
  font-size: 14px;
`;

const ClearQuickButton = styled(QuickButton)`
  color: #ef4444;
`;

const DateRangeBox = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  padding: 10px;
`;

const DateRangeGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: end;
`;

const DateField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #6b7280;
  font-size: 13px;
`;

const DateInput = styled.input`
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  background: white;
  width: 100%;
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid #eee;
  background: #f8f9fa;
`;

const Td = styled.td`
  padding: 8px;
  border-bottom: 1px solid #f4f4f4;
  vertical-align: top;
`;

const UploadedBankStatements = () => {
  const navigate = useNavigate();
  const [selectedCompanyId, setSelectedCompanyId] = React.useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [listPage, setListPage] = React.useState(1);
  const [listPageSize, setListPageSize] = React.useState(50);
  const [quickRange, setQuickRange] = React.useState('');
  const [openingStatementId, setOpeningStatementId] = React.useState(null);
  const [deletingStatementId, setDeletingStatementId] = React.useState(null);
  const [showXmlColumn, setShowXmlColumn] = React.useState(() => {
    try {
      const raw = localStorage.getItem('uploadedBankStatements.showXmlColumn');
      return raw !== '0';
    } catch {
      return true;
    }
  });

  const formatDate = React.useCallback((date) => {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const applyQuickRange = React.useCallback((key) => {
    const now = new Date();
    const today = formatDate(now);

    if (key === 'clear') {
      setFromDate('');
      setToDate('');
      setQuickRange('');
      return;
    }

    if (key === 'today') {
      setFromDate(today);
      setToDate(today);
      setQuickRange(key);
      return;
    }

    if (key === 'week') {
      const start = new Date(now);
      const mondayOffset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - mondayOffset);
      setFromDate(formatDate(start));
      setToDate(today);
      setQuickRange(key);
      return;
    }

    if (key === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(formatDate(start));
      setToDate(today);
      setQuickRange(key);
      return;
    }

    if (key === 'prevMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(formatDate(start));
      setToDate(formatDate(end));
      setQuickRange(key);
    }
  }, [formatDate]);

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

  React.useEffect(() => {
    const readLS = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setSelectedCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    window.addEventListener('focus', readLS);
    const interval = setInterval(readLS, 1000);
    return () => {
      window.removeEventListener('focus', readLS);
      clearInterval(interval);
    };
  }, []);

  const { data, isLoading, refetch } = useQuery(
    ['bank-statements-uploaded', { company: selectedCompanyId }],
    () => bankStatementsAPI.getAllStatements(selectedCompanyId ? { company: selectedCompanyId } : {})
  );

  const openStatementInPreview = async (statementId) => {
    setOpeningStatementId(statementId);
    navigate(`/bank-statements/import/preview?openUploaded=${statementId}&source=uploaded`);
  };

  const openStatementEditor = React.useCallback((statementId) => {
    if (!statementId) return;
    if (openingStatementId || deletingStatementId) return;
    navigate(`/bank-statements/${statementId}/edit`);
  }, [navigate, openingStatementId, deletingStatementId]);

  const handleToggleXmlColumn = React.useCallback((nextValue) => {
    setShowXmlColumn(nextValue);
    try {
      localStorage.setItem('uploadedBankStatements.showXmlColumn', nextValue ? '1' : '0');
    } catch {}
  }, []);

  const deleteUploadedStatement = async (statement) => {
    if (!statement?.id) return;
    const savedCount = Number(statement?.saved_items_count || 0);
    const totalCount = Number(statement?.total_items_count || savedCount || 0);
    const ok = window.confirm(
      `Biztosan törlöd ezt a feltöltött bankkivonatot?\n` +
      `A bankkivonat és az összes kapcsolódó tétel törlődik.\n` +
      `Mentett tételek: ${savedCount} / ${totalCount}`
    );
    if (!ok) return;
    setDeletingStatementId(statement.id);
    try {
      await bankStatementsAPI.deleteStatement(statement.id);
      toast.success('A feltöltött bankkivonat törölve lett.');
      refetch();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'A bankkivonat törlése sikertelen');
    } finally {
      setDeletingStatementId(null);
    }
  };

  const uploadedList = React.useMemo(() => {
    const rows = [...(Array.isArray(data) ? data : [])]
      .filter((st) => !!(st?.source_file_name || st?.saved_items_count != null || st?.total_items_count != null));

    const inRange = (d) => {
      const val = String(d || '').slice(0, 10);
      if (!val) return false;
      if (fromDate && val < fromDate) return false;
      if (toDate && val > toDate) return false;
      return true;
    };

    return rows
      .filter((st) => inRange(st?.statement_date))
      .sort((a, b) => {
        const aTs = Date.parse(a?.statement_date || '') || 0;
        const bTs = Date.parse(b?.statement_date || '') || 0;
        if (bTs !== aTs) return bTs - aTs;
        return String(b?.sequence_number || '').localeCompare(String(a?.sequence_number || ''));
      });
  }, [data, fromDate, toDate]);

  React.useEffect(() => {
    setListPage(1);
  }, [fromDate, toDate, selectedCompanyId]);

  const pagedUploadedList = React.useMemo(() => {
    const startIdx = Math.max(0, (listPage - 1) * listPageSize);
    return uploadedList.slice(startIdx, startIdx + listPageSize);
  }, [uploadedList, listPage, listPageSize]);

  React.useEffect(() => {
    const maxPage = Math.max(1, Math.ceil((uploadedList.length || 0) / listPageSize));
    if (listPage > maxPage) {
      setListPage(maxPage);
    }
  }, [uploadedList.length, listPage, listPageSize]);

  const buildItemsTooltip = React.useCallback((statement) => {
    const previewItems = Array.isArray(statement?.import_preview_items) ? statement.import_preview_items : [];
    const fallbackSavedItems = Array.isArray(statement?.items)
      ? statement.items.map((item) => ({
          counterparty_name: item?.counterparty_name || item?.customer_name || item?.partner_name || '',
          amount: item?.amount,
          currency: item?.currency || statement?.currency,
          approved: true,
          pairing_marked_at: item?.pairing_marked_at || item?.created_at || null,
        }))
      : [];
    const sourceItems = previewItems.length ? previewItems : fallbackSavedItems;
    const partnerItems = sourceItems.filter((item) => String(item?.counterparty_name || '').trim());
    if (!partnerItems.length) return '';

    const formatAmount = (value) => {
      const amount = Number(value || 0);
      if (!Number.isFinite(amount)) return '0.00';
      return amount.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const toLine = (item) => {
      const partner = String(item?.counterparty_name || '').trim();
      const amount = formatAmount(item?.amount);
      const currency = String(item?.currency || statement?.currency || '').trim();
      return `- ${partner} (${amount}${currency ? ` ${currency}` : ''})`;
    };

    const saved = [];
    const unsaved = [];
    partnerItems.forEach((item) => {
      const isSaved = !!(
        item?.approved ||
        item?.pairing_marked_at ||
        item?.saved_pairing_marked_at ||
        (Array.isArray(item?.saved_allocations) && item.saved_allocations.length > 0) ||
        item?.saved_invoice
      );
      if (isSaved) saved.push(item);
      else unsaved.push(item);
    });

    const takeLines = (list, limit = 8) => {
      const lines = list.slice(0, limit).map(toLine);
      if (list.length > limit) lines.push(`- +${list.length - limit} további tétel`);
      return lines;
    };

    const parts = [];
    if (saved.length) {
      parts.push(`Mentett (${saved.length}):`);
      parts.push(...takeLines(saved));
    }
    if (unsaved.length) {
      if (parts.length) parts.push('');
      parts.push(`Nem mentett (${unsaved.length}):`);
      parts.push(...takeLines(unsaved));
    }

    return parts.join('\n');
  }, []);

  return (
    <Container>
      <Header>
        <Title>Feltöltött bankkivonatok</Title>
        <BackButton to="/bank-statements">Vissza</BackButton>
      </Header>
      <Body>
        <DateFilterPanel>
          <DateFilterTitle>Kelt dátum (Issue)</DateFilterTitle>
          <QuickRow>
            <QuickButton type="button" $active={quickRange === 'today'} onClick={() => applyQuickRange('today')}>Ma</QuickButton>
            <QuickButton type="button" $active={quickRange === 'week'} onClick={() => applyQuickRange('week')}>Hét</QuickButton>
            <QuickButton type="button" $active={quickRange === 'month'} onClick={() => applyQuickRange('month')}>Hónap</QuickButton>
            <QuickButton type="button" $active={quickRange === 'prevMonth'} onClick={() => applyQuickRange('prevMonth')}>Előző hó</QuickButton>
            <ClearQuickButton type="button" onClick={() => applyQuickRange('clear')}>Törlés</ClearQuickButton>
          </QuickRow>
          <DateRangeBox>
            <DateRangeGrid>
              <DateField>
                Mettől
                <DateInput
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setQuickRange(''); }}
                />
              </DateField>
              <div style={{ color:'#9ca3af', paddingBottom: 8 }}>—</div>
              <DateField>
                Meddig
                <DateInput
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setQuickRange(''); }}
                />
              </DateField>
            </DateRangeGrid>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#374151', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={showXmlColumn}
                  onChange={(e) => handleToggleXmlColumn(e.target.checked)}
                />
                XML megjelenítése
              </label>
            </div>
          </DateRangeBox>
        </DateFilterPanel>

        {isLoading ? (
          <div>Betöltés...</div>
        ) : (
          <TableWrap>
            <Table>
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: showXmlColumn ? '22%' : '30%' }} />
                <col style={{ width: '12%' }} />
                {showXmlColumn && <col style={{ width: '32%' }} />}
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <Th>Dátum</Th>
                  <Th>Bankszámlaszám</Th>
                  <Th>Sorszám</Th>
                  {showXmlColumn && <Th>XML</Th>}
                  <Th>Mentett tételek</Th>
                  <Th>Műveletek</Th>
                </tr>
              </thead>
              <tbody>
                {pagedUploadedList.map((st) => {
                  const savedCount = Number.isFinite(Number(st?.saved_items_count)) ? Number(st.saved_items_count) : ((st?.items || []).length || 0);
                  const totalCount = Number.isFinite(Number(st?.total_items_count)) ? Number(st.total_items_count) : ((st?.items || []).length || savedCount);
                  const itemsTooltip = buildItemsTooltip(st);
                  return (
                    <tr key={`uploaded-${st.id}`}>
                      <Td
                        onDoubleClick={() => openStatementEditor(st.id)}
                        style={{ cursor: 'pointer' }}
                        title="Dupla klikk: szerkesztés"
                      >
                        {st.statement_date || '-'}
                      </Td>
                      <Td
                        onDoubleClick={() => openStatementEditor(st.id)}
                        style={{ cursor: 'pointer' }}
                        title="Dupla klikk: szerkesztés"
                      >
                        <div title={st.bank_account_name || st.bank_account || ''} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {st.bank_account_name || st.bank_account || '-'}
                        </div>
                      </Td>
                      <Td
                        onDoubleClick={() => openStatementEditor(st.id)}
                        style={{ cursor: 'pointer' }}
                        title="Dupla klikk: szerkesztés"
                      >
                        {st.sequence_number || '-'}
                      </Td>
                      {showXmlColumn && (
                        <Td>
                          <div title={st.source_file_name || ''} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {st.source_file_download_url ? (
                              <a
                                href={st.source_file_download_url}
                                style={{ color: '#2563eb', textDecoration: 'underline' }}
                                download
                              >
                                {st.source_file_name || 'XML letöltés'}
                              </a>
                            ) : (st.source_file_name || '-')}
                          </div>
                        </Td>
                      )}
                      <Td
                        title={itemsTooltip || 'Dupla klikk: szerkesztés'}
                        style={{ cursor: itemsTooltip ? 'help' : 'pointer' }}
                        onDoubleClick={() => openStatementEditor(st.id)}
                      >
                        {savedCount} ({totalCount})
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            onClick={() => openStatementInPreview(st.id)}
                            disabled={openingStatementId === st.id || deletingStatementId === st.id}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3498db', opacity: (openingStatementId === st.id || deletingStatementId === st.id) ? 0.5 : 1 }}
                            title="Szerkesztés az import előnézetben"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => deleteUploadedStatement(st)}
                            disabled={deletingStatementId === st.id || openingStatementId === st.id}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e74c3c', opacity: (deletingStatementId === st.id || openingStatementId === st.id) ? 0.5 : 1 }}
                            title="Feltöltött bankkivonat törlése"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 4px' }}>
              <Pagination
                current={listPage}
                pageSize={listPageSize}
                total={uploadedList.length}
                showSizeChanger
                showQuickJumper={{ goButton: true }}
                responsive
                showLessItems
                pageSizeOptions={['20', '50', '100', '200']}
                showTotal={(total) => `Összesen: ${total}`}
                onChange={(page, size) => {
                  setListPage(page);
                  if (size !== listPageSize) setListPageSize(size);
                }}
              />
            </div>
          </TableWrap>
        )}
      </Body>
    </Container>
  );
};

export default UploadedBankStatements;
