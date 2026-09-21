import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Space, Tag, Tooltip, Typography, message } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import api from '../../../services/api';
import type { FuelContext } from './FuelScreen';

const { Text } = Typography;

interface PumpStatus {
  pump: number;
  pump_id: number;
  pump_name: string;
  state: string;
  nozzle: number;
  fuel_grade_name: string;
  volume: number;
  amount: number;
  price: number;
  transaction: number | null;
  fuel_transaction: { id: number; state: string; volume: string; amount: string } | null;
}

interface FuelPumpStripProps {
  fuel: FuelContext;
  posId?: number | null;
  onTakeToCart: (pump: PumpStatus) => void;
  onOpenDetails: () => void;
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  idle: { label: 'Üresjárat', color: 'green' },
  filling: { label: 'Töltés', color: 'processing' },
  end_of_transaction: { label: 'Kész tankolás', color: 'orange' },
  offline: { label: 'Nem elérhető', color: 'red' },
  totals: { label: 'Óraolvasás', color: 'purple' },
  prices: { label: 'Árváltás', color: 'purple' },
};

const fmtHuf = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString('hu-HU', { maximumFractionDigits: 0 });

/** Kompakt kútállapot-sáv a kassza nyitóoldalára, a Termékek felület fölé. */
const FuelPumpStrip: React.FC<FuelPumpStripProps> = ({ fuel, posId, onTakeToCart, onOpenDetails }) => {
  const [pumps, setPumps] = useState<PumpStatus[]>([]);
  const [controllerError, setControllerError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const fetchStatus = useCallback(async (silent = true) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const params: Record<string, any> = {};
      if (posId) params.terminal = posId;
      const { data } = await api.get('/fuel/pumps/status_all/', { params });
      setPumps(data?.pumps || []);
      setControllerError(data?.controller_error || null);
    } catch (error: any) {
      if (!silent) message.error(error?.response?.data?.error || 'Kútállapot lekérése sikertelen');
    } finally {
      pollingRef.current = false;
    }
  }, [posId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!cancelled) await fetchStatus();
      if (!cancelled) {
        timer = setTimeout(tick, Math.max(2, fuel.poll_interval || 2) * 1000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchStatus, fuel.poll_interval]);

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, flex: '0 0 auto' }}
      styles={{ body: { padding: '8px 12px' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Space size={8}>
            <Text strong>⛽ Kútfejek</Text>
            {controllerError && <Tag color="red">Vezérlő nem elérhető</Tag>}
          </Space>
          <Button size="small" type="primary" style={{ backgroundColor: '#fa541c', borderColor: '#fa541c' }} onClick={onOpenDetails}>
            Részletes kezelés
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {pumps.map((p) => {
          const stateInfo = STATE_LABELS[p.state] || { label: p.state, color: 'default' };
          const ready = p.state === 'end_of_transaction' && p.fuel_transaction;
          return (
            <Tooltip key={p.pump} title={ready ? 'Kattints a kosárba tételhez' : undefined}>
              <div
                onClick={ready ? () => onTakeToCart(p) : undefined}
                style={{
                  minWidth: 150,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${ready ? '#fa8c16' : '#e8e8e8'}`,
                  background: ready ? '#fff7e6' : '#fafafa',
                  cursor: ready ? 'pointer' : 'default',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <Text strong style={{ fontSize: 13 }}>{p.pump_name}</Text>
                  {ready && <ShoppingCartOutlined style={{ color: '#fa8c16' }} />}
                </div>
                <Tag color={stateInfo.color} style={{ alignSelf: 'flex-start', marginRight: 0 }}>
                  {stateInfo.label}
                </Tag>
                {(p.state === 'filling' || p.state === 'end_of_transaction') && (
                  <Text style={{ fontSize: 12 }}>
                    <strong>{Number(p.volume).toFixed(2)} l</strong> · {fmtHuf(p.amount)} Ft
                    <br />
                    <span style={{ color: '#888' }}>{p.fuel_grade_name || ''}</span>
                  </Text>
                )}
              </div>
            </Tooltip>
          );
        })}
        {!pumps.length && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {controllerError || 'Nincs konfigurált kútfej'}
          </Text>
        )}
      </div>
    </Card>
  );
};

export default FuelPumpStrip;
