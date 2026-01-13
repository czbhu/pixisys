import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Select,
    DatePicker,
    Row,
    Col,
    Statistic,
    Tag,
    message,
} from 'antd';
import {
    DownloadOutlined,
    BarChartOutlined,
    InboxOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface InventorySummary {
    material_summary: Array<{
        material__name: string;
        material__code: string;
        material__unit: string;
        total_quantity: number;
    }>;
    warehouse_summary: Array<{
        warehouse__name: string;
        total_quantity: number;
    }>;
}

const Reports: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<InventorySummary | null>(null);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);
    const [dateRange, setDateRange] = useState<[any, any] | null>(null);

    useEffect(() => {
        loadSummary();
        loadWarehouses();
    }, []);

    const loadSummary = async () => {
        try {
            setLoading(true);
            const response = await warehouseService.getInventorySummary();
            setSummary(response);
        } catch (error) {
            console.error('Error loading summary:', error);
            message.error('Hiba történt az összesítés betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const loadWarehouses = async () => {
        try {
            const response = await warehouseService.getWarehouses();
            setWarehouses(response.results || response);
        } catch (error) {
            console.error('Error loading warehouses:', error);
        }
    };

    const handleExport = () => {
        message.info('Export funkció hamarosan elérhető!');
    };

    const materialColumns = [
        {
            title: 'Alapanyag',
            key: 'material',
            render: (record: any): React.ReactNode => (
                <div>
                    <div style={{ fontWeight: 'bold' }}>{record.material__name}</div>
                    <div style={{ color: '#666', fontSize: '12px' }}>{record.material__code}</div>
                </div>
            ),
        },
        {
            title: 'Mértékegység',
            dataIndex: 'material__unit',
            key: 'material__unit',
        },
        {
            title: 'Összes mennyiség',
            dataIndex: 'total_quantity',
            key: 'total_quantity',
            render: (value: number, record: any) => `${value} ${record.material__unit}`,
            sorter: (a: any, b: any) => a.total_quantity - b.total_quantity,
        },
    ];

    const warehouseColumns = [
        {
            title: 'Raktár',
            dataIndex: 'warehouse__name',
            key: 'warehouse__name',
        },
        {
            title: 'Összes mennyiség',
            dataIndex: 'total_quantity',
            key: 'total_quantity',
            render: (value: number) => value.toLocaleString(),
            sorter: (a: any, b: any) => a.total_quantity - b.total_quantity,
        },
    ];

    const totalMaterials = summary?.material_summary.length || 0;
    const totalQuantity = summary?.material_summary.reduce((sum, item) => sum + item.total_quantity, 0) || 0;
    const totalWarehouses = summary?.warehouse_summary.length || 0;

    return (
        <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Összes alapanyag típus"
                            value={totalMaterials}
                            prefix={<InboxOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Összes mennyiség"
                            value={totalQuantity}
                            precision={2}
                            prefix={<BarChartOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Raktárak száma"
                            value={totalWarehouses}
                            prefix={<InboxOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Átlagos készlet"
                            value={totalWarehouses > 0 ? (totalQuantity / totalWarehouses).toFixed(2) : 0}
                            precision={2}
                            prefix={<BarChartOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={16}>
                <Col span={12}>
                    <Card
                        title="Alapanyagok szerinti összesítés"
                        extra={
                            <Space>
                                <Select
                                    placeholder="Raktár szűrő"
                                    value={selectedWarehouse}
                                    onChange={setSelectedWarehouse}
                                    style={{ width: 150 }}
                                    allowClear
                                >
                                    {warehouses.map(warehouse => (
                                        <Option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.name}
                                        </Option>
                                    ))}
                                </Select>
                                <Button
                                    icon={<DownloadOutlined />}
                                    onClick={handleExport}
                                >
                                    Export
                                </Button>
                            </Space>
                        }
                    >
                        <Table
                            columns={materialColumns}
                            dataSource={summary?.material_summary || []}
                            rowKey="material__code"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            size="small"
                        />
                    </Card>
                </Col>
                <Col span={12}>
                    <Card
                        title="Raktárak szerinti összesítés"
                        extra={
                            <Space>
                                <RangePicker
                                    value={dateRange}
                                    onChange={setDateRange}
                                />
                                <Button
                                    icon={<DownloadOutlined />}
                                    onClick={handleExport}
                                >
                                    Export
                                </Button>
                            </Space>
                        }
                    >
                        <Table
                            columns={warehouseColumns}
                            dataSource={summary?.warehouse_summary || []}
                            rowKey="warehouse__name"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            size="small"
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={24}>
                    <Card
                        title="Részletes jelentések"
                        extra={
                            <Space>
                                <Button
                                    icon={<BarChartOutlined />}
                                    onClick={handleExport}
                                >
                                    Készlet jelentés
                                </Button>
                                <Button
                                    icon={<WarningOutlined />}
                                    onClick={handleExport}
                                >
                                    Alacsony készlet jelentés
                                </Button>
                                <Button
                                    icon={<DownloadOutlined />}
                                    onClick={handleExport}
                                >
                                    Minden jelentés export
                                </Button>
                            </Space>
                        }
                    >
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
                            <BarChartOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                            <p>Részletes jelentések hamarosan elérhetők!</p>
                            <p>Itt találhatók majd a készlet mozgások, bevételezések, kiadások és egyéb raktár statisztikák.</p>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Reports;
