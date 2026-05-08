import React, { useEffect, useState } from 'react';
import { Tag, Spin } from 'antd';
import { manufacturingService } from '../../../services/manufacturingService';
import { warehouseService } from '../../../services/warehouseService';

interface MaterialRow {
  materialId: number | null;
  name: string;
  supplierName: string | null;
  needed: number;
  unit: string;
  stock: number | null; // null = loading
}

interface Props {
  rfqItems: any[];
}

const fmt = (v: number) =>
  Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 });

/** Aggregates material cost_items from all manufacturing products in rfqItems */
const RFQMaterialNeedsPanel: React.FC<Props> = ({ rfqItems }) => {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const mpItems = (rfqItems || []).filter((it: any) => it.manufacturing_product);
    if (!mpItems.length) { setRows([]); return; }

    setLoading(true);

    // Fetch each manufacturing product for its cost_items
    const promises = mpItems.map((rfqItem: any) =>
      manufacturingService.getProduct(rfqItem.manufacturing_product).then((mp: any) => ({
        rfqItem,
        mp,
      })).catch(() => null)
    );

    Promise.all(promises).then(results => {
      // Aggregate material cost_items by ref_id
      const byMaterialId = new Map<number | string, {
        materialId: number | null;
        name: string;
        supplierName: string | null;
        needed: number;
        unit: string;
      }>();

      for (const result of results) {
        if (!result) continue;
        const { rfqItem, mp } = result;
        const rfqQty = Number(rfqItem.quantity) || 1;

        for (const ci of (mp.cost_items || [])) {
          if (ci.type !== 'material') continue;
          // is_per_unit = true → multiply by rfq item quantity
          const needed = Number(ci.quantity) * (ci.is_per_unit ? rfqQty : 1);
          const key = ci.ref_id != null ? ci.ref_id : `name:${ci.name}`;

          if (byMaterialId.has(key)) {
            byMaterialId.get(key)!.needed += needed;
          } else {
            byMaterialId.set(key, {
              materialId: ci.ref_id ?? null,
              name: ci.name,
              supplierName: ci.supplier_name ?? null,
              needed,
              unit: ci.unit || 'db',
            });
          }
        }
      }

      if (byMaterialId.size === 0) { setRows([]); setLoading(false); return; }

      const initial: MaterialRow[] = Array.from(byMaterialId.values()).map(r => ({
        ...r,
        stock: null,
      }));
      setRows(initial);
      setLoading(false);

      // Fetch current stock for each material with a known warehouse ID
      initial.forEach((row, idx) => {
        if (!row.materialId) return;
        warehouseService.getMaterial(row.materialId).then((mat: any) => {
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
    });
  }, [rfqItems]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div>
  );
  if (!rows.length) return null;

  return (
    <div style={{
      background: '#f9f0ff',
      border: '1px solid #d3adf7',
      borderRadius: 8,
      padding: '8px 14px',
      marginTop: 8,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#531dab',
        marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        Alapanyag szükséglet
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #d3adf7', color: '#888' }}>
            <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Alapanyag</th>
            <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Beszállító</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Szükséges</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Raktáron</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Rendelendő</th>
            <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Felesleg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const stockLoading = row.stock === null;
            const stock = row.stock ?? 0;
            const toOrder = Math.max(0, row.needed - stock);
            const excess = Math.max(0, stock - row.needed);
            const sufficient = !stockLoading && stock >= row.needed;

            return (
              <tr key={i} style={{ borderBottom: '1px solid #f0e6ff' }}>
                <td style={{ padding: '5px 6px', fontWeight: 500 }}>{row.name}</td>
                <td style={{ padding: '5px 6px', color: '#666' }}>{row.supplierName ?? '–'}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {fmt(row.needed)} {row.unit}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {stockLoading ? (
                    <span style={{ color: '#bbb' }}>…</span>
                  ) : (
                    <Tag color={sufficient ? 'success' : 'error'} style={{ margin: 0, fontSize: 11 }}>
                      {fmt(stock)} {row.unit}
                    </Tag>
                  )}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {stockLoading ? (
                    <span style={{ color: '#bbb' }}>…</span>
                  ) : toOrder > 0 ? (
                    <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>
                      {fmt(toOrder)} {row.unit}
                    </Tag>
                  ) : (
                    <span style={{ color: '#b0b0b0' }}>–</span>
                  )}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {stockLoading ? (
                    <span style={{ color: '#bbb' }}>…</span>
                  ) : excess > 0 ? (
                    <span style={{ color: '#52c41a', fontSize: 11 }}>
                      +{fmt(excess)} {row.unit}
                    </span>
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

export default RFQMaterialNeedsPanel;
