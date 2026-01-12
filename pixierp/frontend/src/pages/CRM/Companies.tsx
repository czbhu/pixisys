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
    Spin,
    Alert,
    message,
    Tag,
    Descriptions,
    Row,
    Col,
    Checkbox,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { crmService } from '../../services/crmService';
import { postalCodeService } from '../../services/postalCodeService';
import { getCountries } from '../../services/countryService';

const { Option } = Select;
const { TextArea } = Input;

const Companies: React.FC = () => {
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isReassignModalVisible, setIsReassignModalVisible] = useState(false);
    const [editingCompany, setEditingCompany] = useState<any>(null);
    const [viewingCompany, setViewingCompany] = useState<any>(null);
    const [deletingCompany, setDeletingCompany] = useState<any>(null);
    const [reassignCompanyId, setReassignCompanyId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [form] = Form.useForm();
    const [selectedCountry, setSelectedCountry] = useState('Magyarország');
    const [navPreviewOpen, setNavPreviewOpen] = useState(false);
    const [navPreviewData, setNavPreviewData] = useState<any>(null);
    const [navPreviewSel, setNavPreviewSel] = useState<Record<string, boolean>>({});
    const [navDebug, setNavDebug] = useState<boolean>(false);

    useEffect(() => {
        loadCompanies();
    }, []);

    // Check for action=create query parameter
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('action') === 'create') {
            showCreateModal();
        }
    }, [location.search]);

    const loadCompanies = async () => {
        try {
            setLoading(true);
            const response = await crmService.getCompanies();
            // Handle paginated response
            const companies = response.results || response;
            setCompanies(Array.isArray(companies) ? companies : []);
            setError(null);
        } catch (err) {
            console.error('Error loading companies:', err);
            setError('Hiba történt a cégek betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const postalCode = e.target.value;
        if (postalCode && postalCode.length === 4) {
            const cityData = postalCodeService.getCityByPostalCode(postalCode);
            if (cityData) {
                form.setFieldsValue({ city: cityData });
            }
        }
    };

    const handleCountryChange = (value: string) => {
        setSelectedCountry(value);
        // Töröljük a form mezőket ország váltáskor
        form.setFieldsValue({
            postal_code: '',
            city: '',
            street_name: '',
            street_type: 'utca',
            house_number: '',
            address: ''
        });
    };

    const showCreateModal = () => {
        setEditingCompany(null);
        setSelectedCountry('Magyarország');
        form.resetFields();
        form.setFieldsValue({ 
            country: 'Magyarország',
            is_customer: true,
            is_supplier: false
        });
        setIsModalVisible(true);
    };

    const showEditModal = (company: any) => {
        setEditingCompany(company);
        setSelectedCountry(company.country || 'Magyarország');
        form.setFieldsValue({
            name: company.name,
            tax_number: company.tax_number || '',
            group_tax_number: company.group_tax_number || '',
            eu_tax_number: company.eu_tax_number || '',
            country: company.country || 'Magyarország',
            postal_code: company.postal_code || '',
            city: company.city || '',
            street_name: company.street_name || '',
            street_type: company.street_type || 'utca',
            house_number: company.house_number || '',
            address: company.address || '',
            is_customer: company.is_customer !== undefined ? company.is_customer : true,
            is_supplier: company.is_supplier !== undefined ? company.is_supplier : false
        });
        setIsModalVisible(true);
    };

    const showViewModal = (company: any) => {
        setViewingCompany(company);
        setIsViewModalVisible(true);
    };

    const showDeleteModal = (company: any) => {
        setDeletingCompany(company);
        setIsDeleteModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingCompany) {
                await crmService.updateCompany(editingCompany.id, values);
                message.success('Cég sikeresen frissítve!');
            } else {
                await crmService.createCompany(values);
                message.success('Cég sikeresen létrehozva!');
            }
            setIsModalVisible(false);
            form.resetFields();
            loadCompanies();
        } catch (err) {
            console.error('Error saving company:', err);
            message.error('Hiba történt a cég mentése során');
        }
    };

    const handleDelete = async (action: string) => {
        if (!deletingCompany) return;

        if (action === 'reassign_all') {
            setIsDeleteModalVisible(false);
            setIsReassignModalVisible(true);
            return;
        }

        try {
            await crmService.deleteCompany(deletingCompany.id, action);
            message.success('Cég sikeresen törölve!');
            setIsDeleteModalVisible(false);
            setDeletingCompany(null);
            loadCompanies();
        } catch (err) {
            console.error('Error deleting company:', err);
            message.error('Hiba történt a cég törlése során');
        }
    };

    const handleReassign = async () => {
        if (!deletingCompany || !reassignCompanyId) return;

        try {
            await crmService.deleteCompany(deletingCompany.id, 'reassign_all', reassignCompanyId);
            message.success('Cég sikeresen törölve és összes adat áthelyezve!');
            setIsReassignModalVisible(false);
            setDeletingCompany(null);
            setReassignCompanyId(null);
            loadCompanies();
        } catch (err) {
            console.error('Error deleting company:', err);
            message.error('Hiba történt a cég törlése során');
        }
    };

    const columns = [
        {
            title: 'Cégnév',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: any, b: any) => a.name.localeCompare(b.name),
        },
        {
            title: 'Típus',
            key: 'company_type',
            render: (record: any) => (
                <Space>
                    {record.is_customer && <Tag color="blue">Ügyfél</Tag>}
                    {record.is_supplier && <Tag color="green">Beszállító</Tag>}
                    {!record.is_customer && !record.is_supplier && <Tag>Nincs szerepkör</Tag>}
                </Space>
            ),
        },
        {
            title: 'Adószám',
            key: 'tax_number',
            render: (record: any) => (
                <div>
                    {record.tax_number && <Tag color="blue">{record.tax_number}</Tag>}
                    {record.group_tax_number && <Tag color="green">{record.group_tax_number}</Tag>}
                    {record.eu_tax_number && <Tag color="orange">{record.eu_tax_number}</Tag>}
                </div>
            ),
        },
        {
            title: 'Ország',
            dataIndex: 'country',
            key: 'country',
            sorter: (a: any, b: any) => a.country.localeCompare(b.country),
        },
        {
            title: 'Cím',
            dataIndex: 'full_address',
            key: 'full_address',
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (record: any) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => showViewModal(record)}
                        title="Megtekintés"
                    />
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => showEditModal(record)}
                        title="Szerkesztés"
                    />
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => showDeleteModal(record)}
                        title="Törlés"
                    />
                </Space>
            ),
        },
    ];

    const filteredCompanies = (companies || []).filter(company => {
        const matchesSearch = company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            company.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (company.tax_number && company.tax_number.includes(searchQuery)) ||
            (company.group_tax_number && company.group_tax_number.includes(searchQuery)) ||
            (company.eu_tax_number && company.eu_tax_number.includes(searchQuery));
        
        const matchesType = typeFilter === 'all' || 
            (typeFilter === 'customer' && company.is_customer) ||
            (typeFilter === 'supplier' && company.is_supplier);
        
        return matchesSearch && matchesType;
    });

    if (loading) {
        return <Spin size="large" style={{ display: 'block', margin: '50px auto' }} />;
    }

    return (
        <div>
            <Card
                title="Cégek kezelése"
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
                            value={typeFilter}
                            onChange={setTypeFilter}
                            style={{ width: 120 }}
                        >
                            <Option value="all">Mind</Option>
                            <Option value="customer">Ügyfél</Option>
                            <Option value="supplier">Beszállító</Option>
                        </Select>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={showCreateModal}
                        >
                            Új cég
                        </Button>
                    </Space>
                }
            >
                {error && (
                    <Alert
                        message="Hiba"
                        description={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Table
                    columns={columns}
                    dataSource={filteredCompanies}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    onRow={(record) => ({
                        onDoubleClick: () => showEditModal(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            {/* Létrehozás/Szerkesztés Modal */}
            <Modal
                title={editingCompany ? 'Cég szerkesztése' : 'Új cég létrehozása'}
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={800}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item
                                name="name"
                                label="Cégnév"
                                rules={[{ required: true, message: 'Kérjük, adja meg a cégnév!' }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="Szerepkörök">
                                <Space direction="vertical">
                                    <Form.Item
                                        name="is_customer"
                                        valuePropName="checked"
                                        noStyle
                                    >
                                        <Checkbox>Ügyfél</Checkbox>
                                    </Form.Item>
                                    <Form.Item
                                        name="is_supplier"
                                        valuePropName="checked"
                                        noStyle
                                    >
                                        <Checkbox>Beszállító</Checkbox>
                                    </Form.Item>
                                </Space>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="tax_number"
                                label="Adószám"
                                help="Magyar adószám: 12345678-1-41"
                            >
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input placeholder="12345678-1-41" />
                                    <Button
                                        onClick={async () => {
                                            try {
                                                const raw = form.getFieldValue('tax_number') || '';
                                                const digits = String(raw).replace(/[^0-9]/g, '');
                                                if (digits.length < 8) {
                                                    message.warning('Adja meg az adószám első 8 számjegyét!');
                                                    return;
                                                }
                                                const before = form.getFieldsValue();
                                                if (navDebug) {
                                                    // eslint-disable-next-line no-console
                                                    console.log('[Companies] NAV lookup start', { raw });
                                                }
                                                const data = await crmService.lookupCompanyByNav(raw, { debug: navDebug });
                                                if (navDebug) {
                                                    // eslint-disable-next-line no-console
                                                    console.log('[Companies] NAV lookup result', data);
                                                }
                                                const downHost = (data as any)?.debug?.finance?.host;
                                                if (downHost) {
                                                    message.error(`Nem elérhető az API host: ${downHost}`);
                                                }
                                                // NAV adószám azonnali frissítése, ha eltér és teljesebb
                                                if ((data as any)?.tax_number) {
                                                    const curTax = String((before as any).tax_number || '').trim();
                                                    const newTax = String((data as any).tax_number || '').trim();
                                                    if (newTax && newTax !== curTax) {
                                                        form.setFieldsValue({ tax_number: newTax });
                                                    }
                                                }
                                                if (data && data.found === false) {
                                                    const base = data?.debug?.finance?.host || data?.debug?.client?.base || data?.debug?.fallback?.url;
                                                    if (base) {
                                                        message.error(`Nem elérhető az API host: ${base}`);
                                                    } else {
                                                        message.warning('Nem található cég a megadott adószám alapján');
                                                    }
                                                    setNavPreviewData(data?.debug ? data : null);
                                                    setNavPreviewSel({});
                                                    if (data?.debug) setNavPreviewOpen(true);
                                                    return;
                                                }
                                                // Default selection: select fields that have a value and current form is empty
                                                const fieldMap: { key: string; target: string }[] = [
                                                    { key: 'name', target: 'name' },
                                                    { key: 'tax_number', target: 'tax_number' },
                                                    { key: 'group_tax_number', target: 'group_tax_number' },
                                                    { key: 'eu_tax_number', target: 'eu_tax_number' },
                                                    { key: 'country', target: 'country' },
                                                    { key: 'postal_code', target: 'postal_code' },
                                                    { key: 'city', target: 'city' },
                                                    { key: 'street_name', target: 'street_name' },
                                                    { key: 'street_type', target: 'street_type' },
                                                    { key: 'house_number', target: 'house_number' },
                                                    { key: 'full_address', target: 'address' },
                                                ];
                                                const sel: Record<string, boolean> = {};
                                                fieldMap.forEach(({ key, target }) => {
                                                    const v = (data as any)[key];
                                                    const cur = (before as any)[target];
                                                    sel[key] = Boolean(v) && (!cur || String(cur).trim() === '');
                                                });
                                                // Preferáld a NAV adószámot: ha a NAV érték formázott és eltér a jelenlegitől, előválaszd
                                                if ((data as any).tax_number) {
                                                    const curTax = String((before as any).tax_number || '').trim();
                                                    const newTax = String((data as any).tax_number || '').trim();
                                                    const fullPattern = /^\d{8}-\d-\d{2}$/;
                                                    if (newTax && newTax !== curTax) {
                                                        sel['tax_number'] = true;
                                                    } else if (fullPattern.test(newTax) && !fullPattern.test(curTax)) {
                                                        sel['tax_number'] = true;
                                                    }
                                                }
                                                setNavPreviewData(data);
                                                setNavPreviewSel(sel);
                                                setNavPreviewOpen(true);
                                            } catch (e: any) {
                                                const status = e?.response?.status;
                                                if (status === 404) {
                                                    message.warning('Nem található cég a megadott adószám alapján');
                                                } else {
                                                    const msg = e?.response?.data?.error || 'NAV lekérdezés sikertelen';
                                                    message.error(msg);
                                                }
                                            }
                                        }}
                                    >
                                        NAV-tól
                                    </Button>
                                </Space.Compact>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="group_tax_number"
                                label="Csoport adószám"
                                help="Csoport adószám: 12345678-1-12"
                            >
                                <Input placeholder="12345678-1-12" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="eu_tax_number"
                                label="EU adószám"
                                help="EU adószám: HU11956541"
                            >
                                <Input placeholder="HU11956541" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="country"
                                label="Ország"
                                rules={[{ required: true, message: 'Kérjük, válassza ki az országot!' }]}
                            >
                                <Select
                                    showSearch
                                    placeholder="Válasszon országot"
                                    optionFilterProp="children"
                                    filterOption={(input, option) =>
                                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                    onChange={handleCountryChange}
                                >
                                    {getCountries().map(country => (
                                        <Option key={country.value} value={country.value}>
                                            {country.label}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    {selectedCountry === 'Magyarország' ? (
                        <>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        name="postal_code"
                                        label="Irányítószám"
                                        rules={[{ required: true, message: 'Kérjük, adja meg az irányítószámot!' }]}
                                    >
                                        <Input
                                            placeholder="1051"
                                            onChange={handlePostalCodeChange}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={16}>
                                    <Form.Item
                                        name="city"
                                        label="Város"
                                        rules={[{ required: true, message: 'Kérjük, adja meg a várost!' }]}
                                    >
                                        <Input placeholder="Budapest" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item label="Közterület" style={{ marginBottom: 0 }}>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Form.Item
                                        name="street_name"
                                        noStyle
                                        rules={[{ required: true, message: 'Közterület neve kötelező!' }]}
                                    >
                                        <Input
                                            style={{ width: '70%' }}
                                            placeholder="Közterület neve"
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        name="street_type"
                                        noStyle
                                        rules={[{ required: true, message: 'Kérjük, válassza ki a közterület típusát!' }]}
                                    >
                                        <Select
                                            style={{ width: '30%' }}
                                            placeholder="Típus"
                                            showSearch
                                            optionFilterProp="children"
                                            filterOption={(input, option) =>
                                                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                                            }
                                        >
                                            {postalCodeService.getStreetTypes().map(type => (
                                                <Option key={type.value} value={type.value}>
                                                    {type.label}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Space.Compact>
                            </Form.Item>

                            <Form.Item
                                name="house_number"
                                label="Házszám"
                            >
                                <Input placeholder="1." />
                            </Form.Item>
                        </>
                    ) : (
                        <Form.Item
                            name="address"
                            label="Cím"
                            rules={[{ required: true, message: 'Kérjük, adja meg a címet!' }]}
                        >
                            <TextArea
                                rows={3}
                                placeholder="Teljes cím (utca, házszám, város, irányítószám, ország)"
                            />
                        </Form.Item>
                    )}

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            {editingCompany && (
                                <Button 
                                    onClick={() => {
                                        window.open(`/crm/contacts?company=${editingCompany.id}`, '_blank');
                                    }}
                                >
                                    Kapcsolattartók
                                </Button>
                            )}
                            <Button onClick={() => setIsModalVisible(false)}>
                                Mégse
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingCompany ? 'Frissítés' : 'Létrehozás'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* NAV előnézeti modal */}
            <Modal
                title="NAV adatok előnézete"
                open={navPreviewOpen}
                onCancel={() => setNavPreviewOpen(false)}
                onOk={() => {
                    if (!navPreviewData) { setNavPreviewOpen(false); return; }
                    const before = form.getFieldsValue();
                    const applyMap: Record<string, string> = {
                        name: 'name',
                        tax_number: 'tax_number',
                        group_tax_number: 'group_tax_number',
                        eu_tax_number: 'eu_tax_number',
                        country: 'country',
                        postal_code: 'postal_code',
                        city: 'city',
                        street_name: 'street_name',
                        street_type: 'street_type',
                        house_number: 'house_number',
                        full_address: 'address',
                    };
                    const newValues: any = { ...before };
                    Object.entries(applyMap).forEach(([src, dest]) => {
                        if (navPreviewSel[src] && (navPreviewData as any)[src] != null) {
                            newValues[dest] = (navPreviewData as any)[src];
                        }
                    });
                    form.setFieldsValue(newValues);
                    const changed = Object.keys(newValues).some(k => (before as any)[k] !== (newValues as any)[k]);
                    if (changed) message.success('NAV adatok alkalmazva'); else message.info('Nem történt változás');
                    setNavPreviewOpen(false);
                }}
                okText="Kiválasztott mezők beillesztése"
                cancelText="Mégse"
                width={720}
            >
                {navPreviewData?.debug && (
                    <Alert type="info" showIcon message="Debug" description={<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(navPreviewData.debug, null, 2)}</pre>} style={{ marginBottom: 16 }} />
                )}
                {navPreviewData ? (
                    <div>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Checkbox
                                    checked={!!navPreviewSel.name}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, name: e.target.checked })}
                                >
                                    Cégnév
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.name || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.tax_number}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, tax_number: e.target.checked })}
                                >
                                    Adószám
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.tax_number || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.group_tax_number}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, group_tax_number: e.target.checked })}
                                >
                                    Csoport adószám
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.group_tax_number || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.eu_tax_number}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, eu_tax_number: e.target.checked })}
                                >
                                    EU adószám
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.eu_tax_number || '-'}</div>
                            </Col>
                            <Col span={12}>
                                <Checkbox
                                    checked={!!navPreviewSel.country}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, country: e.target.checked })}
                                >
                                    Ország
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.country || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.postal_code}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, postal_code: e.target.checked })}
                                >
                                    Irányítószám
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.postal_code || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.city}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, city: e.target.checked })}
                                >
                                    Város
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.city || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.street_name}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, street_name: e.target.checked })}
                                >
                                    Közterület neve
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.street_name || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.street_type}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, street_type: e.target.checked })}
                                >
                                    Közterület típusa
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.street_type || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.house_number}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, house_number: e.target.checked })}
                                >
                                    Házszám
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.house_number || '-'}</div>

                                <Checkbox
                                    checked={!!navPreviewSel.full_address}
                                    onChange={e => setNavPreviewSel({ ...navPreviewSel, full_address: e.target.checked })}
                                >
                                    Teljes cím
                                </Checkbox>
                                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.full_address || '-'}</div>
                            </Col>
                        </Row>
                    </div>
                ) : (
                    <Alert type="warning" message="Nincs előnézeti adat" />
                )}
            </Modal>

            {/* NAV debug kapcsoló */}
            <div style={{ marginTop: 8 }}>
                <Checkbox checked={navDebug} onChange={e => setNavDebug(e.target.checked)}>NAV debug mód</Checkbox>
            </div>

            {/* Megtekintés Modal */}
            <Modal
                title="Cég részletei"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button 
                        key="contacts" 
                        type="primary"
                        onClick={() => {
                            if (viewingCompany) {
                                window.open(`/crm/contacts?company=${viewingCompany.id}`, '_blank');
                            }
                        }}
                    >
                        Kapcsolattartók
                    </Button>,
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
            >
                {viewingCompany && (
                    <Descriptions column={1} bordered>
                        <Descriptions.Item label="Cégnév">{viewingCompany.name}</Descriptions.Item>
                        <Descriptions.Item label="Szerepkörök">
                            <Space>
                                {viewingCompany.is_customer && <Tag color="blue">Ügyfél</Tag>}
                                {viewingCompany.is_supplier && <Tag color="green">Beszállító</Tag>}
                                {!viewingCompany.is_customer && !viewingCompany.is_supplier && <Tag>Nincs szerepkör</Tag>}
                            </Space>
                        </Descriptions.Item>
                        {viewingCompany.tax_number && (
                            <Descriptions.Item label="Adószám">
                                <Tag color="blue">{viewingCompany.tax_number}</Tag>
                            </Descriptions.Item>
                        )}
                        {viewingCompany.group_tax_number && (
                            <Descriptions.Item label="Csoport adószám">
                                <Tag color="green">{viewingCompany.group_tax_number}</Tag>
                            </Descriptions.Item>
                        )}
                        {viewingCompany.eu_tax_number && (
                            <Descriptions.Item label="EU adószám">
                                <Tag color="orange">{viewingCompany.eu_tax_number}</Tag>
                            </Descriptions.Item>
                        )}
                        <Descriptions.Item label="Ország">{viewingCompany.country}</Descriptions.Item>
                        <Descriptions.Item label="Cím">{viewingCompany.full_address}</Descriptions.Item>
                        <Descriptions.Item label="Létrehozva">
                            {new Date(viewingCompany.created_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                        <Descriptions.Item label="Módosítva">
                            {new Date(viewingCompany.updated_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>

            {/* Törlés Modal */}
            <Modal
                title="Cég törlése"
                open={isDeleteModalVisible}
                onCancel={() => setIsDeleteModalVisible(false)}
                footer={[
                    <Button key="cancel" onClick={() => setIsDeleteModalVisible(false)}>
                        Mégse
                    </Button>,
                    <Button key="delete" danger onClick={() => handleDelete('delete_all')}>
                        Törlés adatokkal együtt
                    </Button>,
                    <Button key="reassign" onClick={() => handleDelete('reassign_all')}>
                        Adatok átadása másik cégnek
                    </Button>,
                    <Button key="keep" onClick={() => handleDelete('keep_data')}>
                        Adatok megtartása és törlés
                    </Button>
                ]}
            >
                <p>Biztosan törölni szeretné a(z) <strong>{deletingCompany?.name}</strong> céget?</p>
                <p>Válassza ki, hogy mit szeretne csinálni a kapcsolódó adatokkal:</p>
                <ul>
                    <li><strong>Törlés adatokkal együtt:</strong> Minden adat (kapcsolattartók, rendelések, stb.) törlődik</li>
                    <li><strong>Adatok átadása másik cégnek:</strong> Összes adat áthelyezése másik céghez</li>
                    <li><strong>Adatok megtartása és törlés:</strong> Adatok megtartása cég nélkül</li>
                </ul>
            </Modal>

            {/* Áthelyezés Modal */}
            <Modal
                title="Adatok áthelyezése"
                open={isReassignModalVisible}
                onCancel={() => {
                    setIsReassignModalVisible(false);
                    setReassignCompanyId(null);
                }}
                onOk={handleReassign}
                okText="Áthelyezés és törlés"
                cancelText="Mégse"
                okButtonProps={{ disabled: !reassignCompanyId }}
            >
                <p>Válassza ki, hogy melyik céghez szeretné áthelyezni a(z) <strong>{deletingCompany?.name}</strong> összes adatát:</p>
                <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                    Ez magában foglalja: kapcsolattartókat, rendeléseket, ajánlatokat, számlákat és minden egyéb kapcsolódó adatot.
                </p>
                <Select
                    placeholder="Válasszon céget"
                    style={{ width: '100%' }}
                    showSearch
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    value={reassignCompanyId}
                    onChange={setReassignCompanyId}
                >
                    {companies.filter(company => company.id !== deletingCompany?.id).map(company => (
                        <Option key={company.id} value={company.id}>
                            {company.name}
                        </Option>
                    ))}
                </Select>
            </Modal>
        </div>
    );
};

export default Companies;