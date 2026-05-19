import React, { useEffect, useRef, useState } from 'react';
import { Table, Collapse, Statistic, Row, Col, Card, Typography, Tag, Select, Space, Tooltip, Spin } from 'antd';
import { CalculatorOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { manufacturingService } from '../../services/manufacturingService';
import { warehouseService } from '../../services/warehouseService';
import { salesService } from '../../services/salesService';
import { buildTreeMetaFromDepths, CostTreeGuide } from '../Manufacturing/CostDnd';

const { Panel } = Collapse;
const { Text } = Typography;

interface CurrencyItem {
  id: number;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  is_default: boolean;
}

interface AutoRow {
  _autoId: string;
  _label: string;
  _color: string;
  _sourceCurrency: string;
  _depth: number;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  net_unit_price_orig: number;
  net_total_orig: number;
  supplier_name: string;
}

interface RFQCostsTableProps {
  rfqId?: number;
  totalRevenue: number;
  currency: string;
  draftMode?: boolean;
  value?: any[];
  onChange?: (val: any[]) => void;
  rfqItems?: any[];
  /** Increment to force cost rows to re-compute (e.g. after adding/editing an item) */
  refreshKey?: number;
}

export const RFQCostsTable: React.FC<RFQCostsTableProps> = ({
  totalRevenue,
  currency,
  rfqItems,
  refreshKey,
}) => {
  const [autoRows, setAutoRows] = useState<AutoRow[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => (currency || '').toUpperCase());
  const [loading, setLoading] = useState(false);
  const userChangedDisplay = useRef(false);

  useEffect(() => {
    manufacturingService.getCurrencies().then((list: any) => {
      const arr: CurrencyItem[] = Array.isArray(list) ? list : [];
      setCurrencies(arr);
      if (!userChangedDisplay.current) {
        const def = arr.find(c => c.is_default);
        const fallback = def ? def.code.toUpperCase() : (arr[0]?.code.toUpperCase() ?? 'HUF');
        setDisplayCurrency(prev => prev || fallback);
      }
    }).catch(() => {});
  }, []);

  // When RFQ currency prop changes (user edits the quote), follow it unless user manually chose display currency
  useEffect(() => {
    if (currency && !userChangedDisplay.current) {
      setDisplayCurrency(currency.toUpperCase());
    }
  }, [currency]);

  const convert = (amount: number, fromCode: string, toCode: string): number => {
    const from = (fromCode || 'HUF').toUpperCase();
    const to = (toCode || 'HUF').toUpperCase();
    if (from === to || !currencies.length) return amount;
    const rateMap: Record<string, number> = {};
    currencies.forEach(c => { rateMap[c.code.toUpperCase()] = Number(c.exchange_rate); });
    const rFrom = rateMap[from] ?? 1;
    const rTo = rateMap[to] ?? 1;
    return (amount * rFrom) / rTo;
  };

  // Display "Belső gyártás: <Department>" when a cost item is internal,
  // otherwise the supplier's name.
  const formatSupplier = (ci: any): string => {
    if (ci?.is_internal) {
      const dept = ci.department_name
        || (typeof ci.department === 'object' ? ci.department?.name : '')
        || '';
      return dept ? `Belső gyártás: ${dept}` : 'Belső gyártás';
    }
    return ci?.supplier_name || '';
  };

  useEffect(() => {
    const itemsRaw = rfqItems || [];
    const defaultCurrencyCode = (currencies.find(c => c.is_default)?.code ?? 'HUF').toUpperCase();

    // Sort RFQ items by sort_order (matches the Tételek table order)
    const items = [...itemsRaw].sort(
      (a: any, b: any) => (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
    );

    // Compute item depth from parent chain (mirrors ItemsTable nesting)
    const depthMap = new Map<number, number>();
    const getItemDepth = (id: number | null | undefined, visited = new Set<number>()): number => {
      if (!id) return 0;
      if (visited.has(id)) return 0;
      visited.add(id);
      if (depthMap.has(id)) return depthMap.get(id)!;
      const it: any = items.find((i: any) => i.id === id);
      if (!it || !it.parent) { depthMap.set(id, 0); return 0; }
      const d = 1 + getItemDepth(it.parent, visited);
      depthMap.set(id, d);
      return d;
    };
    items.forEach((i: any) => { if (i?.id) getItemDepth(i.id); });

    // Each item gets a "block" of rows; we fill the block (sync or via promise)
    // and at the end flatten in item order to preserve hierarchy ordering.
    const blocks: AutoRow[][] = items.map(() => []);
    const promises: Promise<void>[] = [];

    // Helper: given an array of cost items, sort by sort_order and return
    // rows enriched with per-cost-item depth (relative to itemDepth).
    const buildCostRows = (
      ciList: any[],
      pid: number | string | null,
      productName: string,
      itemDepth: number,
    ): AutoRow[] => {
      const ciSorted = [...(ciList || [])].sort(
        (a, b) => (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
      );
      const ciDepth = new Map<number, number>();
      const getCiDepth = (id: number | null | undefined, visited = new Set<number>()): number => {
        if (!id) return 0;
        if (visited.has(id)) return 0;
        visited.add(id);
        if (ciDepth.has(id)) return ciDepth.get(id)!;
        const it: any = ciSorted.find((i: any) => i.id === id);
        if (!it || !it.parent) { ciDepth.set(id, 0); return 0; }
        const d = 1 + getCiDepth(it.parent, visited);
        ciDepth.set(id, d);
        return d;
      };
      ciSorted.forEach((c: any) => { if (c?.id) getCiDepth(c.id); });

      return ciSorted.map((ci: any, idx: number) => {
        const ciQty = Number(ci.quantity) || 1;
        const ciUnitCp = Number(ci.cost_price) || 0;
        const ciTotalCp = ciUnitCp * ciQty;
        const ciCurrency = (ci.currency || ci.currency_code || defaultCurrencyCode).toUpperCase();
        const cd = ci?.id ? (ciDepth.get(ci.id) || 0) : 0;
        return {
          _autoId: `manu_${pid ?? 'new'}_${ci.id ?? `i${idx}`}`,
          _label: productName,
          _color: 'purple',
          _sourceCurrency: ciCurrency,
          _depth: itemDepth + cd,
          code: ci.code || '',
          name: ci.name || '-',
          quantity: ciQty,
          unit: ci.unit || 'db',
          net_unit_price_orig: ciUnitCp,
          net_total_orig: ciTotalCp,
          supplier_name: formatSupplier(ci),
        };
      });
    };

    items.forEach((item: any, blockIdx: number) => {
      const qty = Number(item.quantity) || 1;
      const itemDepth = item?.id ? (depthMap.get(item.id) || 0) : 0;

      if (item.item_type === 'service') {
        if (item.service) {
          const cp = Number(item.service_unit_cost_price) || 0;
          blocks[blockIdx].push({
            _autoId: `svc_${item.id ?? blockIdx}`,
            _label: 'Szolgáltatás',
            _color: 'blue',
            _sourceCurrency: (item.service_currency || defaultCurrencyCode).toUpperCase(),
            _depth: itemDepth,
            code: item.service_code || '',
            name: item.service_name || '-',
            quantity: qty,
            unit: item.unit || 'alkalom',
            net_unit_price_orig: cp,
            net_total_orig: cp * qty,
            supplier_name: '',
          });
        } else if (item.ref_id) {
          const sid = item.ref_id;
          promises.push(
            salesService.getService(sid).then((svc: any) => {
              const cp = Number(svc?.unit_cost_price) || 0;
              blocks[blockIdx].push({
                _autoId: `svc_new_${sid}_${blockIdx}`,
                _label: 'Szolgáltatás',
                _color: 'blue',
                _sourceCurrency: (svc?.currency || defaultCurrencyCode).toUpperCase(),
                _depth: itemDepth,
                code: svc?.code || item.code || '',
                name: svc?.name || item.name || '-',
                quantity: qty,
                unit: item.unit || svc?.unit || 'alkalom',
                net_unit_price_orig: cp,
                net_total_orig: cp * qty,
                supplier_name: '',
              });
            }).catch(() => {})
          );
        }
      } else if (item.item_type === 'product') {
        if (item.material) {
          const cp = Number(item.material_unit_cost_price) || 0;
          blocks[blockIdx].push({
            _autoId: `mat_${item.id ?? blockIdx}`,
            _label: 'Termék',
            _color: 'green',
            _sourceCurrency: (item.material_currency || defaultCurrencyCode).toUpperCase(),
            _depth: itemDepth,
            code: item.material_code || '',
            name: item.material_name || '-',
            quantity: qty,
            unit: item.unit || 'db',
            net_unit_price_orig: cp,
            net_total_orig: cp * qty,
            supplier_name: '',
          });
        } else if (item.ref_id) {
          const mid = item.ref_id;
          promises.push(
            warehouseService.getMaterial(mid).then((mat: any) => {
              const cp = Number(mat?.unit_cost_price) || 0;
              blocks[blockIdx].push({
                _autoId: `mat_new_${mid}_${blockIdx}`,
                _label: 'Termék',
                _color: 'green',
                _sourceCurrency: (mat?.currency || defaultCurrencyCode).toUpperCase(),
                _depth: itemDepth,
                code: mat?.code || item.code || '',
                name: mat?.name || item.name || '-',
                quantity: qty,
                unit: item.unit || mat?.unit || 'db',
                net_unit_price_orig: cp,
                net_total_orig: cp * qty,
                supplier_name: '',
              });
            }).catch(() => {})
          );
        }
      } else if (item.item_type === 'manufacturing' && (item.manufacturing_product || item._inlineCostItems)) {
        const pid = typeof item.manufacturing_product === 'object'
          ? item.manufacturing_product?.id
          : item.manufacturing_product;
        const productName = item.manufacturing_product_name || item.name || (pid ? `#${pid}` : 'Egyedi gyártás');

        const inlineCostItems = item._inlineCostItems
          ?? (typeof item.manufacturing_product === 'object' ? item.manufacturing_product?.cost_items : undefined);

        if (Array.isArray(inlineCostItems) && inlineCostItems.length > 0) {
          blocks[blockIdx].push(...buildCostRows(inlineCostItems, pid, productName, itemDepth));
        } else if (pid && pid > 0) {
          promises.push(
            manufacturingService.getProduct(pid).then((product: any) => {
              blocks[blockIdx].push(...buildCostRows(product.cost_items || [], pid, productName, itemDepth));
            }).catch(() => {})
          );
        }
      }
    });

    const flush = () => {
      const flat: AutoRow[] = [];
      blocks.forEach(b => b.forEach(r => flat.push(r)));
      setAutoRows(flat);
    };

    if (promises.length > 0) {
      setLoading(true);
      Promise.all(promises).then(() => { flush(); setLoading(false); });
    } else {
      flush();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqItems, currencies, refreshKey]);

  const displayCode = displayCurrency || 'HUF';
  const displaySymbol = currencies.find(c => c.code.toUpperCase() === displayCode)?.symbol || displayCode;

  const fmt = (v: number) =>
    `${v.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${displaySymbol}`;

  const totalAutoCosts = autoRows.reduce(
    (sum, r) => sum + convert(r.net_total_orig, r._sourceCurrency, displayCode),
    0
  );
  const totalRevenueConverted = convert(totalRevenue, currency, displayCode);
  const profit = totalRevenueConverted - totalAutoCosts;

  const treeMetaList = React.useMemo(
    () => buildTreeMetaFromDepths(autoRows.map(r => r._depth || 0)),
    [autoRows]
  );

  const autoColumns: any[] = [
    {
      title: 'Típus / Termék',
      key: 'label',
      width: 160,
      render: (_: any, r: AutoRow) => <Tag color={r._color}>{r._label}</Tag>,
    },
    { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 100 },
    {
      title: 'Megnevezés', dataIndex: 'name', key: 'name',
      render: (_: any, r: AutoRow, idx: number) => (
        <CostTreeGuide meta={treeMetaList[idx]}>{r.name}</CostTreeGuide>
      ),
    },
    { title: 'Menny.', dataIndex: 'quantity', key: 'qty', width: 70 },
    { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 65 },
    {
      title: (
        <span>
          Nettó e.ár{' '}
          <Tooltip title="Átváltva a kiválasztott devizanembe">
            <InfoCircleOutlined style={{ color: '#aaa', fontSize: 12 }} />
          </Tooltip>
        </span>
      ),
      key: 'nup',
      width: 130,
      render: (_: any, r: AutoRow) => {
        const conv = convert(r.net_unit_price_orig, r._sourceCurrency, displayCode);
        const origLabel = r._sourceCurrency !== displayCode
          ? `Eredeti: ${r.net_unit_price_orig.toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${r._sourceCurrency}`
          : undefined;
        return (
          <Tooltip title={origLabel}>
            <span>{conv.toLocaleString('hu-HU', { maximumFractionDigits: 2 })}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Nettó összesen',
      key: 'nt',
      width: 140,
      render: (_: any, r: AutoRow) => {
        const conv = convert(r.net_total_orig, r._sourceCurrency, displayCode);
        const origLabel = r._sourceCurrency !== displayCode
          ? `Eredeti: ${r.net_total_orig.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${r._sourceCurrency}`
          : undefined;
        return (
          <Tooltip title={origLabel}>
            <span style={{ fontWeight: 500 }}>{fmt(conv)}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Forrás deviza',
      key: 'cur',
      width: 90,
      render: (_: any, r: AutoRow) => (
        <Tag color={r._sourceCurrency !== displayCode ? 'orange' : 'default'}>{r._sourceCurrency}</Tag>
      ),
    },
    { title: 'Beszállító', dataIndex: 'supplier_name', key: 'supp' },
  ];

  return (
    <Card size="small" style={{ marginTop: 16 }}>
      <Collapse ghost>
        <Panel
          header={
            <Space>
              <CalculatorOutlined />
              <Text strong>Költség Kalkuláció</Text>
            </Space>
          }
          key="1"
        >
          {/* Currency selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Megjelenítési deviza:</Text>
            <Select
              size="small"
              style={{ width: 150 }}
              value={displayCurrency || undefined}
              onChange={v => { userChangedDisplay.current = true; setDisplayCurrency(v); }}
              placeholder="Deviza"
              options={currencies.map(c => ({
                value: c.code.toUpperCase(),
                label: `${c.code.toUpperCase()} – ${c.name}`,
              }))}
            />
            {currencies.length > 1 && displayCode && (
              <Text type="secondary" style={{ fontSize: 11, color: '#888' }}>
                {currencies
                  .filter(c => c.code.toUpperCase() !== displayCode)
                  .slice(0, 4)
                  .map(c => {
                    const rate = convert(1, c.code.toUpperCase(), displayCode);
                    return `1 ${c.code.toUpperCase()} = ${rate.toLocaleString('hu-HU', { maximumFractionDigits: 4 })} ${displayCode}`;
                  })
                  .join(' · ')}
              </Text>
            )}
          </div>

          {/* Auto rows table */}
          <Spin spinning={loading}>
            {autoRows.length === 0 && !loading ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Nincs automatikusan betölthető költségtétel. (Adj hozzá alapanyagot, szolgáltatást vagy egyedi gyártást a tételek közé.)
              </Text>
            ) : (
              <Table
                dataSource={autoRows}
                columns={autoColumns}
                rowKey="_autoId"
                pagination={false}
                size="small"
                scroll={{ x: 'max-content' }}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ background: '#fafafa' }}>
                      <Table.Summary.Cell index={0} colSpan={6}>
                        <Text strong>Összes költség ({displayCode})</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} colSpan={3}>
                        <Text strong style={{ color: '#cf1322' }}>{fmt(totalAutoCosts)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            )}
          </Spin>

          {/* Summary */}
          <div style={{ marginTop: 20, padding: 14, background: '#f5f5f5', borderRadius: 8 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title={`Összes költség (${displayCode})`}
                  value={totalAutoCosts}
                  precision={2}
                  suffix={displaySymbol}
                  valueStyle={{ color: '#cf1322' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={`Bevétel összesen (${displayCode})`}
                  value={totalRevenueConverted}
                  precision={2}
                  suffix={displaySymbol}
                  valueStyle={{ color: '#3f8600' }}
                />
                {currency.toUpperCase() !== displayCode && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Eredeti: {totalRevenue.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {currency.toUpperCase()}
                  </Text>
                )}
              </Col>
              <Col span={8}>
                <Statistic
                  title="Haszon (bevétel − összes költ.)"
                  value={profit}
                  precision={2}
                  suffix={displaySymbol}
                  valueStyle={{ color: profit >= 0 ? '#3f8600' : '#cf1322' }}
                />
                {totalRevenueConverted > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {((profit / totalRevenueConverted) * 100).toFixed(1)}% margin
                    </Text>
                  </div>
                )}
              </Col>
            </Row>
          </div>
        </Panel>
      </Collapse>
    </Card>
  );
};
