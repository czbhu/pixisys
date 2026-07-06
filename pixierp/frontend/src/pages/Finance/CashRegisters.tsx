import React, { useState, useEffect } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import { 
    Card, Table, Button, Modal, Form, Input, Select, DatePicker, Space, Grid,
    InputNumber, message, Tag, Row, Col, Statistic, Alert 
} from 'antd';
import NumInput from '../../components/NumInput';
import { PlusOutlined, MinusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { useBreakpoint } = Grid;

interface CashRegister {
    id: number;
    name: string;
    location: string;
    currency: number;
    currency_code: string;
    currency_symbol: string;
    current_balance: number | string;
    is_active: boolean;
    employee_permissions?: Array<{
        employee: number;
        can_deposit: boolean;
        can_withdraw: boolean;
        can_view: boolean;
    }>;
}

interface CashTransaction {
    id: number;
    cash_register: number;
    cash_register_name: string;
    employee: number;
    employee_name: string;
    employee_username: string;
    amount: number | string;
    formatted_amount: string;
    reason: number | null;
    reason_name: string | null;
    note: string;
    balance_before: number | string;
    balance_after: number | string;
    target_cash_register: number | null;
    target_cash_register_name: string | null;
    timestamp: string;
}

interface TransactionReason {
    id: number;
    name: string;
    is_deposit: boolean;
    is_withdrawal: boolean;
    is_active: boolean;
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

const CashRegisters: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [transactions, setTransactions] = useState<CashTransaction[]>([]);
    const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
    const [reasons, setReasons] = useState<TransactionReason[]>([]);
    const [selectedCashRegister, setSelectedCashRegister] = useState<number | null>(() => {
        try { const v = localStorage.getItem('cashRegisters_lastSelected'); return v ? Number(v) : null; } catch { return null; }
    });
    const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
    const [searchText, setSearchText] = useState('');
    const [depositModalVisible, setDepositModalVisible] = useState(false);
    const [withdrawalModalVisible, setWithdrawalModalVisible] = useState(false);
    const [depositForm] = Form.useForm();
    const [withdrawalForm] = Form.useForm();
    const depositAmountInputRef = React.useRef<any>(null);
    const withdrawalAmountInputRef = React.useRef<any>(null);
    const screens = useBreakpoint();
    const isMobile = !screens.md;

    useEffect(() => {
        if (!depositModalVisible) return;
        const timer = setTimeout(() => {
            depositAmountInputRef.current?.focus?.();
        }, 0);
        return () => clearTimeout(timer);
    }, [depositModalVisible]);

    useEffect(() => {
        if (!withdrawalModalVisible) return;
        const timer = setTimeout(() => {
            withdrawalAmountInputRef.current?.focus?.();
        }, 0);
        return () => clearTimeout(timer);
    }, [withdrawalModalVisible]);

    const currentCashRegister = cashRegisters.find(cr => cr.id === selectedCashRegister);
    const currentEmployeePermission = currentCashRegister?.employee_permissions?.find(
        (permission) => Number(permission.employee) === Number(user?.employee_id)
    );
    const hasFullCashPermission = ['view', 'create', 'edit', 'delete'].every((action) =>
        Array.isArray(user?.permissions)
            ? user.permissions.some((permission: any) => permission.resource === 'finance.cash_registers' && permission.action === action && permission.allowed)
            : false
    );
    const canViewTransactions = currentCashRegister
        ? currentCashRegister.employee_permissions
            ? Boolean(currentEmployeePermission?.can_view)
            : true
        : false;
    const canDeposit = currentCashRegister
        ? currentCashRegister.employee_permissions
            ? Boolean(currentEmployeePermission?.can_deposit || currentEmployeePermission?.can_view)
            : true
        : false;
    const canWithdraw = currentCashRegister
        ? currentCashRegister.employee_permissions
            ? Boolean(currentEmployeePermission?.can_withdraw || currentEmployeePermission?.can_view)
            : true
        : false;

    useEffect(() => {
        fetchCashRegisters();
        fetchReasons();
    }, []);

    useEffect(() => {
        if (selectedCashRegister && canViewTransactions) {
            fetchTransactions();
        } else {
            setTransactions([]);
        }
    }, [selectedCashRegister, selectedEmployee, dateRange, searchText, canViewTransactions]);

    const fetchCashRegisters = async () => {
        try {
            const response = await api.get('/finance/cash-registers/');
            const data = response.data.results || response.data;
            const activeRegisters = Array.isArray(data) ? data.filter((cr: CashRegister) => cr.is_active) : [];
            const employeeId = user?.employee_id;
            const visibleRegisters = employeeId
                ? activeRegisters.filter((cr: CashRegister) =>
                    (cr.employee_permissions || []).some((perm) =>
                        Number(perm.employee) === Number(employeeId)
                        && (Boolean(perm.can_deposit) || Boolean(perm.can_withdraw) || Boolean(perm.can_view))
                    )
                )
                : activeRegisters;

            setCashRegisters(visibleRegisters);

            if (visibleRegisters.length === 0) {
                setSelectedCashRegister(null);
                return;
            }

            if (!selectedCashRegister || !visibleRegisters.some((cr) => cr.id === selectedCashRegister)) {
                // Try to restore from localStorage first, then fall back to first register
                let savedId: number | null = null;
                try { const v = localStorage.getItem('cashRegisters_lastSelected'); savedId = v ? Number(v) : null; } catch {}
                const restoredId = savedId && visibleRegisters.some((cr) => cr.id === savedId) ? savedId : visibleRegisters[0].id;
                setSelectedCashRegister(restoredId);
            }
        } catch (error) {
            message.error('Nem sikerült betölteni a kasszákat');
        }
    };

    const fetchReasons = async () => {
        try {
            const response = await api.get('/finance/cash-transaction-reasons/', {
                params: { is_active: true }
            });
            const data = response.data.results || response.data;
            setReasons(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error('Nem sikerült betölteni a művelet okokat');
        }
    };

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const params: any = {};
            
            if (selectedCashRegister && selectedCashRegister !== -1) {
                params.cash_register = selectedCashRegister;
            }
            
            if (selectedEmployee) {
                params.employee = selectedEmployee;
            }
            
            if (dateRange) {
                params.start_date = dateRange[0].format('YYYY-MM-DD');
                params.end_date = dateRange[1].format('YYYY-MM-DD');
            }
            
            if (searchText) {
                params.search = searchText;
            }

            const response = await api.get('/finance/cash-transactions/', { params: { ...params, page_size: 1000 } });
            const data = response.data.results || response.data;
            setTransactions(Array.isArray(data) ? data : []);
        } catch (error) {
            message.error('Nem sikerült betölteni a tranzakciókat');
        } finally {
            setLoading(false);
        }
    };

    const handleDeposit = async (values: any) => {
        try {
            await api.post('/finance/cash-transactions/deposit/', {
                cash_register: selectedCashRegister,
                amount: values.amount,
                reason: values.reason,
                note: values.note || ''
            });
            message.success('Betét sikeresen rögzítve');
            setDepositModalVisible(false);
            depositForm.resetFields();
            fetchTransactions();
            fetchCashRegisters();
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Hiba történt a betét rögzítésekor');
        }
    };

    const handleWithdrawal = async (values: any) => {
        try {
            await api.post('/finance/cash-transactions/withdraw/', {
                cash_register: selectedCashRegister,
                amount: values.amount,
                reason: values.reason,
                note: values.note || ''
            });
            message.success('Kivét sikeresen rögzítve');
            setWithdrawalModalVisible(false);
            withdrawalForm.resetFields();
            fetchTransactions();
            fetchCashRegisters();
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Hiba történt a kivét rögzítésekor');
        }
    };

    const columns: ColumnsType<CashTransaction> = [
        {
            title: 'Időpont',
            dataIndex: 'timestamp',
            key: 'timestamp',
            sorter: (a: CashTransaction, b: CashTransaction) => (a.timestamp || '').localeCompare(b.timestamp || ''),
            render: (timestamp: string) => dayjs(timestamp).format('YYYY-MM-DD HH:mm'),
            width: 150,
        },
        {
            title: 'Összeg',
            dataIndex: 'amount',
            key: 'amount',
            sorter: (a: CashTransaction, b: CashTransaction) => Number(a.amount || 0) - Number(b.amount || 0),
            render: (amount: number) => {
                const amountNum = parseAmount(amount);
                const isPositive = amountNum >= 0;
                return (
                    <Tag color={isPositive ? 'green' : 'red'}>
                        {isPositive ? '+' : ''}{formatCashAmount(amountNum)}
                    </Tag>
                );
            },
            width: 120,
        },
        {
            title: 'Miért?',
            dataIndex: 'reason_name',
            key: 'reason_name',
            sorter: (a: CashTransaction, b: CashTransaction) => (a.reason_name || '').localeCompare(b.reason_name || ''),
            render: (reason: string | null) => reason || '-',
            width: 150,
        },
        {
            title: 'Megjegyzés',
            dataIndex: 'note',
            key: 'note',
            sorter: (a: CashTransaction, b: CashTransaction) => (a.note || '').localeCompare(b.note || ''),
            render: (note: string) => note || '-',
        },
        {
            title: 'Kassza tartalma',
            dataIndex: 'balance_after',
            key: 'balance_after',
            sorter: (a: CashTransaction, b: CashTransaction) => Number(a.balance_after || 0) - Number(b.balance_after || 0),
            render: (balance: number) => {
                return <span>{formatCashAmount(balance)}</span>;
            },
            width: 150,
        },
        {
            title: 'Alkalmazott',
            dataIndex: 'employee_name',
            key: 'employee_name',
            sorter: (a: CashTransaction, b: CashTransaction) => (a.employee_name || '').localeCompare(b.employee_name || ''),
            render: (name: string, record: CashTransaction) => name || record.employee_username,
            width: 150,
        },
    ];

    const depositReasons = reasons.filter(r => r.is_deposit);
    const withdrawalReasons = reasons.filter(r => r.is_withdrawal);

    return (
        <div>
            <Card>
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    {cashRegisters.length === 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            message="Nincs elérhető kassza"
                            description="Csak azok a kasszák jelennek meg, amelyekhez van megtekintési jogosultságod."
                        />
                    )}

                    {/* Mobile Top Order: Selector -> Balance -> Actions */}
                    {isMobile ? (
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                            <Select
                                placeholder="Kassza választó"
                                value={selectedCashRegister}
                                onChange={(v) => { setSelectedCashRegister(v); try { if (v != null) localStorage.setItem('cashRegisters_lastSelected', String(v)); } catch {} }}
                                style={{ width: '100%' }}
                            >
                                <Option value={-1}>Mind</Option>
                                {cashRegisters.map(cr => (
                                    <Option key={cr.id} value={cr.id}>
                                        {cr.name}
                                    </Option>
                                ))}
                            </Select>

                            {currentCashRegister && selectedCashRegister !== -1 && (
                                <Card>
                                    <Statistic
                                        title={`${currentCashRegister.name} tartalma`}
                                        value={currentCashRegister.current_balance}
                                        formatter={(value) => formatCashAmount(value as number | string)}
                                        suffix={currentCashRegister.currency_code}
                                    />
                                </Card>
                            )}

                            <Space className="pixi-unified-card-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => setDepositModalVisible(true)}
                                    disabled={!selectedCashRegister || selectedCashRegister === -1 || !canDeposit}
                                >
                                    Betét
                                </Button>
                                <Button
                                    danger
                                    icon={<MinusOutlined />}
                                    onClick={() => setWithdrawalModalVisible(true)}
                                    disabled={!selectedCashRegister || selectedCashRegister === -1 || !canWithdraw}
                                >
                                    Kivét
                                </Button>
                            </Space>

                            {hasFullCashPermission && (
                                <Space className="pixi-unified-card-actions" direction="vertical" size="middle" style={{ width: '100%' }}>
                                    <Input
                                        placeholder="Gyorskereső..."
                                        prefix={<SearchOutlined />}
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                    />
                                    <RangePicker
                                        value={dateRange}
                                        onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                                        format="YYYY-MM-DD"
                                        presets={[
                                            { label: 'Ma', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                                            { label: 'Hét', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
                                            { label: 'Hónap', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
                                            { label: 'Előző hó', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                                        ]}
                                        allowClear
                                        style={{ width: '100%' }}
                                    />
                                    <Select
                                        placeholder="Alkalmazott"
                                        allowClear
                                        value={selectedEmployee}
                                        onChange={setSelectedEmployee}
                                        style={{ width: '100%' }}
                                    >
                                        <Option value={null}>Mind</Option>
                                    </Select>
                                </Space>
                            )}
                        </Space>
                    ) : (
                        <>
                            {/* Filters */}
                            <Row className="pixi-unified-card-actions" gutter={16} align="middle">
                                {hasFullCashPermission && (
                                    <>
                                        <Col>
                                            <Input
                                                placeholder="Gyorskereső..."
                                                prefix={<SearchOutlined />}
                                                value={searchText}
                                                onChange={(e) => setSearchText(e.target.value)}
                                                style={{ width: 200 }}
                                            />
                                        </Col>
                                        <Col>
                                            <RangePicker
                                                value={dateRange}
                                                onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                                                format="YYYY-MM-DD"
                                                presets={[
                                                    { label: 'Ma', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                                                    { label: 'Hét', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
                                                    { label: 'Hónap', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
                                                    { label: 'Előző hó', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                                                ]}
                                                allowClear
                                            />
                                        </Col>
                                    </>
                                )}
                                <Col>
                                    <Select
                                        placeholder="Kassza választó"
                                        value={selectedCashRegister}
                                        onChange={(v) => { setSelectedCashRegister(v); try { if (v != null) localStorage.setItem('cashRegisters_lastSelected', String(v)); } catch {} }}
                                        style={{ width: 200 }}
                                    >
                                        <Option value={-1}>Mind</Option>
                                        {cashRegisters.map(cr => (
                                            <Option key={cr.id} value={cr.id}>
                                                {cr.name}
                                            </Option>
                                        ))}
                                    </Select>
                                </Col>
                                {hasFullCashPermission && (
                                    <Col>
                                        <Select
                                            placeholder="Alkalmazott"
                                            allowClear
                                            value={selectedEmployee}
                                            onChange={setSelectedEmployee}
                                            style={{ width: 200 }}
                                        >
                                            <Option value={null}>Mind</Option>
                                        </Select>
                                    </Col>
                                )}
                            </Row>

                            {/* Current Balance */}
                            {currentCashRegister && selectedCashRegister !== -1 && (
                                <Card>
                                    <Statistic
                                        title={`${currentCashRegister.name} tartalma`}
                                        value={currentCashRegister.current_balance}
                                        formatter={(value) => formatCashAmount(value as number | string)}
                                        suffix={currentCashRegister.currency_code}
                                    />
                                </Card>
                            )}

                            {/* Action Buttons */}
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => setDepositModalVisible(true)}
                                    disabled={!selectedCashRegister || selectedCashRegister === -1 || !canDeposit}
                                >
                                    Betét
                                </Button>
                                <Button
                                    danger
                                    icon={<MinusOutlined />}
                                    onClick={() => setWithdrawalModalVisible(true)}
                                    disabled={!selectedCashRegister || selectedCashRegister === -1 || !canWithdraw}
                                >
                                    Kivét
                                </Button>
                            </Space>
                        </>
                    )}

                    {/* Transactions Table */}
                    {canViewTransactions && (
                        <EnhancedTable
                            tableKey="cashRegisters"
                            columns={columns}
                            dataSource={transactions}
                            rowKey="id"
                            loading={loading}
                            cardBreakpoint={800}
                            pagination={{ pageSize: 20 }}
                        />
                    )}
                </Space>
            </Card>

            {/* Deposit Modal */}
            <Modal
                title="Betét"
                open={depositModalVisible}
                onCancel={() => {
                    setDepositModalVisible(false);
                    depositForm.resetFields();
                }}
                footer={null}
            >
                <Form form={depositForm} onFinish={handleDeposit} layout="vertical">
                    <Form.Item label="Összeg" name="amount" rules={[{ required: true, message: 'Kötelező mező' }]}>
                        <NumInput
                            ref={depositAmountInputRef}
                            addonBefore={<span style={{ fontSize: 24, color: 'green' }}>+</span>}
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                        />
                    </Form.Item>
                    <Form.Item label="Mire?" name="reason" rules={[{ required: true, message: 'Kötelező mező' }]}>
                        <Select placeholder="Válasszon okot">
                            {depositReasons.map(r => (
                                <Option key={r.id} value={r.id}>{r.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Megjegyzés" name="note">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    {currentCashRegister && (
                        <div style={{ marginBottom: 16 }}>
                            <p><strong>Kassza tartalma előtte:</strong> {formatCashAmount(currentCashRegister.current_balance)} {currentCashRegister.currency_code}</p>
                            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.amount !== curr.amount}>
                                {() => {
                                    const amount = parseAmount(depositForm.getFieldValue('amount'));
                                    const currentBalance = parseAmount(currentCashRegister.current_balance);
                                    const after = currentBalance + amount;
                                    return (
                                        <p><strong>Utána:</strong> {formatCashAmount(after)} {currentCashRegister.currency_code}</p>
                                    );
                                }}
                            </Form.Item>
                        </div>
                    )}
                    <Space>
                        <Button type="primary" htmlType="submit">OK</Button>
                        <Button onClick={() => {
                            setDepositModalVisible(false);
                            depositForm.resetFields();
                        }}>Mégse</Button>
                    </Space>
                </Form>
            </Modal>

            {/* Withdrawal Modal */}
            <Modal
                title="Kivét"
                open={withdrawalModalVisible}
                onCancel={() => {
                    setWithdrawalModalVisible(false);
                    withdrawalForm.resetFields();
                }}
                footer={null}
            >
                <Form form={withdrawalForm} onFinish={handleWithdrawal} layout="vertical">
                    <Form.Item label="Összeg" name="amount" rules={[{ required: true, message: 'Kötelező mező' }]}>
                        <NumInput
                            ref={withdrawalAmountInputRef}
                            addonBefore={<span style={{ fontSize: 24, color: 'red' }}>-</span>}
                            style={{ width: '100%' }}
                            min={0}
                            precision={2}
                        />
                    </Form.Item>
                    <Form.Item label="Mire?" name="reason" rules={[{ required: true, message: 'Kötelező mező' }]}>
                        <Select placeholder="Válasszon okot">
                            {withdrawalReasons.map(r => (
                                <Option key={r.id} value={r.id}>{r.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Megjegyzés" name="note">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    {currentCashRegister && (
                        <div style={{ marginBottom: 16 }}>
                            <p><strong>Kassza tartalma előtte:</strong> {formatCashAmount(currentCashRegister.current_balance)} {currentCashRegister.currency_code}</p>
                            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.amount !== curr.amount}>
                                {() => {
                                    const amount = parseAmount(withdrawalForm.getFieldValue('amount'));
                                    const currentBalance = parseAmount(currentCashRegister.current_balance);
                                    const after = currentBalance - amount;
                                    return (
                                        <p><strong>Utána:</strong> {formatCashAmount(after)} {currentCashRegister.currency_code}</p>
                                    );
                                }}
                            </Form.Item>
                        </div>
                    )}
                    <Space>
                        <Button type="primary" htmlType="submit">OK</Button>
                        <Button onClick={() => {
                            setWithdrawalModalVisible(false);
                            withdrawalForm.resetFields();
                        }}>Mégse</Button>
                    </Space>
                </Form>
            </Modal>
        </div>
    );
};

export default CashRegisters;
