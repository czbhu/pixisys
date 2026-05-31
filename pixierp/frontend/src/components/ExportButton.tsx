import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import api from '../services/api';

export type ExportDataType =
  | 'service_group'
  | 'service'
  | 'product_class'
  | 'product_template'
  | 'material_group'
  | 'material'
  | 'warehouse'
  | 'inventory'
  | 'employee';

interface ExportButtonProps {
  dataType: ExportDataType;
  selectedIds: number[];
  /** Label override, default "Export" */
  label?: string;
}

/**
 * Shows an Export button only when selectedIds is non-empty.
 * Calls POST /api/v1/data-export/ and triggers a file download.
 */
const ExportButton: React.FC<ExportButtonProps> = ({ dataType, selectedIds, label = 'Export' }) => {
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      const resp = await api.post(
        '/data-export/',
        { selections: { [dataType]: selectedIds } },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      const cd = (resp.headers as any)['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `pixierp_export_${dataType}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success(`${selectedIds.length} rekord exportálva`);
    } catch {
      message.error('Export sikertelen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title={`${selectedIds.length} kijelölt sor exportálása`}>
      <Button
        icon={<DownloadOutlined />}
        onClick={handleExport}
        loading={loading}
      >
        {label} ({selectedIds.length})
      </Button>
    </Tooltip>
  );
};

export default ExportButton;
