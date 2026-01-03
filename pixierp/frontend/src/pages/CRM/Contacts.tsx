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
    Popconfirm,
    Descriptions
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined
} from '@ant-design/icons';
import { crmService } from '../../services/crmService';

const { Option } = Select;

const Contacts: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contacts, setContacts] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingContact, setEditingContact] = useState<any>(null);
    const [viewingContact, setViewingContact] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [form] = Form.useForm();
    const [companyForm] = Form.useForm();
    const [isCompanyModalVisible, setIsCompanyModalVisible] = useState(false);
    const [creatingCompanyForContact, setCreatingCompanyForContact] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState('Magyarország');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [contactsResponse, companiesResponse] = await Promise.all([
                crmService.getContacts(),
                crmService.getCompanies()
            ]);
            setContacts(contactsResponse.results || []);
            setCompanies(companiesResponse.results || []);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Hiba történt az adatok betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const refreshCompanies = async () => {
        try {
            const companiesResponse = await crmService.getCompanies();
            setCompanies(companiesResponse.results || []);
        } catch (e) {
            // ignore
        }
    };

    const handleCreateContact = async (values: any) => {
        try {
            await crmService.createContact(values);
            message.success('Kapcsolattartó sikeresen létrehozva');
            setIsModalVisible(false);
            form.resetFields();
            loadData();
        } catch (err) {
            message.error('Hiba történt a kapcsolattartó létrehozása során');
        }
    };

    const handleUpdateContact = async (id: number, values: any) => {
        try {
            await crmService.updateContact(id, values);
            message.success('Kapcsolattartó sikeresen frissítve');
            setIsModalVisible(false);
            form.resetFields();
            setEditingContact(null);
            loadData();
        } catch (err) {
            message.error('Hiba történt a kapcsolattartó frissítése során');
        }
    };

    const handleDeleteContact = async (id: number) => {
        try {
            await crmService.deleteContact(id);
            message.success('Kapcsolattartó sikeresen törölve');
            loadData();
        } catch (err) {
            message.error('Hiba történt a kapcsolattartó törlése során');
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        try {
            setLoading(true);
            if (query.trim()) {
                const response = await crmService.searchContacts(query);
                setContacts(response);
            } else {
                loadData();
            }
        } catch (err) {
            console.error('Error searching contacts:', err);
            setError('Hiba történt a keresés során');
        } finally {
            setLoading(false);
        }
    };

    const showViewModal = (contact: any) => {
        setViewingContact(contact);
        setIsViewModalVisible(true);
    };

    const columns = [
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: any, b: any) => a.name.localeCompare(b.name),
            width: 150,
            fixed: 'left' as const,
        },
        {
            title: 'Telefonszám',
            dataIndex: 'phone',
            key: 'phone',
            width: 120,
            render: (phone: string) => phone || '-',
        },
        {
            title: 'E-mail',
            dataIndex: 'email',
            key: 'email',
            width: 180,
            render: (email: string) => email || '-',
        },
        {
            title: 'Cég',
            dataIndex: 'company_name',
            key: 'company_name',
            width: 150,
            render: (companyName: string, record: any) => {
                if (companyName) {
                    return <Tag color="blue">{companyName}</Tag>;
                } else if (record.company === "maganszemely") {
                    return <Tag color="green">Magánszemély</Tag>;
                } else {
                    return '-';
                }
            },
        },
        {
            title: 'Pozíció',
            dataIndex: 'position',
            key: 'position',
            width: 120,
            render: (position: string) => position || '-',
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (record: any) => (
                <Space size="small">
                    <Button
                        icon={<EyeOutlined />}
                        size="small"
                        title="Megtekintés"
                        onClick={() => showViewModal(record)}
                    />
                    <Button
                        icon={<EditOutlined />}
                        size="small"
                        title="Szerkesztés"
                        onClick={() => {
                            setEditingContact(record);
                            // Ha nincs cég, akkor "maganszemely"-t állítunk be
                            const formData = {
                                ...record,
                                company: record.company || 'maganszemely'
                            };
                            form.setFieldsValue(formData);
                            setIsModalVisible(true);
                        }}
                    />
                    <Popconfirm
                        title="Biztosan törölni szeretné ezt a kapcsolattartót?"
                        onConfirm={() => handleDeleteContact(record.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            danger
                            title="Törlés"
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '50px' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div>
            <Card
                title="Kapcsolattartók"
                extra={
                    <Space>
                        <Input.Search
                            placeholder="Kapcsolattartó keresése..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            style={{ width: 200 }}
                            prefix={<SearchOutlined />}
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setIsModalVisible(true)}
                        >
                            Új kapcsolattartó
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
                        style={{ marginBottom: '16px' }}
                    />
                )}
                <Table
                    columns={columns}
                    dataSource={contacts}
                    pagination={{ pageSize: 10 }}
                    rowKey="id"
                    scroll={{ x: 900 }}
                    size="small"
                    onRow={(record) => ({
                        onDoubleClick: () => {
                            setEditingContact(record);
                            const formData = {
                                ...record,
                                company: record.company || 'maganszemely'
                            };
                            form.setFieldsValue(formData);
                            setIsModalVisible(true);
                        },
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            <Modal
                title={editingContact ? 'Kapcsolattartó szerkesztése' : 'Új kapcsolattartó'}
                open={isModalVisible}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                    setEditingContact(null);
                }}
                onOk={() => form.submit()}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={(values) => {
                        if (editingContact) {
                            handleUpdateContact(editingContact.id, values);
                        } else {
                            handleCreateContact(values);
                        }
                    }}
                >
                    <Form.Item
                        name="name"
                        label="Név"
                        rules={[{ required: true, message: 'Kérjük, adja meg a nevet!' }]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="phone"
                        label="Telefonszám"
                        rules={[
                            {
                                pattern: /^(\+36|06)?[0-9]{1,2}[0-9]{7,8}$/,
                                message: 'Érvényes magyar telefonszám formátum'
                            }
                        ]}
                    >
                        <Input placeholder="+36-30-123-4567" />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="E-mail cím"
                        rules={[
                            { type: 'email', message: 'Kérjük, adjon meg érvényes e-mail címet!' }
                        ]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="company"
                        label="Cég"
                        initialValue="maganszemely"
                    >
                        <Space.Compact style={{ width: '100%' }}>
                            <Select
                                style={{ width: 'calc(100% - 110px)' }}
                                placeholder="Válasszon céget"
                                allowClear
                                showSearch
                                optionFilterProp="children"
                                filterOption={(input, option) =>
                                    (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                                }
                            >
                                <Option value="maganszemely">Magánszemély</Option>
                                {companies.map((company) => (
                                    <Option key={company.id} value={company.id}>
                                        {company.name}
                                    </Option>
                                ))}
                            </Select>
                            <Button
                                type="default"
                                onClick={() => {
                                    setCreatingCompanyForContact(true);
                                    setSelectedCountry('Magyarország');
                                    companyForm.resetFields();
                                    companyForm.setFieldsValue({ country: 'Magyarország', company_type: 'customer' });
                                    setIsCompanyModalVisible(true);
                                }}
                            >
                                Új cég
                            </Button>
                        </Space.Compact>
                    </Form.Item>

                    <Form.Item
                        name="position"
                        label="Pozíció"
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item
                        name="notes"
                        label="Megjegyzések"
                    >
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Inline Új Cég Modal */}
            <Modal
                title="Új cég létrehozása"
                open={isCompanyModalVisible}
                onCancel={() => {
                    setIsCompanyModalVisible(false);
                    setCreatingCompanyForContact(false);
                }}
                width={800}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={companyForm}
                    layout="vertical"
                    onFinish={async (values) => {
                        try {
                            const created = await crmService.createCompany(values);
                            message.success('Cég sikeresen létrehozva!');
                            setIsCompanyModalVisible(false);
                            setCreatingCompanyForContact(false);
                            await refreshCompanies();
                            if (created && created.id) {
                                form.setFieldsValue({ company: created.id });
                            }
                        } catch (e) {
                            message.error('Hiba történt a cég létrehozása során');
                        }
                    }}
                >
                    <Form.Item
                        name="name"
                        label="Cégnév"
                        rules={[{ required: true, message: 'Kérjük, adja meg a cégnév!' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item name="tax_number" label="Adószám" help="Magyar adószám: 12345678-1-41">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input placeholder="12345678-1-41" />
                            <Button
                                onClick={async () => {
                                    try {
                                        const raw = companyForm.getFieldValue('tax_number') || '';
                                        const digits = String(raw).replace(/[^0-9]/g, '');
                                        const tax8 = digits.slice(0,8);
                                        if (tax8.length !== 8) {
                                            message.warning('Adja meg az adószám első 8 számjegyét!');
                                            return;
                                        }
                                        // eslint-disable-next-line no-console
                                        console.log('[Contacts] NAV lookup start', { raw, digits, tax8 });
                                        const before = companyForm.getFieldsValue();
                                        const data = await crmService.lookupCompanyByNav(tax8, { debug: true });
                                        // eslint-disable-next-line no-console
                                        console.log('[Contacts] NAV lookup result', data);
                                        const downHost = (data as any)?.debug?.finance?.host;
                                        if (downHost) {
                                            message.error(`Nem elérhető az API host: ${downHost}`);
                                        }
                                        if ((data as any)?.tax_number) {
                                            const curTax = String((before as any).tax_number || '').trim();
                                            const newTax = String((data as any).tax_number || '').trim();
                                            if (newTax && newTax !== curTax) {
                                                companyForm.setFieldsValue({ tax_number: newTax });
                                            }
                                        }
                                        if (data && data.found === false) {
                                            const base = (data as any)?.debug?.finance?.host || (data as any)?.debug?.client?.base || (data as any)?.debug?.fallback?.url;
                                            if (base) {
                                                message.error(`Nem elérhető az API host: ${base}`);
                                            } else {
                                                message.warning('Nem található cég a megadott adószám alapján');
                                            }
                                            return;
                                        }
                                        companyForm.setFieldsValue({
                                            name: data.name || companyForm.getFieldValue('name'),
                                            tax_number: data.tax_number || raw,
                                            group_tax_number: data.group_tax_number || companyForm.getFieldValue('group_tax_number'),
                                            eu_tax_number: data.eu_tax_number || companyForm.getFieldValue('eu_tax_number'),
                                            country: data.country || companyForm.getFieldValue('country') || 'Magyarország',
                                            postal_code: data.postal_code || companyForm.getFieldValue('postal_code'),
                                            city: data.city || companyForm.getFieldValue('city'),
                                            street_name: data.street_name || companyForm.getFieldValue('street_name'),
                                            street_type: data.street_type || companyForm.getFieldValue('street_type') || 'utca',
                                            house_number: data.house_number || companyForm.getFieldValue('house_number'),
                                            address: data.full_address || companyForm.getFieldValue('address')
                                        });
                                        message.success('Adatok betöltve NAV-ból');
                                    } catch (e: any) {
                                        const msg = e?.response?.data?.error || 'NAV lekérdezés sikertelen';
                                        message.error(msg);
                                    }
                                }}
                            >
                                NAV-tól
                            </Button>
                        </Space.Compact>
                    </Form.Item>
                    <Form.Item
                        name="company_type"
                        label="Típus"
                        initialValue="customer"
                        rules={[{ required: true, message: 'Kérjük, válassza ki a típust!' }]}
                    >
                        <Select>
                            <Option value="customer">Ügyfél</Option>
                            <Option value="supplier">Beszállító</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="country"
                        label="Ország"
                        initialValue="Magyarország"
                        rules={[{ required: true, message: 'Kérjük, válassza ki az országot!' }]}
                    >
                        <Select
                            showSearch
                            placeholder="Válasszon országot"
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                            }
                            onChange={(v) => setSelectedCountry(v)}
                        >
                            <Option value="Magyarország">Magyarország</Option>
                            <Option value="Ausztria">Ausztria</Option>
                            <Option value="Szlovákia">Szlovákia</Option>
                            <Option value="Románia">Románia</Option>
                        </Select>
                    </Form.Item>
                    {selectedCountry === 'Magyarország' ? (
                        <>
                            <Form.Item name="postal_code" label="Irányítószám">
                                <Input placeholder="1051" />
                            </Form.Item>
                            <Form.Item name="city" label="Város">
                                <Input placeholder="Budapest" />
                            </Form.Item>
                            <Form.Item name="street_name" label="Közterület neve">
                                <Input />
                            </Form.Item>
                            <Form.Item name="street_type" label="Közterület típusa" initialValue="utca">
                                <Select>
                                    <Option value="utca">utca</Option>
                                    <Option value="út">út</Option>
                                    <Option value="tér">tér</Option>
                                </Select>
                            </Form.Item>
                            <Form.Item name="house_number" label="Házszám">
                                <Input placeholder="1." />
                            </Form.Item>
                        </>
                    ) : (
                        <Form.Item name="address" label="Cím">
                            <Input.TextArea rows={3} placeholder="Teljes cím" />
                        </Form.Item>
                    )}
                    <Form.Item style={{ textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => {
                                setIsCompanyModalVisible(false);
                                setCreatingCompanyForContact(false);
                            }}>Mégse</Button>
                            <Button type="primary" onClick={() => companyForm.submit()}>Létrehozás</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Kapcsolattartó részletei"
                open={isViewModalVisible}
                onCancel={() => {
                    setIsViewModalVisible(false);
                    setViewingContact(null);
                }}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={600}
            >
                {viewingContact && (
                    <Descriptions bordered column={1}>
                        <Descriptions.Item label="Név">
                            {viewingContact.name}
                        </Descriptions.Item>
                        <Descriptions.Item label="Telefonszám">
                            {viewingContact.phone || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="E-mail cím">
                            {viewingContact.email || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Cég">
                            {viewingContact.company_name ? (
                                <Tag color="blue">{viewingContact.company_name}</Tag>
                            ) : (
                                <Tag color="green">Magánszemély</Tag>
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Pozíció">
                            {viewingContact.position || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Megjegyzések">
                            {viewingContact.notes || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Létrehozva">
                            {new Date(viewingContact.created_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                        <Descriptions.Item label="Módosítva">
                            {new Date(viewingContact.updated_at).toLocaleString('hu-HU')}
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>
        </div>
    );
};

export default Contacts;