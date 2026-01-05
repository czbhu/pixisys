import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    Select,
    DatePicker,
    InputNumber,
    message,
    Tag,
    Tooltip,
    Popconfirm,
    Row,
    Col,
    Spin
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    FilterOutlined,
    ReloadOutlined,
    SearchOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { manufacturingService, ManufacturingProduct, ProductClass, Project, Currency } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';
import HungarianDatePicker from '../../components/HungarianDatePicker';
import { createIntelligentFilter } from '../../utils/searchUtils';

const { Option } = Select;
const { TextArea } = Input;

const STATUS_COLORS: { [key: string]: string } = {
    'quote_request_open': 'default',
    'quote_request_priced': 'blue',
    'quote_request_sent': 'cyan',
    'ordered': 'green',
    'design_in_progress': 'orange',
    'design_approved': 'purple',
    'production_in_progress': 'red',
    'production_completed': 'magenta',
    'finished_goods_warehouse': 'lime',
    'installation_in_progress': 'gold',
    'delivered': 'geekblue',
    'invoiced': 'volcano',
    'paid': 'success',
};

const Products: React.FC = () => {
    const [products, setProducts] = useState<ManufacturingProduct[]>([]);
    const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [contacts, setContacts] = useState<any[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingRates, setUpdatingRates] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [isExchangeRatesModalVisible, setIsExchangeRatesModalVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ManufacturingProduct | null>(null);
    const [viewingProduct, setViewingProduct] = useState<ManufacturingProduct | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [query, setQuery] = useState('');
    const [form] = Form.useForm();

    useEffect(() => {
        loadProducts();
        loadProductClasses();
        loadProjects();
        loadContacts();
        loadCurrencies();
    }, []);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const response = await manufacturingService.getProducts();
            setProducts(response);
        } catch (err) {
            console.error('Error loading products:', err);
            message.error('Hiba történt a termékek betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const loadProductClasses = async () => {
        try {
            const response = await manufacturingService.getProductClasses();
            setProductClasses(response);
        } catch (err) {
            console.error('Error loading product classes:', err);
        }
    };

    const loadProjects = async () => {
        try {
            const response = await manufacturingService.getOpenProjects();
            setProjects(response);
        } catch (err) {
            console.error('Error loading projects:', err);
        }
    };

    const loadContacts = async () => {
        try {
            const response = await crmService.getContacts();
            setContacts(response.results || response);
        } catch (err) {
            console.error('Error loading contacts:', err);
        }
    };

    const loadCurrencies = async () => {
        try {
            const response = await manufacturingService.getActiveCurrencies();
            setCurrencies(response);
        } catch (err) {
            console.error('Error loading currencies:', err);
        }
    };

    const showModal = (product?: ManufacturingProduct) => {
        if (product) {
            setEditingProduct(product);
            form.setFieldsValue({
                date: dayjs(product.date),
                name: product.name,
                description: product.description,
                internal_description: product.internal_description,
                quantity: product.quantity,
                quantity_unit: product.quantity_unit || 'db',
                product_class: product.product_class_name,
                project: product.project_name,
                net_unit_price: product.net_unit_price,
                net_total_price: product.net_total_price,
                currency: product.currency,
                status: product.status,
                contact: product.contact_name,
                deadline: dayjs(product.deadline),
            });
        } else {
            setEditingProduct(null);
            form.resetFields();
            form.setFieldsValue({
                date: dayjs(),
                deadline: dayjs().add(14, 'day'),
                status: 'quote_request_open',
                quantity: 1,
                net_unit_price: 0,
            });
        }
        setIsModalVisible(true);
    };

    const showViewModal = (product: ManufacturingProduct) => {
        setViewingProduct(product);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            // Nettó ár számítása
            const netTotalPrice = values.quantity && values.net_unit_price
                ? values.quantity * values.net_unit_price
                : null;

            // Státusz automatikus váltás logika
            let finalStatus = values.status;
            if (values.net_unit_price && values.net_unit_price > 0) {
                // Ha van ár és jelenleg "nyitott ajánlatkérés" a státusz
                if (values.status === 'quote_request_open') {
                    finalStatus = 'quote_request_priced';
                }
            }

            const data = {
                date: values.date.format('YYYY-MM-DD'),
                name: values.name,
                description: values.description || '',
                internal_description: values.internal_description || '',
                quantity: values.quantity,
                quantity_unit: values.quantity_unit || 'db',
                product_class: productClasses.find(pc => pc.name === values.product_class)?.id,
                project: projects.find(p => p.name === values.project)?.id,
                net_unit_price: values.net_unit_price || null,
                net_total_price: netTotalPrice,
                currency: values.currency || null,
                status: finalStatus,
                contact: contacts.find(c => c.name === values.contact)?.id,
                deadline: values.deadline.format('YYYY-MM-DD'),
            };

            if (editingProduct) {
                await manufacturingService.updateProduct(editingProduct.id, data);
                message.success('Egyedi gyártás sikeresen frissítve!');
            } else {
                await manufacturingService.createProduct(data);
                message.success('Egyedi gyártás sikeresen létrehozva!');
            }

            setIsModalVisible(false);
            form.resetFields();
            loadProducts();
        } catch (err) {
            console.error('Error saving product:', err);
            message.error('Hiba történt az egyedi gyártás mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await manufacturingService.deleteProduct(id);
            message.success('Termék sikeresen törölve!');
            loadProducts();
        } catch (err) {
            console.error('Error deleting product:', err);
            message.error('Hiba történt a termék törlése során');
        }
    };

    const handleStatusFilter = (status: string) => {
        setStatusFilter(status);
    };

    const handleUpdateExchangeRates = async () => {
        setUpdatingRates(true);
        try {
            await manufacturingService.updateExchangeRates();
            message.success('Árfolyamok sikeresen frissítve!');
            // Valuták újratöltése
            loadCurrencies();
        } catch (err) {
            console.error('Error updating exchange rates:', err);
            message.error('Hiba történt az árfolyamok frissítése során');
        } finally {
            setUpdatingRates(false);
        }
    };

    const getCurrentCurrencySymbol = () => {
        const selectedCurrencyId = form.getFieldValue('currency');
        const selectedCurrency = currencies.find(c => c.id === selectedCurrencyId);
        return selectedCurrency?.symbol || 'Ft';
    };

    const calculateTotalPrice = (sourceField: 'quantity' | 'unitPrice' | 'totalPrice') => {
        const quantity = form.getFieldValue('quantity');
        const unitPrice = form.getFieldValue('net_unit_price');
        const totalPrice = form.getFieldValue('net_total_price');

        if (quantity && quantity > 0) {
            if (sourceField === 'totalPrice' && totalPrice && totalPrice > 0) {
                // Ha nettó ár van megadva, számoljuk vissza az egységárat
                const calculatedUnitPrice = totalPrice / quantity;
                form.setFieldValue('net_unit_price', calculatedUnitPrice);
            } else if (sourceField === 'unitPrice' && unitPrice && unitPrice > 0) {
                // Ha egységár van megadva, számoljuk a nettó árat
                const calculatedTotalPrice = quantity * unitPrice;
                form.setFieldValue('net_total_price', calculatedTotalPrice);
            } else if (sourceField === 'quantity' && unitPrice && unitPrice > 0) {
                // Ha mennyiség változik és van egységár, számoljuk a nettó árat
                const calculatedTotalPrice = quantity * unitPrice;
                form.setFieldValue('net_total_price', calculatedTotalPrice);
            }
        }
    };

    const filteredProducts = (() => {
        // Először státusz szűrés
        let result = statusFilter
            ? products.filter(product => product.status === statusFilter)
            : products;
        
        // Utána keresés
        const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const q = normalize(query);
        if (q) {
            result = result.filter(prod => {
                const hay = [
                    prod.name || '',
                    prod.description || '',
                    prod.product_class_name || '',
                    prod.project_name || '',
                    prod.contact_name || '',
                    prod.contact_company_name || '',
                    prod.status_display || ''
                ].join(' \u0001 ');
                return normalize(hay).includes(q);
            });
        }
        return result;
    })();

    const columns = [
        {
            title: 'Dátum',
            dataIndex: 'date',
            key: 'date',
            width: 100,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) =>
                dayjs(a.date).unix() - dayjs(b.date).unix(),
        },
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => a.name.localeCompare(b.name),
        },
        {
            title: 'Mennyiség',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 100,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => a.quantity - b.quantity,
        },
        {
            title: 'Termék osztály',
            dataIndex: 'product_class_name',
            key: 'product_class_name',
            width: 150,
            render: (name: string) => name || '-',
        },
        {
            title: 'Projekt',
            dataIndex: 'project_name',
            key: 'project_name',
            width: 150,
            render: (name: string) => name || '-',
        },
        {
            title: 'Nettó ár',
            dataIndex: 'net_total_price',
            key: 'net_total_price',
            width: 120,
            render: (price: number, record: ManufacturingProduct) => {
                const currencySymbol = record.currency_info?.symbol || 'Ft';
                return `${price.toLocaleString('hu-HU')} ${currencySymbol}`;
            },
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => a.net_total_price - b.net_total_price,
        },
        {
            title: 'Állapot',
            dataIndex: 'status_display',
            key: 'status_display',
            width: 150,
            render: (status: string, record: ManufacturingProduct) => (
                <Tag color={STATUS_COLORS[record.status] || 'default'}>
                    {status}
                </Tag>
            ),
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => (a.status_display || '').localeCompare(b.status_display || ''),
        },
        {
            title: 'Ügyfél',
            dataIndex: 'contact_name',
            key: 'contact_name',
            width: 200,
            render: (name: string, record: ManufacturingProduct) => {
                if (name && record.contact_company_name) {
                    return `${name} - ${record.contact_company_name}`;
                } else if (name) {
                    return name;
                }
                return '-';
            },
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) => {
                const aName = a.contact_name || '';
                const bName = b.contact_name || '';
                return aName.localeCompare(bName);
            },
        },
        {
            title: 'Határidő',
            dataIndex: 'deadline',
            key: 'deadline',
            width: 100,
            sorter: (a: ManufacturingProduct, b: ManufacturingProduct) =>
                dayjs(a.deadline).unix() - dayjs(b.deadline).unix(),
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (record: ManufacturingProduct) => (
                <Space size="small">
                    <Tooltip title="Megtekintés">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => showViewModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Szerkesztés">
                        <Button
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => showModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Törlés">
                        <Popconfirm
                            title="Biztosan törölni szeretné ezt a terméket?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Igen"
                            cancelText="Mégse"
                        >
                            <Button
                                icon={<DeleteOutlined />}
                                size="small"
                                danger
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Card
                title="Egyedi gyártás"
                extra={
                    <Space>
                        <Select
                            placeholder="Állapot szerinti szűrés"
                            style={{ width: 200 }}
                            allowClear
                            value={statusFilter}
                            onChange={handleStatusFilter}
                            suffixIcon={<FilterOutlined />}
                        >
                            <Option value="">Mind</Option>
                            <Option value="quote_request_open">Ajánlatkérés nyitott</Option>
                            <Option value="quote_request_priced">Ajánlatkérés árazott</Option>
                            <Option value="quote_request_sent">Ajánlatkérés kiküldött</Option>
                            <Option value="ordered">Megrendelve</Option>
                            <Option value="design_in_progress">Tervezés alatt</Option>
                            <Option value="design_approved">Tervezés jóváhagyva</Option>
                            <Option value="production_in_progress">Gyártás alatt</Option>
                            <Option value="production_completed">Gyártás kész</Option>
                            <Option value="finished_goods_warehouse">Készárú raktárban</Option>
                            <Option value="installation_in_progress">Kihelyezés alatt</Option>
                            <Option value="delivered">Kiszállítva</Option>
                            <Option value="invoiced">Számlázva</Option>
                            <Option value="paid">Kifizetve</Option>
                        </Select>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => showModal()}
                        >
                            Új egyedi gyártás
                        </Button>
                    </Space>
                }
            >
                <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
                    <Input
                        placeholder="Keresés (név, leírás, termékosztály, projekt, ügyfél)..."
                        prefix={<SearchOutlined />}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        allowClear
                    />
                </Space>

                <Table
                    columns={columns}
                    dataSource={filteredProducts}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} termék`,
                    }}
                    rowKey="id"
                    scroll={{ x: 1500 }}
                    rowClassName={(record) => {
                        const statusColor = STATUS_COLORS[record.status] || 'default';
                        return `status-row-${statusColor}`;
                    }}
                    size="small"
                    loading={loading}
                    onRow={(record) => ({
                        onDoubleClick: () => showModal(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            {/* Termék Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{editingProduct ? 'Termék szerkesztése' : 'Új termék'}</span>
                        <Space>
                            <Button
                                type="primary"
                                onClick={() => form.submit()}
                            >
                                Mentés
                            </Button>
                            <Button
                                onClick={() => {
                                    setIsModalVisible(false);
                                    form.resetFields();
                                }}
                            >
                                Bezárás
                            </Button>
                        </Space>
                    </div>
                }
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                }}
                width={800}
                footer={null}
                closable={false}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="date"
                                label="Dátum"
                                rules={[{ required: true, message: 'Kérjük, adja meg a dátumot!' }]}
                            >
                                <HungarianDatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="deadline"
                                label="Határidő"
                                rules={[{ required: true, message: 'Kérjük, adja meg a határidőt!' }]}
                            >
                                <HungarianDatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="name"
                        label="Név"
                        rules={[{ required: true, message: 'Kérjük, adja meg a nevet!' }]}
                    >
                        <Input placeholder="Termék neve" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Leírás"
                    >
                        <TextArea rows={3} placeholder="Termék leírása" />
                    </Form.Item>

                    <Form.Item
                        name="internal_description"
                        label="Belső leírás"
                    >
                        <TextArea rows={3} placeholder="Belső leírás" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={6}>
                            <Form.Item
                                name="quantity"
                                label="Mennyiség"
                                rules={[{ required: true, message: 'Kérjük, adja meg a mennyiséget!' }]}
                            >
                                <InputNumber
                                    min={0}
                                    step={0.01}
                                    style={{ width: '100%' }}
                                    placeholder="Mennyiség"
                                    onChange={() => calculateTotalPrice('quantity')}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item
                                name="quantity_unit"
                                label="Mennyiségi egység"
                                initialValue="db"
                            >
                                <Select placeholder="Válasszon egységet">
                                    <Option value="db">db</Option>
                                    <Option value="kg">kg</Option>
                                    <Option value="m">m</Option>
                                    <Option value="m²">m²</Option>
                                    <Option value="m³">m³</Option>
                                    <Option value="l">l</Option>
                                    <Option value="pár">pár</Option>
                                    <Option value="szett">szett</Option>
                                    <Option value="darab">darab</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.currency !== currentValues.currency}>
                                {() => (
                                    <Form.Item
                                        name="net_unit_price"
                                        label={`Nettó egység ár (${getCurrentCurrencySymbol()})`}
                                    >
                                        <InputNumber
                                            min={0}
                                            step={0.01}
                                            style={{ width: '100%' }}
                                            placeholder="Egység ár"
                                            onChange={() => calculateTotalPrice('unitPrice')}
                                        />
                                    </Form.Item>
                                )}
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.currency !== currentValues.currency}>
                                {() => (
                                    <Form.Item
                                        name="net_total_price"
                                        label={`Nettó ár (${getCurrentCurrencySymbol()})`}
                                    >
                                        <InputNumber
                                            min={0}
                                            step={0.01}
                                            style={{ width: '100%' }}
                                            placeholder="Összesen"
                                            onChange={() => calculateTotalPrice('totalPrice')}
                                        />
                                    </Form.Item>
                                )}
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="status"
                                label="Állapot"
                                initialValue="quote_request_open"
                                rules={[{ required: true, message: 'Kérjük, válasszon állapotot!' }]}
                            >
                                <Select placeholder="Válasszon állapotot">
                                    <Option value="quote_request_open">Ajánlatkérés nyitott</Option>
                                    <Option value="quote_request_priced">Ajánlatkérés árazott</Option>
                                    <Option value="quote_request_sent">Ajánlatkérés kiküldött</Option>
                                    <Option value="ordered">Megrendelve</Option>
                                    <Option value="design_in_progress">Tervezés alatt</Option>
                                    <Option value="design_approved">Tervezés jóváhagyva</Option>
                                    <Option value="production_in_progress">Gyártás alatt</Option>
                                    <Option value="production_completed">Gyártás kész</Option>
                                    <Option value="finished_goods_warehouse">Készárú raktárban</Option>
                                    <Option value="installation_in_progress">Kihelyezés alatt</Option>
                                    <Option value="delivered">Kiszállítva</Option>
                                    <Option value="invoiced">Számlázva</Option>
                                    <Option value="paid">Kifizetve</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="currency"
                                label="Valuta"
                                initialValue={currencies.find(c => c.is_default)?.id}
                            >
                                <Select placeholder="Válasszon valutát" allowClear>
                                    {currencies.map(currency => (
                                        <Option key={currency.id} value={currency.id}>
                                            {currency.code} - {currency.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                loading={updatingRates}
                                onClick={handleUpdateExchangeRates}
                                title="Árfolyamok frissítése MNB API-ból"
                                style={{ marginTop: 8, marginRight: 8 }}
                            >
                                Árfolyamok frissítése
                            </Button>
                            <Button
                                size="small"
                                onClick={() => setIsExchangeRatesModalVisible(true)}
                                title="Nettó ár megjelenítése különböző árfolyamokban"
                                style={{ marginTop: 8 }}
                            >
                                Árfolyamok
                            </Button>
                        </Col>
                        <Col span={8}>
                            {/* Üres oszlop a layout miatt */}
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="product_class"
                                label="Termék osztály"
                            >
                                <Select placeholder="Válasszon termék osztályt" allowClear>
                                    {productClasses.map(pc => (
                                        <Option key={pc.id} value={pc.name}>
                                            {pc.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="project"
                                label="Projekt"
                            >
                                <Select placeholder="Válasszon projektet" allowClear>
                                    {projects.map(p => (
                                        <Option key={p.id} value={p.name}>
                                            {p.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="contact"
                                label="Ügyfél"
                            >
                                <Select
                                    placeholder="Válasszon ügyfelet"
                                    allowClear
                                    showSearch
                                    optionFilterProp="children"
                                    filterOption={(input, option) => {
                                        // A teljes szöveg a children-ben van: "Kapcsolattartó név - Cég név"
                                        // De mivel ez React elem, a szöveget másképp kell kinyerni
                                        const contactName = option?.value as string; // Kapcsolattartó neve

                                        // A cégnév nincs az option-ban, ezért a contacts tömbből kell kinyerni
                                        const contactId = option?.key;
                                        const contact = contacts.find(c => c.id.toString() === contactId);
                                        const companyName = contact?.company_name || 'Magánszemély';

                                        // Teljes keresési szöveg: kapcsolattartó név + cég név
                                        const fullSearchText = `${contactName} ${companyName}`;

                                        if (!fullSearchText || typeof fullSearchText !== 'string') {
                                            return false;
                                        }

                                        // Ékezetek eltávolítása és kisbetűsítés
                                        const normalizeText = (text: string) => {
                                            return text
                                                .normalize('NFD')
                                                .replace(/[\u0300-\u036f]/g, '')
                                                .toLowerCase()
                                                .replace(/[^a-z0-9\s]/g, '');
                                        };

                                        const normalizedInput = normalizeText(input);
                                        const normalizedSearchText = normalizeText(fullSearchText);

                                        const result = normalizedSearchText.includes(normalizedInput);
                                        return result;
                                    }}
                                >
                                    {contacts.map(c => (
                                        <Option key={c.id} value={c.name}>
                                            {c.name} - {c.company_name || 'Magánszemély'}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Egyedi gyártás adatai"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={800}
            >
                {viewingProduct && (
                    <div>
                        <Row gutter={16}>
                            <Col span={12}>
                                <p><strong>Dátum:</strong> {dayjs(viewingProduct.date).format('YYYY.MM.DD')}</p>
                                <p><strong>Név:</strong> {viewingProduct.name}</p>
                                <p><strong>Mennyiség:</strong> {viewingProduct.quantity}</p>
                                <p><strong>Termék osztály:</strong> {viewingProduct.product_class_name || '-'}</p>
                                <p><strong>Projekt:</strong> {viewingProduct.project_name || '-'}</p>
                            </Col>
                            <Col span={12}>
                                <p><strong>Nettó egység ár:</strong> {viewingProduct.net_unit_price.toLocaleString('hu-HU')} {viewingProduct.currency_info?.symbol || 'Ft'}</p>
                                <p><strong>Nettó ár:</strong> {viewingProduct.net_total_price.toLocaleString('hu-HU')} {viewingProduct.currency_info?.symbol || 'Ft'}</p>
                                <p><strong>Állapot:</strong>
                                    <Tag color={STATUS_COLORS[viewingProduct.status] || 'default'} style={{ marginLeft: 8 }}>
                                        {viewingProduct.status_display}
                                    </Tag>
                                </p>
                                <p><strong>Ügyfél:</strong> {viewingProduct.contact_name || '-'}</p>
                                <p><strong>Határidő:</strong> {dayjs(viewingProduct.deadline).format('YYYY.MM.DD')}</p>
                            </Col>
                        </Row>
                        {viewingProduct.description && (
                            <div style={{ marginTop: 16 }}>
                                <p><strong>Leírás:</strong></p>
                                <p>{viewingProduct.description}</p>
                            </div>
                        )}
                        {viewingProduct.internal_description && (
                            <div style={{ marginTop: 16 }}>
                                <p><strong>Belső leírás:</strong></p>
                                <p>{viewingProduct.internal_description}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Árfolyamok Modal */}
            <Modal
                title="Nettó ár különböző árfolyamokban"
                open={isExchangeRatesModalVisible}
                onCancel={() => setIsExchangeRatesModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsExchangeRatesModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={600}
            >
                <div>
                    <p>Az alábbi táblázat mutatja a nettó árat különböző valutákban:</p>
                    <Table
                        dataSource={currencies.map(currency => {
                            const currentProduct = editingProduct || viewingProduct;
                            return {
                                key: currency.id,
                                currency: `${currency.code} - ${currency.name}`,
                                rate: currency.exchange_rate || 1,
                                netPrice: currentProduct?.net_unit_price ? 
                                    (currentProduct.net_unit_price * (currency.exchange_rate || 1)).toFixed(2) : 
                                    'N/A'
                            };
                        })}
                        columns={[
                            {
                                title: 'Valuta',
                                dataIndex: 'currency',
                                key: 'currency',
                            },
                            {
                                title: 'Árfolyam (HUF-hoz képest)',
                                dataIndex: 'rate',
                                key: 'rate',
                                render: (rate: number) => rate.toFixed(4)
                            },
                            {
                                title: 'Nettó ár',
                                dataIndex: 'netPrice',
                                key: 'netPrice',
                                render: (price: string, record: any) => 
                                    price !== 'N/A' ? `${price} ${record.currency.split(' - ')[0]}` : 'N/A'
                            }
                        ]}
                        pagination={false}
                        size="small"
                    />
                </div>
            </Modal>
        </div>
    );
};

export default Products;