import React, { useEffect, useState } from 'react';
import { Typography, Tag } from 'antd';
import { warehouseService } from '../../../services/warehouseService';
import { PriceBreakdown } from './PrintParamsPanel';

const { Text } = Typography;

interface MaterialRow {
  name: string;
  supplierName: string | null;
  needed: number;
  unit: string;
  stock: number | null; // null = loading
}

interface Props {
  priceBreakdown: PriceBreakdown | null;
}

const fmt = (v: number) => Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 2 });

const MaterialNeedsPanel: React.FC<Props> = ({ priceBreakdown }) => {
  const [rows, setRows] = useState<MaterialRow[]>([]);

  useEffect(() => {
    const bd = priceBreakdown as any;
    const items = bd?.material_items ?? [];
    if (!items.length) { setRows([]); return; }

    const initial: MaterialRow[] = items.map((mi: any) => ({
      name: mi.name,
      supplierName: mi.supplier_name ?? null,
      needed: Number(mi.units ?? 0),
      unit: mi.unit ?? 'ív',
      stock: null,
    }));
    setRows(initial);

    // Fetch stock for each item that has material_id
    items.forEach((mi: any, idx: number) => {
      if (!mi.material_id) return;
      warehouseService.getMaterial(mi.material_id).then((mat: any) => {
        setRows(prev => {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], stock: Number(mat.current_stock ?? 0) };
          return copy;
        });
      }).catch(() => {
        setRows(prev => {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], stock: 0 };
          return copy;
        });
      });
    });
  }, [priceBreakdown]);

  if (!rows.length) return null;

  return (
    <div style={{
      margin: '8px 12px 0',
      padding: 12,
      background: '#fafafa',
      border: '1px solid #e8e8e8',
      borderRadius: 8,
    }}>
      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        Alapanyag szükséglet
      </Text>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e0e0e0', color: '#888' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Alapanyag</th>
            <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Beszállító</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Szükséges</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Raktáron</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Rendelendő</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Felesleg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const stock = row.stock ?? 0;
            const loading = row.stock === null;
            const toOrder = Math.max(0, row.needed - stock);
            const excess = Math.max(0, stock - row.needed);
            const sufficient = !loading && stock >= row.needed;

            return (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '5px 6px', fontWeight: 500 }}>{row.name}</td>
                <td style={{ padding: '5px 6px', color: '#666' }}>{row.supplierName ?? '–'}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                  {fmt(row.needed)} {row.unit}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                  {loading ? (
                    <span style={{ color: '#bbb' }}>…</span>
                  ) : (
                    <Tag
                      color={sufficient ? 'success' : 'error'}
                      style={{ margin: 0, fontSize: 11 }}
                    >
                      {fmt(stock)} {row.unit}
                    </Tag>
                  )}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                  {loading ? (
                    <span style={{ color: '#bbb' }}>…</span>
                  ) : toOrder > 0 ? (
                    <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>
                      {fmt(toOrder)} {row.unit}
                    </Tag>
                  ) : (
                    <span style={{ color: '#b0b0b0' }}>–</span>
                  )}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                  {loading ? (
                    <span style={{ color: '#bbb' }}>…</span>
                  ) : excess > 0 ? (
                    <span style={{ color: '#52c41a' }}>+{fmt(excess)} {row.unit}</span>
                  ) : (
                    <span style={{ color: '#b0b0b0' }}>–</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MaterialNeedsPanel;
