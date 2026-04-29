import React, { useEffect, useRef, useState } from 'react';
import { Table, Collapse, Statistic, Row, Col, Card, Typography, Tag, Select, Space, Tooltip, Spin } from 'antd';
import { CalculatorOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { manufacturingService } from '../../services/manufacturingService';

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

  useEffect(() => {
    const items = rfqItems || [];
    const rows: AutoRow[] = [];
    let counter = 0;
    const promises: Promise<void>[] = [];
    const defaultCurrencyCode = (currencies.find(c => c.is_default)?.code ?? 'HUF').toUpperCase();

    items.forEach((item: any) => {
      const qty = Number(item.quantity) || 1;

      if (item.item_type === 'service' && item.service) {
        const cp = Number(item.service_unit_cost_price) || 0;
        rows.push({
          _autoId: `svc_${counter++}`,
          _label: 'Szolgáltatás',
          _color: 'blue',
          _sourceCurrency: (item.service_currency || defaultCurrencyCode).toUpperCase(),
          code: item.service_code || '',
          name: item.service_name || '-',
          quantity: qty,
          unit: item.unit || 'alkalom',
          net_unit_price_orig: cp,
          net_total_orig: cp * qty,
          supplier_name: '',
        });
      } else if (item.item_type === 'product' && item.material) {
        const cp = Number(item.material_unit_cost_price) || 0;
        rows.push({
          _autoId: `mat_${counter++}`,
          _label: 'Termék',
          _color: 'green',
          _sourceCurrency: (item.material_currency || defaultCurrencyCode).toUpperCase(),
          code: item.material_code || '',
          name: item.material_name || '-',
          quantity: qty,
          unit: item.unit || 'db',
          net_unit_price_orig: cp,
          net_total_orig: cp * qty,
          supplier_name: '',
        });
      } else if (item.item_type === 'manufacturing' && (item.manufacturing_product || item._inlineCostItems)) {
        const pid = typeof item.manufacturing_product === 'object'
          ? item.manufacturing_product?.id
          : item.manufacturing_product;
        const productName = item.manufacturing_product_name || item.name || (pid ? `#${pid}` : 'Egyedi gyártás');

        // ── Inline cost items (used in NEW-RFQ creation modal where the
        //    manufacturing product hasn't been saved to API yet) ───────────
        const inlineCostItems = item._inlineCostItems
          ?? (typeof item.manufacturing_product === 'object' ? item.manufacturing_product?.cost_items : undefined);

        if (Array.isArray(inlineCostItems) && inlineCostItems.length > 0) {
          inlineCostItems.forEach((ci: any) => {
            const ciQty = Number(ci.quantity) || 1;
            const ciUnitCp = Number(ci.cost_price) || 0;
            const ciTotalCp = ciUnitCp * ciQty;
            const ciCurrency = (ci.currency || ci.currency_code || defaultCurrencyCode).toUpperCase();
            rows.push({
              _autoId: `manu_inline_${pid ?? 'new'}_${ci.id ?? counter++}`,
              _label: productName,
              _color: 'purple',
              _sourceCurrency: ciCurrency,
              code: ci.code || '',
              name: ci.name || '-',
              quantity: ciQty,
              unit: ci.unit || 'db',
              net_unit_price_orig: ciUnitCp,
              net_total_orig: ciTotalCp,
              supplier_name: ci.supplier_name || '',
            });
          });
        } else if (pid && pid > 0) {
          // ── Saved product: fetch from API ──────────────────────────────
          promises.push(
            manufacturingService.getProduct(pid).then((product: any) => {
              (product.cost_items || []).forEach((ci: any) => {
                const ciQty = Number(ci.quantity) || 1;
                const ciUnitCp = Number(ci.cost_price) || 0;
                const ciTotalCp = ciUnitCp * ciQty;
                const ciCurrency = (ci.currency || defaultCurrencyCode).toUpperCase();
                rows.push({
                  _autoId: `manu_${pid}_${ci.id ?? counter++}`,
                  _label: productName,
                  _color: 'purple',
                  _sourceCurrency: ciCurrency,
                  code: ci.code || '',
                  name: ci.name || '-',
                  quantity: ciQty,
                  unit: ci.unit || 'db',
                  net_unit_price_orig: ciUnitCp,
                  net_total_orig: ciTotalCp,
                  supplier_name: ci.supplier_name || '',
                });
              });
            }).catch(() => {})
          );
        }
      }
    });

    if (promises.length > 0) {
      setLoading(true);
      Promise.all(promises).then(() => {
        setAutoRows([...rows]);
        setLoading(false);
      });
    } else {
      setAutoRows([...rows]);
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

  const autoColumns: any[] = [
    {
      title: 'Típus / Termék',
      key: 'label',
      width: 160,
      render: (_: any, r: AutoRow) => <Tag color={r._color}>{r._label}</Tag>,
    },
    { title: 'Cikkszám', dataIndex: 'code', key: 'code', width: 100 },
    { title: 'Megnevezés', dataIndex: 'name', key: 'name' },
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
      <Collapse ghost defaultActiveKey={['1']}>
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
