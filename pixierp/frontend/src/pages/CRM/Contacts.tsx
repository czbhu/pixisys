import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Card,
    Button,
    Space,
    Modal,
    Form,
    Input,
    Select,
    message,
    Tag,
    Descriptions,
    Row,
    Col,
    Switch,
    Pagination,
    List,
    Typography,
    Divider,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    ReloadOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
    SearchOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { crmService } from '../../services/crmService';

type Contact = {
    id: number | string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    position?: string;
    department?: string;
    contact_type?: string;
    is_primary?: boolean;
    is_active?: boolean;
    is_receipt?: boolean;
    company?: number | string | null;
    company_name?: string;
    customer_name?: string;
};

type CompanyOption = { id: number; name: string };

const { Option } = Select;
const { Title, Text } = Typography;

const defaultContactValues = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mobile: '',
    position: '',
    department: '',
    contact_type: 'other',
    company: null,
    is_primary: false,
    is_active: true,
    is_receipt: false,
};

const Contacts: React.FC = () => {
    const location = useLocation();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [extraCompany, setExtraCompany] = useState<CompanyOption | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [viewingContact, setViewingContact] = useState<Contact | null>(null);
    const [contactParam, setContactParam] = useState<string | null>(null);
    const [form] = Form.useForm();

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [contactResp, companyResp] = await Promise.all([
                crmService.getContacts({ q: searchQuery }),
                crmService.getCompanies(),
            ]);
            const cont = (contactResp as any)?.results || contactResp;
            const comps = (companyResp as any)?.results || companyResp;
            setContacts(Array.isArray(cont) ? cont : []);
            setCompanies(Array.isArray(comps) ? comps : []);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error loading contacts:', err);
            message.error('Hiba történt a kapcsolatok betöltésekor');
        } finally {
            setLoading(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const showCreateModal = useCallback(() => {
        setEditingContact(null);
        form.setFieldsValue({ ...defaultContactValues });
        setIsModalVisible(true);
    }, [form]);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const contactIdParam = searchParams.get('contact');
        if (contactIdParam) {
            setContactParam(contactIdParam);
        }
        if (searchParams.get('action') === 'create') {
            const companyParam = searchParams.get('company');
            const companyNameParam = searchParams.get('company_name');
            showCreateModal();
            if (companyParam) {
                const companyId = parseInt(companyParam, 10);
                if (!isNaN(companyId)) {
                    if (companyNameParam) {
                        setExtraCompany({ id: companyId, name: companyNameParam });
                        form.setFieldsValue({ company: companyId });
                    } else {
                        crmService.getCompany(companyId)
                            .then((c: any) => {
                                if (c) {
                                    setExtraCompany(c);
                                    form.setFieldsValue({ company: companyId });
                                }
                            })
                            .catch((err: any) => {
                                console.error('Failed to load company', err);
                                form.setFieldsValue({ company: companyId });
                            });
                    }
                }
            }
        }
    }, [location.search, showCreateModal, form]);

    useEffect(() => {
        if (contactParam && contacts.length) {
            const found = contacts.find((c) => String(c.id) === String(contactParam));
            if (found) {
                showViewModal(found);
                setContactParam(null);
            }
        }
    }, [contactParam, contacts]);

    const filteredContacts = useMemo(() => {
        const q = (searchQuery || '').trim().toLowerCase();
        return contacts.filter((c) => {
            const matchesType = typeFilter ? c.contact_type === typeFilter : true;
            const matchesStatus = statusFilter === 'active' ? c.is_active !== false : statusFilter === 'inactive' ? c.is_active === false : true;
            const matchesSearch = !q
                ? true
                : [
                    c.full_name,
                    c.name,
                    c.email,
                    c.phone,
                    c.mobile,
                    c.position,
                    c.department,
                    c.company_name,
                    c.customer_name,
                ]
                    .filter(Boolean)
                    .join(' ') 
                    .toLowerCase()
                    .includes(q);
            return matchesType && matchesStatus && matchesSearch;
        });
    }, [contacts, typeFilter, statusFilter, searchQuery]);

    const pagedContacts = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredContacts.slice(start, start + pageSize);
    }, [filteredContacts, page, pageSize]);

    const showEditModal = (contact: Contact) => {
        setEditingContact(contact);
        form.setFieldsValue({ ...defaultContactValues, ...contact });
        setIsModalVisible(true);
    };

    const showViewModal = (contact: Contact) => {
        setViewingContact(contact);
        setIsViewModalVisible(true);
    };

    const handleCancel = () => {
        if (form.isFieldsTouched()) {
            Modal.confirm({
                title: 'Biztos, hogy mentés nélkül be akarja zárni?',
                icon: <ExclamationCircleOutlined />,
                content: 'A módosítások elvesznek.',
                okText: 'Bezár',
                cancelText: 'Mégse',
                onOk: () => {
                     setIsModalVisible(false);
                     setEditingContact(null);
                     form.resetFields();
                },
            });
        } else {
             setIsModalVisible(false);
             setEditingContact(null);
             form.resetFields();
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const payload = { 
                ...values, 
                company: values.is_receipt ? null : (values.company || null) 
            };
            if (editingContact) {
                await crmService.updateContact(editingContact.id, payload);
                message.success('Kapcsolattartó frissítve');
            } else {
                await crmService.createContact(payload);
                message.success('Kapcsolattartó létrehozva');
            }
            setIsModalVisible(false);
            setEditingContact(null);
            form.resetFields();
            loadData();
        } catch (err) {
            message.error('Hiba történt a mentés során');
        }
    };

    const handleDelete = (contact: Contact) => {
        Modal.confirm({
            title: `Biztosan törli ${contact.full_name || contact.name}?`,
            okText: 'Igen',
            cancelText: 'Mégse',
            centered: true,
            onOk: async () => {
                try {
                    await crmService.deleteContact(contact.id);
                    message.success('Kapcsolattartó törölve');
                    loadData();
                } catch (err) {
                    message.error('Nem sikerült törölni');
                }
            },
        });
    };

    const handleToggleActive = async (contact: Contact) => {
        try {
            const nextActive = contact.is_active === false ? true : false;
            await crmService.updateContact(contact.id, { ...contact, is_active: nextActive });
            message.success('Státusz frissítve');
            loadData();
        } catch (err) {
            message.error('Nem sikerült frissíteni a státuszt');
        }
    };

    const handleSetPrimary = async (contact: Contact) => {
        try {
            await crmService.updateContact(contact.id, { ...contact, is_primary: true });
            message.success('Elsődleges kapcsolattartó beállítva');
            loadData();
        } catch (err) {
            message.error('Nem sikerült elsődlegesnek jelölni');
        }
    };

    const renderStatus = (c: Contact) => (c.is_active === false ? <Tag color="red">Inaktív</Tag> : <Tag color="green">Aktív</Tag>);

    const renderType = (c: Contact) => {
        const labels: Record<string, string> = {
            primary: 'Elsődleges',
            billing: 'Számlázási',
            technical: 'Technikai',
            sales: 'Értékesítési',
            support: 'Támogatási',
            other: 'Egyéb',
        };
        const label = labels[c.contact_type || ''] || 'Egyéb';
        return <Tag color="blue">{label}</Tag>;
    };

    const renderName = (c: Contact) => c.full_name || c.name || 'Név nélküli';

    const renderCompany = (c: Contact) => c.customer_name || c.company_name || '-';

    return (
        <Card
            title={
                <Space size="large">
                    <Title level={4} style={{ margin: 0 }}>Kapcsolattartók</Title>
                    <Tag color="blue">PixInvoice CRM</Tag>
                </Space>
            }
            extra={
                <Space wrap>
                    <Input.Search
                        allowClear
                        placeholder="Keresés név vagy e-mail alapján"
                        value={searchQuery}
                        enterButton={<SearchOutlined />}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onSearch={() => { setPage(1); loadData(); }}
                        style={{ width: 280 }}
                    />
                    <Select
                        value={typeFilter}
                        style={{ width: 180 }}
                        onChange={(val) => { setTypeFilter(val); setPage(1); }}
                    >
                        <Option value="">Minden típus</Option>
                        <Option value="primary">Elsődleges</Option>
                        <Option value="billing">Számlázási</Option>
                        <Option value="technical">Technikai</Option>
                        <Option value="sales">Értékesítési</Option>
                        <Option value="support">Támogatási</Option>
                        <Option value="other">Egyéb</Option>
                    </Select>
                    <Select
                        value={statusFilter}
                        style={{ width: 140 }}
                        onChange={(val) => { setStatusFilter(val); setPage(1); }}
                    >
                        <Option value="all">Minden</Option>
                        <Option value="active">Aktív</Option>
                        <Option value="inactive">Inaktív</Option>
                    </Select>
                    <Button icon={<ReloadOutlined />} onClick={() => loadData()}>Frissítés</Button>
                    <Button
                        type="default"
                        icon={viewMode === 'grid' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    >
                        {viewMode === 'grid' ? 'Listás nézet' : 'Kártyás nézet'}
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>Új kapcsolattartó</Button>
                </Space>
            }
            loading={loading}
        >
            {viewMode === 'grid' ? (
                <List
                    grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4 }}
                    dataSource={pagedContacts}
                    locale={{ emptyText: 'Nincs kapcsolattartó' }}
                    renderItem={(item) => (
                        <List.Item key={item.id}>
                            <Card
                                size="small"
                                title={
                                    <Space>
                                        <Text strong>{renderName(item)}</Text>
                                        {item.is_primary && <Tag color="gold">Elsődleges</Tag>}
                                        {renderStatus(item)}
                                    </Space>
                                }
                                extra={renderType(item)}
                                actions={[
                                    <EyeOutlined key="view" onClick={() => showViewModal(item)} />,
                                    <EditOutlined key="edit" onClick={() => showEditModal(item)} />,
                                    <DeleteOutlined key="delete" onClick={() => handleDelete(item)} />,
                                ]}
                            >
                                <Space direction="vertical" size={4}>
                                    <Text type="secondary">{renderCompany(item)}</Text>
                                    {item.position && <Text type="secondary">{item.position}</Text>}
                                    {item.department && <Text type="secondary">{item.department}</Text>}
                                    {item.email && <Text type="secondary">{item.email}</Text>}
                                    {(item.phone || item.mobile) && <Text type="secondary">{item.phone || item.mobile}</Text>}
                                    <Space size="small">
                                        <Button size="small" onClick={() => handleSetPrimary(item)} disabled={item.is_primary}>Elsődleges</Button>
                                        <Button size="small" onClick={() => handleToggleActive(item)}>
                                            {item.is_active === false ? 'Aktiválás' : 'Deaktiválás'}
                                        </Button>
                                    </Space>
                                </Space>
                            </Card>
                        </List.Item>
                    )}
                />
            ) : (
                <List
                    dataSource={pagedContacts}
                    itemLayout="horizontal"
                    locale={{ emptyText: 'Nincs kapcsolattartó' }}
                    renderItem={(item) => (
                        <List.Item
                            key={item.id}
                            actions={[
                                <Button key="view" type="link" icon={<EyeOutlined />} onClick={() => showViewModal(item)}>Megtekintés</Button>,
                                <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => showEditModal(item)}>Szerkesztés</Button>,
                                <Button key="delete" danger type="link" icon={<DeleteOutlined />} onClick={() => handleDelete(item)}>Törlés</Button>,
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <Space>
                                        <Text strong>{renderName(item)}</Text>
                                        {item.is_primary && <Tag color="gold">Elsődleges</Tag>}
                                        {renderStatus(item)}
                                    </Space>
                                }
                                description={
                                    <Space direction="vertical" size={2}>
                                        <Text type="secondary">{renderCompany(item)}</Text>
                                        {item.email && <Text type="secondary">{item.email}</Text>}
                                        {(item.phone || item.mobile) && <Text type="secondary">{item.phone || item.mobile}</Text>}
                                        <Space size="small">
                                            {renderType(item)}
                                            <Button size="small" onClick={() => handleSetPrimary(item)} disabled={item.is_primary}>Elsődleges</Button>
                                            <Button size="small" onClick={() => handleToggleActive(item)}>
                                                {item.is_active === false ? 'Aktiválás' : 'Deaktiválás'}
                                            </Button>
                                        </Space>
                                    </Space>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}

            <Pagination
                style={{ marginTop: 16, textAlign: 'right' }}
                current={page}
                pageSize={pageSize}
                total={filteredContacts.length}
                showSizeChanger
                onChange={(p, size) => { setPage(p); setPageSize(size); }}
                showTotal={(total) => `${total} kapcsolattartó`}
            />

            <Modal
                open={isModalVisible}
                title={editingContact ? 'Kapcsolattartó szerkesztése' : 'Új kapcsolattartó'}
                onCancel={handleCancel}
                onOk={handleSubmit}
                okText="Mentés"
                cancelText="Mégse"
                width={780}
            >
                <Form form={form} layout="vertical" initialValues={defaultContactValues}>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name="is_receipt" valuePropName="checked" label="Típus">
                                <Switch checkedChildren="Nyugtás (Magánszemély)" unCheckedChildren="Normál (Céges)" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="last_name" label="Vezetéknév" rules={[{ required: true, message: 'A vezetéknév kötelező' }]}>
                                <Input placeholder="Vezetéknév" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="first_name" label="Keresztnév" rules={[{ required: true, message: 'A keresztnév kötelező' }]}>
                                <Input placeholder="Keresztnév" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Érvénytelen e-mail cím' }]}> 
                                <Input placeholder="email@example.com" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="phone" label="Telefon">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="mobile" label="Mobil">
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.is_receipt !== curr.is_receipt}>
                        {({ getFieldValue }) => !getFieldValue('is_receipt') && (
                            <>
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item name="position" label="Pozíció">
                                            <Input />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item name="department" label="Osztály">
                                            <Input />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item name="contact_type" label="Kapcsolat típusa">
                                            <Select>
                                                <Option value="primary">Elsődleges</Option>
                                                <Option value="billing">Számlázási</Option>
                                                <Option value="technical">Technikai</Option>
                                                <Option value="sales">Értékesítési</Option>
                                                <Option value="support">Támogatási</Option>
                                                <Option value="other">Egyéb</Option>
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item name="company" label="Cég">
                                            <Select
                                                allowClear
                                                showSearch
                                                placeholder="Válasszon céget"
                                                optionFilterProp="label"
                                                options={[
                                                    ...companies,
                                                    ...(extraCompany && !companies.find((c) => c.id === extraCompany.id) ? [extraCompany] : []),
                                                ].map((c) => ({ label: c.name, value: c.id }))}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </>
                        )}
                    </Form.Item>
                    <Divider orientation="left">Státusz</Divider>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="is_primary" label="Elsődleges" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                open={isViewModalVisible}
                footer={null}
                onCancel={() => setIsViewModalVisible(false)}
                title="Kapcsolattartó adatlap"
                width={720}
            >
                {viewingContact && (
                    <Descriptions bordered column={2} size="small">
                        <Descriptions.Item label="Név">{renderName(viewingContact)}</Descriptions.Item>
                        <Descriptions.Item label="Típus">{renderType(viewingContact)}</Descriptions.Item>
                        <Descriptions.Item label="Cég">{renderCompany(viewingContact)}</Descriptions.Item>
                        <Descriptions.Item label="Státusz">{renderStatus(viewingContact)}</Descriptions.Item>
                        <Descriptions.Item label="E-mail">{viewingContact.email || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Telefon">{viewingContact.phone || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Mobil">{viewingContact.mobile || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Pozíció">{viewingContact.position || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Osztály">{viewingContact.department || '-'}</Descriptions.Item>
                        <Descriptions.Item label="Elsődleges">{viewingContact.is_primary ? 'Igen' : 'Nem'}</Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>
        </Card>
    );
};

export default Contacts;
