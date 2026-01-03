import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Input,
    Select,
    Row,
    Col,
    Statistic,
    Alert,
} from 'antd';
import {
    SearchOutlined,
    InboxOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { warehouseService } from '../../services/warehouseService';

const { Option } = Select;

interface InventoryItem {
    id: number;
    material_name: string;
    material_code: string;
    material_unit: string;
    warehouse_name: string;
    shelf_name: string;
    quantity: number;
    last_updated: string;
}

const Inventory: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [warehouseFilter, setWarehouseFilter] = useState<number | null>(null);
    const [lowStockFilter, setLowStockFilter] = useState(false);
    const [warehouses, setWarehouses] = useState<any[]>([]);

    useEffect(() => {
        loadInventory();
        loadWarehouses();
    }, []);

    const loadInventory = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (warehouseFilter) params.warehouse = warehouseFilter;
            if (lowStockFilter) params.low_stock = 'true';
            
            const response = await warehouseService.getInventory(params);
            setInventory(response.results || response);
        } catch (error) {
            console.error('Error loading inventory:', error);
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

    useEffect(() => {
        loadInventory();
    }, [warehouseFilter, lowStockFilter]);

    const columns = [
        {
            title: 'Alapanyag',
            key: 'material',
            render: (record: InventoryItem) => (
                <div>
                    <div style={{ fontWeight: 'bold' }}>{record.material_name}</div>
                    <div style={{ color: '#666', fontSize: '12px' }}>{record.material_code}</div>
                </div>
            ),
        },
        {
            title: 'Raktár',
            dataIndex: 'warehouse_name',
            key: 'warehouse_name',
        },
        {
            title: 'Polc',
            dataIndex: 'shelf_name',
            key: 'shelf_name',
        },
        {
            title: 'Mennyiség',
            key: 'quantity',
            render: (record: InventoryItem) => (
                <div>
                    <div style={{ fontWeight: 'bold' }}>
                        {record.quantity} {record.material_unit}
                    </div>
                    <div style={{ color: '#666', fontSize: '12px' }}>
                        Utolsó frissítés: {new Date(record.last_updated).toLocaleDateString('hu-HU')}
                    </div>
                </div>
            ),
        },
        {
            title: 'Státusz',
            key: 'status',
            render: (record: InventoryItem) => {
                // Itt lehetne kiszámolni a minimum készletszintet
                const isLowStock = record.quantity < 10; // Példa érték
                return (
                    <Tag color={isLowStock ? 'red' : 'green'}>
                        {isLowStock ? 'Alacsony készlet' : 'Rendben'}
                    </Tag>
                );
            },
        },
    ];

    const filteredInventory = inventory.filter(item =>
        item.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.material_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.warehouse_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.shelf_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalItems = filteredInventory.length;
    const lowStockItems = filteredInventory.filter(item => item.quantity < 10).length;
    const totalQuantity = filteredInventory.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Összes tétel"
                            value={totalItems}
                            prefix={<InboxOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Alacsony készlet"
                            value={lowStockItems}
                            prefix={<WarningOutlined />}
                            valueStyle={{ color: lowStockItems > 0 ? '#cf1322' : '#3f8600' }}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Összes mennyiség"
                            value={totalQuantity}
                            precision={2}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="Raktárak száma"
                            value={warehouses.length}
                        />
                    </Card>
                </Col>
            </Row>

            {lowStockItems > 0 && (
                <Alert
                    message={`${lowStockItems} tétel alacsony készletű!`}
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Card
                title="Készlet"
                extra={
                    <Space>
                        <Input
                            placeholder="Keresés..."
                            prefix={<SearchOutlined />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: 200 }}
                        />
                        <Select
                            placeholder="Raktár szűrő"
                            value={warehouseFilter}
                            onChange={setWarehouseFilter}
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
                            type={lowStockFilter ? 'primary' : 'default'}
                            onClick={() => setLowStockFilter(!lowStockFilter)}
                        >
                            Alacsony készlet
                        </Button>
                    </Space>
                }
            >
                <Table
                    columns={columns}
                    dataSource={filteredInventory}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
};

export default Inventory;
