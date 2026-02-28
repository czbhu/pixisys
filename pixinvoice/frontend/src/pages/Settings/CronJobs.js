import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import { cronJobAPI } from '../../services/api';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

const RefreshButton = styled.button`
  border: 1px solid #d0d7de;
  background: #fff;
  color: #2c3e50;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
`;

const Body = styled.div`
  padding: 16px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    text-align: left;
    padding: 10px;
    border-bottom: 1px solid #ecf0f1;
    vertical-align: top;
  }

  th {
    background: #f8f9fa;
    color: #2c3e50;
  }
`;

const CronInput = styled.input`
  width: 180px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 10px;
`;

const SaveButton = styled.button`
  border: none;
  border-radius: 6px;
  background: #3498db;
  color: white;
  padding: 8px 12px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ToggleButton = styled.button`
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: ${props => props.$active ? '#dcfce7' : '#fee2e2'};
  color: ${props => props.$active ? '#166534' : '#991b1b'};
  padding: 8px 12px;
  cursor: pointer;
`;

const Description = styled.div`
  color: #4b5563;
  font-size: 13px;
  line-height: 1.4;
`;

const Status = styled.div`
  font-size: 12px;
  color: ${props => props.$error ? '#b42318' : '#6b7280'};
  margin-top: 4px;
`;

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('hu-HU');
};

export default function CronJobs() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await cronJobAPI.list();
      const data = Array.isArray(res?.data) ? res.data : (res?.data?.results || []);
      setRows(data.map((row) => ({ ...row, cronDraft: row.cron_expression || '' })));
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Cron beállítások betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const setCronDraft = (id, value) => {
    setRows((prev) => prev.map((row) => (
      row.id === id ? { ...row, cronDraft: value } : row
    )));
  };

  const saveRow = async (row) => {
    setSavingId(row.id);
    try {
      await cronJobAPI.update(row.id, {
        cron_expression: (row.cronDraft || '').trim(),
      });
      toast.success('Ütemezés mentve');
      await loadRows();
    } catch (e) {
      const data = e?.response?.data;
      const detail = typeof data === 'string' ? data : (data?.cron_expression?.[0] || data?.detail || data?.error);
      toast.error(detail || 'Mentés sikertelen');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (row) => {
    setSavingId(row.id);
    try {
      await cronJobAPI.update(row.id, {
        is_active: !row.is_active,
      });
      toast.success(row.is_active ? 'Cronjob inaktiválva' : 'Cronjob aktiválva');
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Állapotváltás sikertelen');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Container>
      <Header>
        <Title>Időzítés</Title>
        <RefreshButton onClick={loadRows} disabled={loading}>Frissítés</RefreshButton>
      </Header>
      <Body>
        <Table>
          <thead>
            <tr>
              <th>Szolgáltatás</th>
              <th>Cron</th>
              <th>Állapot</th>
              <th>Utolsó futás</th>
              <th>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <Description>{row.description || '-'}</Description>
                </td>
                <td>
                  <CronInput
                    value={row.cronDraft || ''}
                    onChange={(e) => setCronDraft(row.id, e.target.value)}
                    placeholder="*/5 * * * *"
                  />
                  <Status>Cron formátum: perc óra nap hónap hétköznap</Status>
                </td>
                <td>
                  {row.is_active ? 'Aktív' : 'Inaktív'}
                  <Status $error={row.last_status === 'error'}>
                    {row.last_status === 'ok' ? 'Utolsó futás sikeres' : row.last_status === 'error' ? `Hiba: ${row.last_message || 'ismeretlen'}` : 'Még nem futott'}
                  </Status>
                </td>
                <td>{formatDateTime(row.last_run_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <SaveButton onClick={() => saveRow(row)} disabled={savingId === row.id}>
                      Mentés
                    </SaveButton>
                    <ToggleButton
                      type="button"
                      $active={row.is_active}
                      onClick={() => toggleActive(row)}
                      disabled={savingId === row.id}
                    >
                      {row.is_active ? 'Inaktiválás' : 'Aktiválás'}
                    </ToggleButton>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={5}>Nincs beállítható cronjob.</td>
              </tr>
            )}
          </tbody>
        </Table>
      </Body>
    </Container>
  );
}
