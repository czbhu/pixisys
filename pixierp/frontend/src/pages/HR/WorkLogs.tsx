import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Form, DatePicker, Select, Input, Row, Col, Space, Button, message, Statistic } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/hu';
import { salesService } from '../../services/salesService';

dayjs.locale('hu');

const { RangePicker } = DatePicker;

// A custom running timer display
const RunningTimer = ({ startAt }: { startAt: string }) => {
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const start = new Date(startAt);
            setDuration((now.getTime() - start.getTime()) / 1000);
        }, 1000);
        return () => clearInterval(interval);
    }, [startAt]);

    const h = Math.floor(duration / 3600);
    const m = Math.floor((duration % 3600) / 60);
    const s = Math.floor(duration % 60);
    return <span>{h.toString().padStart(2,'0')}:{m.toString().padStart(2,'0')}:{s.toString().padStart(2,'0')}</span>;
}

const WorkLogs: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const [filters, setFilters] = useState<any>({});
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(), dayjs()]);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const [form] = Form.useForm();

    const load = async () => {
        setLoading(true);
        try {
            const params: any = {
                start_date: dateRange[0].format('YYYY-MM-DD'),
                end_date: dateRange[1].format('YYYY-MM-DD'),
                ...filters
            };
            const data = await salesService.getWorkLogs(params);
            setLogs(data.results ?? data);
        } catch (e) {
            message.error('Hiba a betöltéskor');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        salesService.listUsers().then(u => setUsers(u as any)).catch(() => {});
    }, []);

    useEffect(() => {
        load();
    }, [dateRange, filters]);

    const columns = [
        {
            title: '-tól',
            dataIndex: 'started_at',
            render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-',
            width: 140,
        },
        {
            title: '-ig',
            dataIndex: 'ended_at',
            render: (d: string, r: any) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : <span style={{ color: 'green', fontWeight: 'bold' }}>futó</span>,
            width: 140,
        },
        {
            title: 'Idő',
            render: (_: any, r: any) => {
                if (!r.ended_at) return <RunningTimer startAt={r.started_at} />;
                const mins = Math.round((r.duration_seconds || 0) / 60);
                return `${mins} p`;
            },
            width: 80,
        },
        { title: 'Alkalmazott', dataIndex: 'user_name', width: 150 },
        { title: 'Rendelés', dataIndex: 'customer_order_number', width: 100 },
        { title: 'Megrendelő', dataIndex: 'customer_name', width: 150 },
        { title: 'Tétel', dataIndex: 'item_name', width: 200 },
        { title: 'Folyamat', dataIndex: 'workflow_name', width: 150 },
    ];

    const selectedTotal = useMemo(() => {
        const selectedLogs = logs.filter(l => selectedRowKeys.includes(l.id));
        const totalSeconds = selectedLogs.reduce((acc, curr) => {
            if (curr.ended_at) return acc + (curr.duration_seconds || 0);
            return acc; // Running tasks not added to finite total
        }, 0);
        const mins = Math.floor(totalSeconds / 60);
        const hours = (mins / 60).toFixed(1);
        return `${hours} óra (${mins} perc)`;
    }, [selectedRowKeys, logs]);

    return (
        <Card title="Munkanaplók" extra={
            <Space wrap>
                <div style={{ marginRight: 16 }}>
                   <strong>Kijelölt: </strong> {selectedTotal}
                </div>
                <Button icon={<ReloadOutlined />} onClick={load}>Frissítés</Button>
            </Space>
        }>
            <Form form={form} layout="vertical" onValuesChange={(_, vals) => {
                const newFilters: any = {};
                if (vals.user_id) newFilters.user_id = vals.user_id;
                if (vals.search) newFilters.search = vals.search;
                setFilters(newFilters);
            }}>
                <Row gutter={[16, 16]}>
                     <Col xs={24} sm={12} md={8} lg={6}>
                        <Form.Item label="Időszak" style={{ marginBottom: 0 }}>
                            <RangePicker 
                                value={dateRange} 
                                onChange={(val) => val ? setDateRange([val[0]!, val[1]!]) : null} 
                                allowClear={false}
                                style={{ width: '100%' }}
                            />
                            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                                <a role="button" onClick={() => setDateRange([dayjs(), dayjs()])} style={{ fontSize: 12 }}>Ma</a>
                                <a role="button" onClick={() => setDateRange([dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')])} style={{ fontSize: 12 }}>Tegnap</a>
                                <a role="button" onClick={() => setDateRange([dayjs().startOf('week'), dayjs().endOf('week')])} style={{ fontSize: 12 }}>E hét</a>
                                <a role="button" onClick={() => setDateRange([dayjs().subtract(1, 'week').startOf('week'), dayjs().subtract(1, 'week').endOf('week')])} style={{ fontSize: 12 }}>Előző hét</a>
                                <a role="button" onClick={() => setDateRange([dayjs().startOf('month'), dayjs().endOf('month')])} style={{ fontSize: 12 }}>E hónap</a>
                                <a role="button" onClick={() => setDateRange([dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')])} style={{ fontSize: 12 }}>Előző hónap</a>
                            </div>
                        </Form.Item>
                     </Col>
                     <Col xs={24} sm={12} md={8} lg={4}>
                        <Form.Item label="Alkalmazott" name="user_id">
                            <Select allowClear placeholder="Mindenki">
                                {users.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                     </Col>
                     <Col xs={24} md={8} lg={8}>
                        <Form.Item label="Gyorskeresés" name="search">
                            <Input prefix={<SearchOutlined />} placeholder="Rendelés, Ügyfél, Projekt..." allowClear />
                        </Form.Item>
                     </Col>
                </Row>
            </Form>

            <Table 
                dataSource={logs} 
                columns={columns} 
                rowKey="id" 
                loading={loading}
                rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys
                }}
                pagination={{ defaultPageSize: 50, showSizeChanger: true }}
                scroll={{ x: 1200 }}
            />
        </Card>
    );
};

export default WorkLogs;
