import React, { useEffect, useState } from 'react';
import { Button, Card, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import EnhancedTable from '../../components/EnhancedTable';
import { deepSearchMatch } from '../../utils/searchUtils';

interface POSTerminal {
  id: number;
  name: string;
  location: string;
  is_active: boolean;
}

const Terminals: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<POSTerminal[]>([]);
  const [searchText, setSearchText] = useState('');

  const fetchRows = async () => {
    setLoading(true);
    try {
      const response = await api.get('/pos/terminals/', { params: { is_active: true, mine: true } });
      const data = response.data?.results || response.data || [];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      message.error('Nem sikerült betölteni a POS listát');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const openTerminal = (id: number) => {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const url = `${protocol}//${host}/pos/sales?pos_id=${id}`;
    window.open(url, '_blank', 'fullscreen=yes');
  };

  const columns: ColumnsType<POSTerminal> = [
    { title: 'POS név', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Helye', dataIndex: 'location', key: 'location', sorter: (a, b) => (a.location || '').localeCompare(b.location || '') },
    {
      title: 'Indít',
      key: 'start',
      render: (_: any, row) => (
        <Button type="primary" onClick={() => openTerminal(row.id)}>
          Indít
        </Button>
      ),
    },
  ];

  const filteredRows = rows.filter(r => deepSearchMatch(searchText, r));

  return (
    <Card title="POSek">
      <EnhancedTable
        tableKey="posTerminals"
        rowKey="id"
        loading={loading}
        dataSource={filteredRows}
        columns={columns as any}
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Keresés..."
        pagination={{ pageSize: 10 }}
        cardBreakpoint={500}
      />
    </Card>
  );
};

export default Terminals;
