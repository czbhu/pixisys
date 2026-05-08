import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Spin, message, Tooltip } from 'antd';
import { ShoppingCartOutlined, InboxOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { manufacturingService } from '../../services/manufacturingService';
import { warehouseService } from '../../services/warehouseService';
import { useCart } from '../../contexts/CartContext';
import { usePicking } from '../../contexts/PickingContext';

interface MaterialRow {
  key: string;
  materialId: number | null;
  name: string;
  supplierName: string | null;
  needed: number;
  unit: string;
  stock: number | null; // null = still loading
  costPrice: number;
  sellingUnitPrice: number;
  costItemIds: number[]; // manufacturing cost_item IDs for ordering
}

interface Props {
  /** ID of the manufacturing product to load cost_items from */
  manufacturingProductId: number;
  /** Quantity of the order item (used for is_per_unit multiplication) */
  quantity?: number;
  /** Source context – passed into cart when user clicks Berendelem */
  sourceType?: 'rfq' | 'customer_order' | 'ordered_product' | 'unknown';
  sourceId?: number;
  sourceNumber?: string;
  sourceItemName?: string;
}

const fmt = (v: number) =>
  Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 });

const fmtPrice = (v: number) =>
  Number(v).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const stockStatusTag = (stock: number | null, needed: number) => {
  if (stock === null) return <Tag color="default">…</Tag>;
  if (stock === 0) return <Tag color="red">Rendelendő</Tag>;
  if (stock >= needed) return <Tag color="green">Raktáron</Tag>;
  return <Tag color="orange">Részben raktáron</Tag>;
};

const MaterialNeedsTree: React.FC<Props> = ({
  manufacturingProductId,
  quantity = 1,
  sourceType = 'unknown',
  sourceId = 0,
  sourceNumber = '',
  sourceItemName = '',
}) => {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const { addItem, removeItem, updateItem, findItem, setDrawerOpen } = useCart();
  const { addItem: addPickItem, removeItem: removePickItem, findItem: findPickItem } = usePicking();

  useEffect(() => {
    if (!manufacturingProductId) { setRows([]); return; }
    setLoading(true);
    setRows([]);
    setExpandedKeys([]);

    manufacturingService.getProduct(manufacturingProductId)
      .then((mp: any) => {
        const byKey = new Map<string, {
          materialId: number | null;
          name: string;
          supplierName: string | null;
          needed: number;
          unit: string;
          costPrice: number;
          sellingUnitPrice: number;
          costItemIds: number[];
        }>();

        for (const ci of (mp?.cost_items || [])) {
          if (ci.type !== 'material') continue;
          const needed = Number(ci.quantity) * (ci.is_per_unit ? quantity : 1);
          const key = ci.ref_id != null ? String(ci.ref_id) : `name:${ci.name}`;
          const ciId = Number(ci.id || 0);

          if (byKey.has(key)) {
            const existing = byKey.get(key)!;
            existing.needed += needed;
            if (ciId) existing.costItemIds.push(ciId);
          } else {
            byKey.set(key, {
              materialId: ci.ref_id ?? null,
              name: ci.name,
              supplierName: ci.supplier_name ?? null,
              needed,
              unit: ci.unit || 'db',
              costPrice: Number(ci.cost_price || 0),
              sellingUnitPrice: Number(ci.selling_unit_price || 0),
              costItemIds: ciId ? [ciId] : [],
            });
          }
        }

        if (byKey.size === 0) { setRows([]); setLoading(false); return; }

        const initial: MaterialRow[] = Array.from(byKey.entries()).map(([key, v]) => ({
          key,
          ...v,
          stock: null,
        }));        setRows(initial);
        setLoading(false);

        // Load stock for each material with a warehouse ID
        initial.forEach((row, idx) => {
          if (!row.materialId) return;
          warehouseService.getMaterial(row.materialId)
            .then((mat: any) => {
              setRows(prev => {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], stock: Number(mat.current_stock ?? 0) };
                return copy;
              });
            })
            .catch(() => {
              setRows(prev => {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], stock: 0 };
                return copy;
              });
            });
        });
      })
      .catch(() => {
        setLoading(false);
        setRows([]);
      });
  }, [manufacturingProductId, quantity]);

  if (!manufacturingProductId) return null;
  if (loading) return <Spin size="small" style={{ margin: '6px 0' }} />;
  if (!rows.length) return null;

  return (
    <div style={{
      background: '#f9f0ff',
      border: '1px solid #d3adf7',
      borderRadius: 6,
      padding: '6px 10px',
      marginTop: 10,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#531dab',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        Alapanyag szükséglet
      </div>
      <Table<MaterialRow>
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={rows}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpand: (expanded, record) => {
            setExpandedKeys(expanded
              ? [...expandedKeys, record.key]
              : expandedKeys.filter(k => k !== record.key)
            );
          },
          expandedRowRender: (row) => {
            const stock = row.stock ?? 0;
            const toOrder = Math.max(0, row.needed - stock);
            const excess = Math.max(0, stock - row.needed);
            const cartItem = findItem(manufacturingProductId, row.key, sourceId);
            return (
              <div style={{ padding: '6px 12px', background: '#f0e6ff', borderRadius: 4 }}>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
                    {row.costPrice > 0 && (
                      <span><span style={{ color: '#888' }}>Beker. nettó ár: </span><strong>{fmtPrice(row.costPrice)}</strong></span>
                    )}
                    {row.sellingUnitPrice > 0 && (
                      <span><span style={{ color: '#888' }}>Nettó eladási ár: </span><strong>{fmtPrice(row.sellingUnitPrice)}</strong></span>
                    )}
                    {row.supplierName && (
                      <span><span style={{ color: '#888' }}>Beszállító: </span><strong>{row.supplierName}</strong></span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                    <span><span style={{ color: '#888' }}>Szükséges: </span><strong>{fmt(row.needed)} {row.unit}</strong></span>
                    <span>
                      <span style={{ color: '#888' }}>Raktáron: </span>
                      {row.stock === null ? (
                        <Spin size="small" />
                      ) : (
                        <strong style={{ color: stock >= row.needed ? '#52c41a' : '#f5222d' }}>
                          {fmt(stock)} {row.unit}
                        </strong>
                      )}
                    </span>
                    {toOrder > 0 && (
                      <span><span style={{ color: '#888' }}>Rendelendő: </span><strong style={{ color: '#fa8c16' }}>{fmt(toOrder)} {row.unit}</strong></span>
                    )}
                    {excess > 0 && (
                      <span><span style={{ color: '#888' }}>Raktáron marad: </span><strong style={{ color: '#52c41a' }}>+{fmt(excess)} {row.unit}</strong></span>
                    )}
                  </div>
                  <Space size={8} wrap>
                    {cartItem ? (
                      <>
                        <Tooltip title="Megnyitja a rendelési kosarat">
                          <Button
                            size="small"
                            icon={<CheckCircleOutlined />}
                            style={{
                              borderColor: cartItem.status === 'ordered' ? '#52c41a' : '#531dab',
                              color: cartItem.status === 'ordered' ? '#52c41a' : '#531dab',
                              background: cartItem.status === 'ordered' ? '#f6ffed' : '#f9f0ff',
                            }}
                            onClick={() => setDrawerOpen(true)}
                          >
                            {cartItem.status === 'ordered'
                              ? `Megrendelés elküldve`
                              : 'Kosárba helyezve'}
                          </Button>
                        </Tooltip>
                        {cartItem.status !== 'ordered' && (
                          <Tooltip title="Eltávolítás a kosárból">
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeItem(cartItem.id)}
                            />
                          </Tooltip>
                        )}
                      </>
                    ) : (
                      <Button
                        size="small"
                        icon={<ShoppingCartOutlined />}
                        type="primary"
                        ghost
                        style={{ borderColor: '#722ed1', color: '#722ed1' }}
                        onClick={() => {
                          addItem({
                            materialKey: row.key,
                            materialId: row.materialId,
                            materialName: row.name,
                            supplierName: row.supplierName,
                            needed: row.needed,
                            unit: row.unit,
                            costPrice: row.costPrice,
                            costItemIds: row.costItemIds,
                            manufacturingProductId,
                            sourceType,
                            sourceId,
                            sourceNumber,
                            sourceItemName,
                          });
                          message.success('Kosárba helyezve!');
                        }}
                      >
                        Berendelem
                      </Button>
                    )}
                    {(() => {
                      const pickItem = findPickItem(manufacturingProductId, row.key, sourceId);
                      if (pickItem) {
                        return (
                          <>
                            <Tooltip title={`Állapot: ${pickItem.status === 'picked' ? 'Kiszedve' : pickItem.status === 'in_list' ? 'Kiszedési listán' : 'Kiszedésre váró'}`}>
                              <Button
                                size="small"
                                icon={<CheckCircleOutlined />}
                                style={{
                                  borderColor: pickItem.status === 'picked' ? '#52c41a' : pickItem.status === 'in_list' ? '#1677ff' : '#fa8c16',
                                  color: pickItem.status === 'picked' ? '#52c41a' : pickItem.status === 'in_list' ? '#1677ff' : '#fa8c16',
                                }}
                              >
                                {pickItem.status === 'picked'
                                  ? 'Kiszedve'
                                  : pickItem.status === 'in_list'
                                    ? 'Kiszedési listán'
                                    : 'Kiszedésre kiadva'}
                              </Button>
                            </Tooltip>
                            {pickItem.status === 'pending' && (
                              <Tooltip title="Eltávolítás a kiszedési listáról">
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => removePickItem(pickItem.id)}
                                />
                              </Tooltip>
                            )}
                          </>
                        );
                      }
                      return (
                        <Button
                          size="small"
                          icon={<InboxOutlined />}
                          onClick={() => {
                            addPickItem({
                              materialKey: row.key,
                              materialId: row.materialId,
                              materialName: row.name,
                              supplierName: row.supplierName,
                              needed: row.needed,
                              unit: row.unit,
                              costItemIds: row.costItemIds,
                              manufacturingProductId,
                              sourceType,
                              sourceId,
                              sourceNumber,
                              sourceItemName,
                            });
                            message.success('Kiszedésre kiadva!');
                          }}
                        >
                          Kiadom kiszedésre
                        </Button>
                      );
                    })()}
                  </Space>
                </Space>
              </div>
            );
          },
        }}
        columns={[
          {
            title: 'Alapanyag',
            key: 'name',
            render: (_: any, row: MaterialRow) => (
              <span style={{ fontWeight: 500 }}>{row.name}</span>
            ),
          },
          {
            title: 'Szükséges',
            key: 'needed',
            width: 120,
            align: 'right' as const,
            render: (_: any, row: MaterialRow) => (
              <span>{fmt(row.needed)} {row.unit}</span>
            ),
          },
          {
            title: 'Státusz',
            key: 'status',
            width: 200,
            render: (_: any, row: MaterialRow) => {
              const cartItem = findItem(manufacturingProductId, row.key, sourceId);
              return (
                <Space direction="vertical" size={2} style={{ lineHeight: '16px' }}>
                  {stockStatusTag(row.stock, row.needed)}
                  {cartItem && (
                    <Tag
                      color={cartItem.status === 'ordered' ? 'success' : 'purple'}
                      style={{ margin: 0, fontSize: 10, cursor: 'pointer' }}
                      onClick={() => setDrawerOpen(true)}
                    >
                      {cartItem.status === 'ordered'
                        ? `Megrendelés elküldve`
                        : '🛒 Kosárban'}
                    </Tag>
                  )}
                  {(() => {
                    const pickItem = findPickItem(manufacturingProductId, row.key, sourceId);
                    if (!pickItem) return null;
                    const pickColor = pickItem.status === 'picked' ? 'success' : pickItem.status === 'in_list' ? 'processing' : 'warning';
                    const pickLabel = pickItem.status === 'picked' ? '✓ Kiszedve' : pickItem.status === 'in_list' ? '📋 Listán' : '⏳ Kiszedésre kiadva';
                    return <Tag color={pickColor} style={{ margin: 0, fontSize: 10 }}>{pickLabel}</Tag>;
                  })()}
                </Space>
              );
            },
          },
        ]}
      />
    </div>
  );
};

export default MaterialNeedsTree;
