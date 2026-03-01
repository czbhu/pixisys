import React, { useState, useEffect } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, Select, message, Space, Popconfirm
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, MenuOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import EnhancedTable from '../../components/EnhancedTable';
import api from '../../services/api';
import { manufacturingService } from '../../services/manufacturingService';

const { Option } = Select;

interface Currency {
    id: number;
    code: string;
    name: string;
    symbol: string;
}

interface Employee {
    id: number;
    employee_id: string;
    user_username: string;
    user_email: string;
    user_first_name: string;
    user_last_name: string;
    full_name: string;
}

interface CashRegister {
    id: number;
    name: string;
    location: string;
    currency: number;
    currency_code: string;
    currency_symbol: string;
    initial_balance: number | string;
    current_balance: number | string;
    is_active: boolean;
    is_pos_default?: boolean;
    pos_name?: string | null;
    email_notify_on_deposit: boolean;
    email_notify_on_withdrawal: boolean;
    notify_user_ids: number[];
    employees?: number[];
    transaction_view_employee_ids?: number[];
    employee_permissions: any[];
}

interface TransactionReason {
    id: number;
    name: string;
    is_deposit: boolean;
    is_withdrawal: boolean;
    is_active: boolean;
    order: number;
}

const parseAmount = (value: number | string | null | undefined): number => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const normalized = value.replace(/\s/g, '').replace(',', '.');
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const formatCashAmount = (value: number | string | null | undefined): string => {
    const amount = parseAmount(value);
    const sign = amount < 0 ? '-' : '';
    const absoluteAmount = Math.abs(amount);
    const [integerPart, decimalPart] = absoluteAmount.toFixed(2).split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${sign}${groupedInteger}.${decimalPart}`;
};

const CashRegisterSetup: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [reasons, setReasons] = useState<TransactionReason[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [reasonModalVisible, setReasonModalVisible] = useState(false);
    const [savingReasonOrder, setSavingReasonOrder] = useState(false);
    const [draggedReasonId, setDraggedReasonId] = useState<number | null>(null);
    const [editingRegister, setEditingRegister] = useState<CashRegister | null>(null);
    const [editingReason, setEditingReason] = useState<TransactionReason | null>(null);
    const [form] = Form.useForm();
    const [reasonForm] = Form.useForm();
    const cashRegisterNameInputRef = React.useRef<any>(null);
    const reasonNameInputRef = React.useRef<any>(null);

    useEffect(() => {
        fetchCashRegisters();
        fetchCurrencies();
        fetchReasons();
        fetchEmployees();
    }, []);

    useEffect(() => {
        if (!modalVisible) return;
        const timer = setTimeout(() => {
            cashRegisterNameInputRef.current?.focus?.();
        }, 0);
        return () => clearTimeout(timer);
    }, [modalVisible]);

    useEffect(() => {
        if (!reasonModalVisible) return;
        const timer = setTimeout(() => {
            reasonNameInputRef.current?.focus?.();
        }, 0);
        return () => clearTimeout(timer);
    }, [reasonModalVisible]);

    const fetchCashRegisters = async () => {
        setLoading(true);
        try {
            const response = await api.get('/finance/cash-registers/');
            // Handle both paginated and non-paginated responses
            const data = response.data.results || response.data;
            setCashRegisters(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error('Nem sikerült betölteni a kasszákat');
        } finally {
            setLoading(false);
        }
    };

    const fetchCurrencies = async () => {
        try {
            const data = await manufacturingService.getCurrencies();
            setCurrencies(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error('Nem sikerült betölteni a devizákat');
        }
    };

    const fetchReasons = async () => {
        try {
            const response = await api.get('/finance/cash-transaction-reasons/');
            // Handle both paginated and non-paginated responses
            const data = response.data.results || response.data;
            setReasons(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error('Nem sikerült betölteni a művelet okokat');
        }
    };

    const fetchEmployees = async () => {
        try {
            const response = await api.get('/hr/employees/');
            // Handle both paginated and non-paginated responses
            const data = response.data.results || response.data;
            setEmployees(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error('Nem sikerült betölteni az alkalmazottakat');
            console.error('Employee fetch error:', error);
        }
    };

    const handleAdd = () => {
        setEditingRegister(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: CashRegister) => {
        setEditingRegister(record);
        // Extract employee IDs from employee_permissions
        const employeeIds = record.employee_permissions?.map(p => p.employee) || [];
        form.setFieldsValue({
            name: record.name,
            location: record.location,
            currency: record.currency,
            initial_balance: record.initial_balance,
            is_active: record.is_active,
            email_notify_on_deposit: record.email_notify_on_deposit,
            email_notify_on_withdrawal: record.email_notify_on_withdrawal,
            notify_user_ids: record.notify_user_ids || [],
            employees: employeeIds,
            transaction_view_employee_ids: record.transaction_view_employee_ids || [],
        });
        setModalVisible(true);
    };

    const handleCopy = async (record: CashRegister) => {
        try {
            const newRegister = {
                name: `${record.name} (másolat)`,
                location: record.location,
                currency: record.currency,
                initial_balance: 0,
                is_active: true,
            };
            await api.post('/finance/cash-registers/', newRegister);
            message.success('Kassza sikeresen másolva');
            fetchCashRegisters();
        } catch (error) {
            message.error('Nem sikerült másolni a kasszát');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/finance/cash-registers/${id}/`);
            message.success('Kassza sikeresen törölve');
            fetchCashRegisters();
        } catch (error) {
            message.error('Nem sikerült törölni a kasszát');
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingRegister) {
                await api.put(`/finance/cash-registers/${editingRegister.id}/`, values);
                message.success('Kassza sikeresen módosítva');
            } else {
                await api.post('/finance/cash-registers/', values);
                message.success('Kassza sikeresen létrehozva');
            }
            setModalVisible(false);
            form.resetFields();
            fetchCashRegisters();
        } catch (error) {
            message.error('Hiba történt a mentés során');
        }
    };

    const handleAddReason = () => {
        setEditingReason(null);
        reasonForm.resetFields();
        setReasonModalVisible(true);
    };

    const handleEditReason = (record: TransactionReason) => {
        setEditingReason(record);
        reasonForm.setFieldsValue(record);
        setReasonModalVisible(true);
    };

    const handleDeleteReason = async (id: number) => {
        try {
            await api.delete(`/finance/cash-transaction-reasons/${id}/`);
            message.success('Művelet ok sikeresen törölve');
            fetchReasons();
        } catch (error) {
            message.error('Nem sikerült törölni a művelet okot');
        }
    };

    const handleSubmitReason = async (values: any) => {
        try {
            if (editingReason) {
                await api.put(`/finance/cash-transaction-reasons/${editingReason.id}/`, values);
                message.success('Művelet ok sikeresen módosítva');
            } else {
                await api.post('/finance/cash-transaction-reasons/', values);
                message.success('Művelet ok sikeresen létrehozva');
            }
            setReasonModalVisible(false);
            reasonForm.resetFields();
            fetchReasons();
        } catch (error) {
            message.error('Hiba történt a mentés során');
        }
    };

    const persistReasonOrder = async (orderedReasons: TransactionReason[]) => {
        setSavingReasonOrder(true);
        try {
            await Promise.all(
                orderedReasons.map((reason, index) =>
                    api.patch(`/finance/cash-transaction-reasons/${reason.id}/`, { order: index + 1 })
                )
            );
            message.success('Műveleti okok sorrendje mentve');
        } catch (error) {
            message.error('Nem sikerült menteni a műveleti okok sorrendjét');
            fetchReasons();
        } finally {
            setSavingReasonOrder(false);
            setDraggedReasonId(null);
        }
    };

    const handleReasonDrop = async (targetReasonId: number) => {
        if (!draggedReasonId || draggedReasonId === targetReasonId) {
            setDraggedReasonId(null);
            return;
        }

        const fromIndex = reasons.findIndex((reason) => reason.id === draggedReasonId);
        const toIndex = reasons.findIndex((reason) => reason.id === targetReasonId);
        if (fromIndex < 0 || toIndex < 0) {
            setDraggedReasonId(null);
            return;
        }

        const reordered = [...reasons];
        const [movedReason] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, movedReason);

        const normalized = reordered.map((reason, index) => ({
            ...reason,
            order: index + 1,
        }));

        setReasons(normalized);
        await persistReasonOrder(normalized);
    };

    const cashRegisterColumns: ColumnsType<CashRegister> = [
        {
            title: 'Kassza neve',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: CashRegister, b: CashRegister) => (a.name || '').localeCompare(b.name || '', 'hu'),
        },
        {
            title: 'Kassza helye',
            dataIndex: 'location',
            key: 'location',
            sorter: (a: CashRegister, b: CashRegister) => (a.location || '').localeCompare(b.location || '', 'hu'),
        },
        {
            title: 'Kassza tartalma',
            dataIndex: 'current_balance',
            key: 'current_balance',
            sorter: (a: CashRegister, b: CashRegister) => Number(a.current_balance || 0) - Number(b.current_balance || 0),
            render: (balance: number, record: CashRegister) => {
                return `${formatCashAmount(balance)} ${record.currency_code}`;
            },
        },
        {
            title: 'Kassza devizaneme',
            dataIndex: 'currency_code',
            key: 'currency_code',
            sorter: (a: CashRegister, b: CashRegister) => (a.currency_code || '').localeCompare(b.currency_code || ''),
        },
        {
            title: 'POS kassza',
            key: 'pos_name',
            sorter: (a: CashRegister, b: CashRegister) => (a.pos_name || '').localeCompare(b.pos_name || '', 'hu'),
            render: (_: any, record: CashRegister) => record.pos_name || '-',
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (_: any, record: CashRegister) => (
                <Space>
                    <Button
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(record)}
                        size="small"
                    />
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        size="small"
                        type="primary"
                    />
                    <Popconfirm
                        title="Biztosan törli ezt a kasszát?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            danger
                            size="small"
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const reasonColumns: ColumnsType<TransactionReason> = [
        {
            title: '',
            key: 'drag',
            width: 40,
            render: () => <MenuOutlined style={{ color: '#999', cursor: 'grab' }} />,
        },
        {
            title: 'Megnevezés',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Betét művelet',
            dataIndex: 'is_deposit',
            key: 'is_deposit',
            render: (val: boolean) => val ? 'Igen' : 'Nem',
        },
        {
            title: 'Kivét művelet',
            dataIndex: 'is_withdrawal',
            key: 'is_withdrawal',
            render: (val: boolean) => val ? 'Igen' : 'Nem',
        },
        {
            title: 'Aktív',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (val: boolean) => val ? 'Igen' : 'Nem',
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (_: any, record: TransactionReason) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEditReason(record)}
                        size="small"
                        type="primary"
                    />
                    <Popconfirm
                        title="Biztosan törli ezt a művelet okot?"
                        onConfirm={() => handleDeleteReason(record.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            danger
                            size="small"
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card
                title="Kassza Regisztráció"
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                        Új kassza
                    </Button>
                }
            >
                <EnhancedTable
                    tableKey="cashRegisters"
                    columns={cashRegisterColumns as any}
                    dataSource={cashRegisters}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    cardBreakpoint={700}
                />
            </Card>

            <Card
                title="Művelet okok konfigurálása"
                extra={
                    <Space>
                        <span style={{ color: '#666', fontSize: 12 }}>Fogd meg és húzd a sorokat a sorrendhez</span>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddReason}>
                            Új művelet ok
                        </Button>
                    </Space>
                }
            >
                <Table
                    columns={reasonColumns}
                    dataSource={reasons}
                    rowKey="id"
                    loading={savingReasonOrder}
                    pagination={false}
                    onRow={(record) => ({
                        draggable: true,
                        onDragStart: () => setDraggedReasonId(record.id),
                        onDragOver: (event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                        },
                        onDrop: (event) => {
                            event.preventDefault();
                            handleReasonDrop(record.id);
                        },
                        onDragEnd: () => setDraggedReasonId(null),
                        style: {
                            cursor: 'move',
                            opacity: draggedReasonId === record.id ? 0.5 : 1,
                        },
                    })}
                />
            </Card>

            {/* Cash Register Modal */}
            <Modal
                title={editingRegister ? 'Kassza szerkesztése' : 'Új kassza'}
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form form={form} onFinish={handleSubmit} layout="vertical">
                    <Form.Item
                        label="Kassza neve"
                        name="name"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <Input ref={cashRegisterNameInputRef} />
                    </Form.Item>
                    <Form.Item
                        label="Kassza helye"
                        name="location"
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        label="Pénznem"
                        name="currency"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <Select placeholder="Válasszon pénznemet">
                            {currencies.map(c => (
                                <Option key={c.id} value={c.id}>
                                    {c.code} - {c.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    {!editingRegister && (
                        <Form.Item
                            label="Kezdő egyenleg"
                            name="initial_balance"
                            initialValue={0}
                            rules={[{ required: true, message: 'Kötelező mező' }]}
                        >
                            <Input type="number" step="0.01" />
                        </Form.Item>
                    )}
                    <Form.Item
                        label="Aktív"
                        name="is_active"
                        initialValue={true}
                    >
                        <Select>
                            <Option value={true}>Igen</Option>
                            <Option value={false}>Nem</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="E-mail értesítés betétről"
                        name="email_notify_on_deposit"
                        initialValue={false}
                    >
                        <Select>
                            <Option value={true}>Igen</Option>
                            <Option value={false}>Nem</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="E-mail értesítés kivétről"
                        name="email_notify_on_withdrawal"
                        initialValue={false}
                    >
                        <Select>
                            <Option value={true}>Igen</Option>
                            <Option value={false}>Nem</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Értesítendő alkalmazottak"
                        name="notify_user_ids"
                        initialValue={[]}
                    >
                        <Select
                            mode="multiple"
                            placeholder="Válasszon alkalmazottakat"
                            showSearch
                            filterOption={(input, option: any) =>
                                String(option?.children || '').toLowerCase().indexOf(input.toLowerCase()) >= 0
                            }
                        >
                            {employees.map(emp => (
                                <Option key={emp.id} value={emp.id}>
                                    {emp.full_name || `${emp.user_first_name} ${emp.user_last_name}`} ({emp.user_username})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Jogosult (betét/kivét) alkalmazottak"
                        name="employees"
                        initialValue={[]}
                        tooltip="Ezek az alkalmazottak jogosultak betétet és kivétet végrehajtani"
                    >
                        <Select
                            mode="multiple"
                            placeholder="Válasszon alkalmazottakat"
                            showSearch
                            filterOption={(input, option: any) =>
                                String(option?.children || '').toLowerCase().indexOf(input.toLowerCase()) >= 0
                            }
                        >
                            {employees.map(emp => (
                                <Option key={emp.id} value={emp.id}>
                                    {emp.full_name || `${emp.user_first_name} ${emp.user_last_name}`} ({emp.user_username})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Jogosult (forgalmi lista) alkalmazottak"
                        name="transaction_view_employee_ids"
                        initialValue={[]}
                        tooltip="Ezek az alkalmazottak megtekinthetik a forgalmi listát és automatikusan jogosultak betét/kivétre is"
                    >
                        <Select
                            mode="multiple"
                            placeholder="Válasszon alkalmazottakat"
                            showSearch
                            filterOption={(input, option: any) =>
                                String(option?.children || '').toLowerCase().indexOf(input.toLowerCase()) >= 0
                            }
                        >
                            {employees.map(emp => (
                                <Option key={emp.id} value={emp.id}>
                                    {emp.full_name || `${emp.user_first_name} ${emp.user_last_name}`} ({emp.user_username})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Space>
                        <Button type="primary" htmlType="submit">
                            {editingRegister ? 'Mentés' : 'Létrehozás'}
                        </Button>
                        <Button onClick={() => {
                            setModalVisible(false);
                            form.resetFields();
                        }}>
                            Mégse
                        </Button>
                    </Space>
                </Form>
            </Modal>

            {/* Reason Modal */}
            <Modal
                title={editingReason ? 'Művelet ok szerkesztése' : 'Új művelet ok'}
                open={reasonModalVisible}
                onCancel={() => {
                    setReasonModalVisible(false);
                    reasonForm.resetFields();
                }}
                footer={null}
            >
                <Form form={reasonForm} onFinish={handleSubmitReason} layout="vertical">
                    <Form.Item
                        label="Megnevezés"
                        name="name"
                        rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                        <Input ref={reasonNameInputRef} />
                    </Form.Item>
                    <Form.Item
                        label="Betét művelet"
                        name="is_deposit"
                        initialValue={true}
                    >
                        <Select>
                            <Option value={true}>Igen</Option>
                            <Option value={false}>Nem</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Kivét művelet"
                        name="is_withdrawal"
                        initialValue={true}
                    >
                        <Select>
                            <Option value={true}>Igen</Option>
                            <Option value={false}>Nem</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Aktív"
                        name="is_active"
                        initialValue={true}
                    >
                        <Select>
                            <Option value={true}>Igen</Option>
                            <Option value={false}>Nem</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        label="Sorrend"
                        name="order"
                        initialValue={0}
                    >
                        <Input type="number" />
                    </Form.Item>
                    <Space>
                        <Button type="primary" htmlType="submit">
                            {editingReason ? 'Mentés' : 'Létrehozás'}
                        </Button>
                        <Button onClick={() => {
                            setReasonModalVisible(false);
                            reasonForm.resetFields();
                        }}>
                            Mégse
                        </Button>
                    </Space>
                </Form>
            </Modal>
        </Space>
    );
};

export default CashRegisterSetup;
