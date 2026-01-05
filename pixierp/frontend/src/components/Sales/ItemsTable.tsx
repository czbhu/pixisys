import React, { useMemo, useState } from 'react';
import { Card, Table, Space, Button, Popconfirm, message, Modal, Tooltip, Image } from 'antd';
import { FileOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';

interface Item {
  id: number;
  item_type: 'product' | 'manufacturing' | 'service';
  product_code?: string;
  product_name?: string;
  material_code?: string;
  material_name?: string;
  manufacturing_product_name?: string;
  service_name?: string;
  description?: string;
  quantity: number;
  unit?: string;
  net_unit_price?: number;
  net_total?: number;
  discounted_net_total?: number;
  vat_rate?: number;
  gross_total?: number;
}

interface ItemsTableProps {
  items: Item[];
  onRefresh?: () => void;
  onEditItem?: (item: any) => void;
  quoteRequestId?: number;
  onDeleteItem?: (item: any) => void;
  onCopyItem?: (item: any) => void;
  currency?: string;
}

export const ItemsTable: React.FC<ItemsTableProps> = ({ items, onRefresh, onEditItem, quoteRequestId, onDeleteItem, onCopyItem, currency = 'HUF' }) => {
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<any[]>([]);
  
  const deleteItem = async (record: any) => {
    try {
      if (onDeleteItem) {
        onDeleteItem(record);
        message.success('Tétel eltávolítva');
      } else if (quoteRequestId) {
        await salesService.deleteQuoteRequestItem(record.id, quoteRequestId);
        message.success('Tétel törölve');
        onRefresh && onRefresh();
      }
    } catch (e) {
      message.error('Nem sikerült törölni a tételt');
    }
  };

  const copyItem = async (record: any) => {
    try {
      if (onCopyItem) {
        onCopyItem(record);
        message.success('Tétel másolva');
        return;
      }
      if (!quoteRequestId) return;
      const common = {
        quantity: Number(record.quantity || 1),
        description: record.description || '',
        unit: record.unit,
        net_unit_price: Number(record.net_unit_price || 0),
        vat_rate: Number(record.vat_rate || 27),
        discount_percent: Number((record as any).discount_percent || 0),
        discount_amount: Number((record as any).discount_amount || 0),
      };
      if (record.item_type === 'product' && record.product) {
        await salesService.addRfqProductItem(quoteRequestId, Number(record.product), common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount);
      } else if (record.item_type === 'manufacturing' && record.manufacturing_product) {
        await salesService.addRfqManufacturingItem(quoteRequestId, Number(record.manufacturing_product), common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount);
      } else if (record.item_type === 'service' && record.service) {
        await salesService.addRfqServiceItem(quoteRequestId, Number(record.service), common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount);
      } else {
        message.error('Nem található a tétel hivatkozása, nem másolható');
        return;
      }
      message.success('Tétel másolva');
      onRefresh && onRefresh();
    } catch (e) {
      message.error('Nem sikerült másolni a tételt');
    }
  };
  const columns: any[] = [
    { title: 'Cikkszám', key: 'code', render: (r: any) => r.material_code || r.product_code || '-' },
    { title: 'Név', key: 'name', render: (r: any) => r.material_name || r.product_name || r.manufacturing_product_name || r.service_name },
    { title: 'Leírás', dataIndex: 'description', key: 'description' },
    { title: 'Mennyiség', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Egység', dataIndex: 'unit', key: 'unit' },
    { title: 'Nettó ár', key: 'net_price', render: (r: any) => {
      const qty = Number(r.quantity || 1);
      const netTotal = Number(r.net_total || 0);
      const perUnit = qty > 0 ? netTotal / qty : 0;
      const unit = r.unit || 'db';
      return `${Math.round(netTotal)} (${Math.round(perUnit)}/${unit})`;
    } },
    { title: 'Nettó összesen', key: 'net_total', render: (r: any) => {
      const qty = Number(r.quantity || 1);
      const discounted = r.discounted_net_total != null ? Number(r.discounted_net_total) : Number(r.net_total || 0);
      const perUnit = qty > 0 ? discounted / qty : 0;
      const unit = r.unit || 'db';
      return `${Math.round(discounted)} (${Math.round(perUnit)}/${unit})`;
    } },
  ];

  if (onEditItem || quoteRequestId || onDeleteItem || onCopyItem) {
    columns.push({
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          {onEditItem ? (
            <Button size="small" onClick={() => onEditItem && onEditItem(record)}>Szerkesztés</Button>
          ) : null}
          <Button size="small" onClick={() => copyItem(record)}>Másolás</Button>
          {record.attachments && record.attachments.length > 0 && (
            <Tooltip title={`Csatolmányok (${record.attachments.length})`}>
              <Button 
                icon={<FileOutlined />} 
                size="small" 
                onClick={() => {
                  setSelectedAttachments(record.attachments || []);
                  setAttachmentsModalOpen(true);
                }}
              >
                ({record.attachments.length})
              </Button>
            </Tooltip>
          )}
          {(quoteRequestId || onDeleteItem) ? (
            <Popconfirm title="Biztos törlöd?" onConfirm={() => deleteItem(record)}>
              <Button danger size="small">Törlés</Button>
            </Popconfirm>
          ) : null}
        </Space>
      )
    } as any);
  }

  const totals = useMemo(() => {
    const summary = {
      net: 0,
      netDiscounted: 0,
      vat: 0,
      gross: 0,
      byVat: new Map<number, { net: number; vat: number; gross: number }>(),
    };
    for (const it of items || []) {
      const net = Number(it.net_total || 0);
      const netDisc = Number((it as any).discounted_net_total ?? it.net_total ?? 0);
      const vatRate = Number(it.vat_rate || 0);
      const vat = netDisc * vatRate / 100;
      const gross = netDisc + vat;
      summary.net += net;
      summary.netDiscounted += netDisc;
      summary.vat += vat;
      summary.gross += gross;
      const entry = summary.byVat.get(vatRate) || { net: 0, vat: 0, gross: 0 };
      entry.net += netDisc;
      entry.vat += vat;
      entry.gross += gross;
      summary.byVat.set(vatRate, entry);
    }
    return summary;
  }, [items]);

  return (
    <Card size="small" title="Tételek">
      <Table columns={columns} dataSource={items || []} rowKey="id" pagination={false} />
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Összesen Nettó: {totals.netDiscounted.toFixed(2)} {currency}</div>
        <div style={{ fontSize: 12, color: '#666' }}>(nem tartalmazza az ÁFA-t)</div>
      </div>
      
      <Modal
        title="Tétel csatolmányok"
        open={attachmentsModalOpen}
        onCancel={() => setAttachmentsModalOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={selectedAttachments}
          rowKey="id"
          pagination={false}
          columns={[
            {
              title: 'Fájlnév',
              dataIndex: 'file_name',
              key: 'file_name',
              render: (text: string, record: any) => {
                const fileUrl = record.file_url || record.file;
                const fileName = text || record.file?.split('/').pop() || 'Fájl';
                const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);
                
                if (isImage) {
                  return (
                    <Tooltip 
                      title={
                        <Image 
                          src={fileUrl} 
                          alt={fileName}
                          preview={false}
                          style={{ maxWidth: 300, maxHeight: 300 }}
                        />
                      }
                      placement="right"
                    >
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        {fileName}
                      </a>
                    </Tooltip>
                  );
                }
                
                return (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    {fileName}
                  </a>
                );
              },
            },
            {
              title: 'Megjegyzés',
              dataIndex: 'remark',
              key: 'remark',
            },
            {
              title: 'Feltöltve',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (date: string) => date ? new Date(date).toLocaleString('hu-HU') : '',
            },
            {
              title: 'Műveletek',
              key: 'actions',
              render: (record: any) => (
                <Button 
                  type="link" 
                  href={record.file_url || record.file} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Letöltés
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </Card>
  );
};

export default ItemsTable;
