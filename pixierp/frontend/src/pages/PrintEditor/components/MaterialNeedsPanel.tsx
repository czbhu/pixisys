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
  stock: number | null;
  rollWidthMm?: number | null;
  wasteM2?: number | null;
}

interface Props {
  priceBreakdown: PriceBreakdown | null;
}

const fmt = (v: number) => Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 2 });

const MaterialNeedsPanel: React.FC<Props> = ({ priceBreakdown }) => {
  const [rows, setRows] = useState<MaterialRow[]>([]);

  useEffect(() => {
    const bd = priceBreakdown as any;

    // Board/sheet products use board_material_* fields; click products use material_items
    const boardMatName: string | null = bd?.board_material_name ?? null;
    const boardMatId: number | null = bd?.material_id ?? (bd?.board_material_supplier_id != null ? null : null);
    const usedMaterialId: number | null = bd?.material_id ?? null;

    let items = bd?.material_items ?? [];

    // Roll products: use material_breakdown from calculate-price-multi result
    const mb = bd?.material_breakdown;
    if (!items.length && mb?.name && (bd?.total ?? 0) > 0 && (mb?.roll_length_fm ?? 0) > 0) {
      // Resolve supplier name from id if needed
      items = [{
        name: mb.name,
        supplier_name: mb.supplier_name ?? null,
        supplier_id: mb.supplier_id ?? null,
        units: mb.roll_length_fm,
        unit: 'fm',
        material_id: bd?._material_id ?? null,
        roll_width_mm: mb.roll_width_mm ?? null,
        waste_m2: mb.waste_m2 ?? null,
      }];
    }

    if (!items.length && boardMatName && (bd?.board_material_cost ?? 0) > 0) {
      items = [{
        name: boardMatName,
        supplier_name: bd?.board_material_supplier_name ?? null,
        supplier_id: bd?.board_material_supplier_id ?? null,
        units: bd?.board_material_boards_needed ?? bd?.boards_needed ?? 0,
        unit: 'tábla',
        material_id: bd?.board_material_material_id ?? null,
      }];
    }

    if (!items.length) { setRows([]); return; }

    const initial: MaterialRow[] = items.map((mi: any) => ({
      name: mi.name,
      supplierName: mi.supplier_name ?? null,
      needed: Number(mi.units ?? 0),
      unit: mi.unit ?? 'ív',
      stock: null,
      rollWidthMm: mi.roll_width_mm ?? null,
      wasteM2: mi.waste_m2 ?? null,
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
            // For roll: show backend-computed waste (used area - printed area)
            const excessM2 = row.wasteM2 != null && row.wasteM2 > 0
              ? row.wasteM2
              : (row.rollWidthMm && excess > 0 ? excess * (row.rollWidthMm / 1000) : null);

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
                  ) : row.wasteM2 != null && row.wasteM2 > 0 ? (
                    <span style={{ color: '#fa8c16' }}>{fmt(row.wasteM2)} m²</span>
                  ) : excess > 0 ? (
                    <span style={{ color: '#52c41a' }}>
                      +{fmt(excess)} {row.unit}
                      {excessM2 != null && <span style={{ color: '#95d475', fontSize: 10 }}> ({fmt(excessM2)} m²)</span>}
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

export default MaterialNeedsPanel;
