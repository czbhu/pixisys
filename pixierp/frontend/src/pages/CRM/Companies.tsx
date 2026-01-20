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
    List,
    Typography,
    Divider,
    Pagination,
    Segmented,
    Spin,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    ReloadOutlined,
    PoweroffOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { crmService } from '../../services/crmService';

type BankAccount = {
    id?: number;
    bank_name?: string;
    account_number?: string;
    iban?: string;
    swift_bic?: string;
    currency?: string;
    is_primary?: boolean;
};

type Company = {
    id: number;
    name: string;
    short_name?: string;
    tax_number?: string;
    group_tax_number?: string;
    eu_tax_number?: string;
    country?: string;
    postal_code?: string;
    city?: string;
    street_name?: string;
    street_type?: string;
    house_number?: string;
    address?: string;
    full_address?: string;
    email?: string;
    phone?: string;
    payment_due_days?: number;
    is_customer?: boolean;
    is_supplier?: boolean;
    is_active?: boolean;
    bank_accounts?: BankAccount[];
};

type ContactSummary = {
    id: number | string;
    full_name?: string;
    email?: string;
    phone?: string;
    contact_type?: string;
    is_primary?: boolean;
};

const { Option } = Select;
const { Title, Text } = Typography;
const { TextArea } = Input;

const defaultFormValues = {
    name: '',
    short_name: '',
    tax_number: '',
    group_tax_number: '',
    eu_tax_number: '',
    country: 'Magyarország',
    postal_code: '',
    city: '',
    street_name: '',
    street_type: 'utca',
    house_number: '',
    address: '',
    payment_due_days: 8,
    is_customer: true,
    is_supplier: false,
    is_active: true,
    bank_accounts: [] as BankAccount[],
};

const STREET_TYPES = [
    'utca', 'út', 'útja', 'tér', 'sétány', 'fasor', 'köz', 'park', 'körút', 'sor', 'lejáró', 'dűlő', 'lejtő', 'lépcső', 'rakpart', 'kert', 'halom', 'domb', 'híd', 'rkp', 'krt', 'u', 'u.', 'út.', 'útja'
];

const Companies: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [customerTypeFilter, setCustomerTypeFilter] = useState<'all' | 'customers' | 'suppliers'>('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [viewingCompany, setViewingCompany] = useState<Company | null>(null);
    const [companyDetail, setCompanyDetail] = useState<Company | null>(null);
    const [companyContacts, setCompanyContacts] = useState<ContactSummary[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [form] = Form.useForm();

    const loadCompanies = useCallback(async (opts?: { query?: string }) => {
        try {
            setLoading(true);
            const response = await crmService.getCompanies({ q: opts?.query || undefined });
            const data = (response as any)?.results || response;
            setCompanies(Array.isArray(data) ? data : []);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error loading companies:', err);
            message.error('Hiba történt a cégek betöltésekor');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCompanies();
    }, [loadCompanies]);

    const showCreateModal = useCallback(() => {
        setEditingCompany(null);
        form.setFieldsValue(defaultFormValues);
        setIsModalVisible(true);
    }, [form]);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('action') === 'create') {
            showCreateModal();
        }
    }, [location.search, showCreateModal]);

    const filteredCompanies = useMemo(() => {
        const q = (searchQuery || '').trim().toLowerCase();
        return companies.filter((c) => {
            if (statusFilter === 'active' && c.is_active === false) return false;
            if (statusFilter === 'inactive' && c.is_active !== false) return false;
            if (customerTypeFilter === 'customers' && !c.is_customer) return false;
            if (customerTypeFilter === 'suppliers' && !c.is_supplier) return false;
            if (!q) return true;
            const haystack = [
                c.name,
                c.tax_number,
                c.group_tax_number,
                c.eu_tax_number,
                c.city,
                c.email,
                c.full_address,
            ]
                .filter(Boolean)
                .join(' ') 
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [companies, statusFilter, searchQuery, customerTypeFilter]);

    useEffect(() => {
        setPage(1);
    }, [searchQuery, statusFilter, customerTypeFilter]);

    const pagedCompanies = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredCompanies.slice(start, start + pageSize);
    }, [filteredCompanies, page, pageSize]);

    const normalizeDetail = (detail: any): Company => {
        if (!detail) return detail as Company;
        const houseNumber = detail.house_number || detail.street_number || detail.streetNumber || detail.number || '';
        const streetType = detail.street_type || detail.public_place_category || detail.publicPlaceCategory || detail.public_place_category_display || detail.street_type_display;
        const euTax = detail.eu_tax_number || detail.euTaxNumber || detail.eu_vat_number || detail.euVatNumber;
        const bankAccountsRaw = detail.bank_accounts || detail.bankaccount_set || detail.bankAccounts || detail.accounts || detail.bank_account_list || [];
            const bank_accounts = (bankAccountsRaw || []).map((acc: any) => ({
            id: acc.id,
            bank_name: acc.bank_name || acc.bankName,
            account_number: acc.account_number || acc.accountNumber,
            iban: acc.iban,
            swift_bic: acc.swift_bic || acc.swiftBic,
            currency: acc.currency || 'HUF',
            is_primary: acc.is_primary ?? acc.isPrimary ?? acc.primary ?? false,
        }));
        return {
            ...detail,
            house_number: houseNumber,
            street_type: streetType,
            bank_accounts,
            eu_tax_number: euTax,
            address: detail.address_extra || detail.address_other || detail.address_extra_text || '',
        } as Company;
    };

    const showEditModal = async (company: Company) => {
        try {
            setLoading(true);
            const rawDetail = await crmService.getCompany(company.id);
            const detail = normalizeDetail(rawDetail);
            const bankAccounts = (detail as any)?.bank_accounts || [];
            setEditingCompany(detail);
            form.setFieldsValue({
                ...defaultFormValues,
                ...company,
                ...detail,
                bank_accounts: bankAccounts.length ? bankAccounts : [{ currency: 'HUF', is_primary: true }],
            });
            setIsModalVisible(true);
        } catch (err) {
            message.error('Nem sikerült betölteni a cég részleteit');
        } finally {
            setLoading(false);
        }
    };

    const openViewModal = async (company: Company) => {
        setViewingCompany(company);
        setIsViewModalVisible(true);
        setDetailLoading(true);
        try {
            const rawDetail = await crmService.getCompany(company.id);
            const detail = normalizeDetail(rawDetail);
            const contactsResp = await crmService.getContacts({ customer_id: company.id });
            const contactsData = (contactsResp as any)?.results || contactsResp || [];
            const filteredContacts = contactsData.filter((ct: any) => String(ct.customer || ct.customer_id || ct.company || ct.company_id) === String(company.id));
            setCompanyDetail(detail);
            setCompanyContacts(filteredContacts);
        } catch (err) {
            message.error('Nem sikerült lekérni a cég adatlapját');
        } finally {
            setDetailLoading(false);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const payload = {
                ...values,
                street_number: values.house_number || values.street_number,
                public_place_category: values.street_type,
            };
            if (editingCompany) {
                await crmService.updateCompany(editingCompany.id, payload);
                message.success('Cég frissítve');
            } else {
                await crmService.createCompany(payload);
                message.success('Cég létrehozva');
            }
            setIsModalVisible(false);
            setEditingCompany(null);
            form.resetFields();
            loadCompanies({ query: searchQuery });
        } catch (err) {
            message.error('Hiba történt a mentés során');
        }
    };

    const handleDelete = (company: Company) => {
        Modal.confirm({
            title: `Biztosan törli a(z) ${company.name} céget?`,
            okText: 'Igen',
            cancelText: 'Mégse',
            centered: true,
            onOk: async () => {
                try {
                    await crmService.deleteCompany(company.id);
                    message.success('Cég törölve');
                    loadCompanies({ query: searchQuery });
                } catch (err) {
                    message.error('Hiba történt a törlés során');
                }
            },
        });
    };

    const handleToggleActive = async (company: Company) => {
        try {
            const nextActive = company.is_active === false ? true : false;
            await crmService.updateCompany(company.id, { ...company, is_active: nextActive });
            message.success('Státusz frissítve');
            loadCompanies({ query: searchQuery });
        } catch (err) {
            message.error('Nem sikerült frissíteni a státuszt');
        }
    };

    const renderStatus = (c: Company) => {
        if (c.is_active === false) return <Tag color="red">Inaktív</Tag>;
        return <Tag color="green">Aktív</Tag>;
    };

    const renderTypes = (c: Company) => (
        <Space size="small">
            {c.is_customer && <Tag color="blue">Ügyfél</Tag>}
            {c.is_supplier && <Tag color="green">Beszállító</Tag>}
            {!c.is_customer && !c.is_supplier && <Tag>Általános</Tag>}
        </Space>
    );

    const renderAddress = (c: Company) => {
        const house = c.house_number || (c as any).street_number || (c as any).streetNumber || (c as any).number;
        const streetType = c.street_type || (c as any).public_place_category || (c as any).publicPlaceCategory;
        const parts = [c.postal_code, c.city, c.street_name, streetType, house].filter(Boolean);
        if (parts.length === 0 && c.address) {
            parts.push(c.address);
        }
        return parts.join(' ') || c.full_address || '-';
    };

    return (
        <Card
            title={
                <Space size="large" wrap>
                    <Title level={4} style={{ margin: 0 }}>Cégek</Title>
                    <Tag color="blue">PixInvoice CRM</Tag>
                </Space>
            }
            extra={
                <Space wrap style={{ justifyContent: 'flex-end', maxWidth: '100%' }}>
                    <Input.Search
                        allowClear
                        placeholder="Keresés..."
                        enterButton={<SearchOutlined />}
                        style={{ width: 200 }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onSearch={(val) => { setSearchQuery(val); loadCompanies({ query: val }); }}
                    />
                    <Select
                        value={statusFilter}
                        style={{ width: 140 }}
                        onChange={(val) => setStatusFilter(val)}
                    >
                        <Option value="all">Minden</Option>
                        <Option value="active">Aktív</Option>
                        <Option value="inactive">Inaktív</Option>
                    </Select>
                    <Button icon={<ReloadOutlined />} onClick={() => loadCompanies({ query: searchQuery })} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
                        Új
                    </Button>
                </Space>
            }
            loading={loading}
        >
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
                <Space>
                    <Segmented
                        value={customerTypeFilter}
                        onChange={(val) => setCustomerTypeFilter(val as any)}
                        options={[
                            { label: 'Mind', value: 'all' },
                            { label: 'Vevők', value: 'customers' },
                            { label: 'Beszállítók', value: 'suppliers' },
                        ]}
                    />
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={filteredCompanies.length}
                        showSizeChanger
                        onChange={(p, size) => { setPage(p); setPageSize(size); }}
                        size="small"
                    />
                </Space>
                <Text type="secondary">{filteredCompanies.length} találat</Text>
            </Space>

            <List
                dataSource={pagedCompanies}
                locale={{ emptyText: 'Nincs megjeleníthető cég' }}
                renderItem={(item) => (
                    <List.Item
                        key={item.id}
                        actions={[
                            <Button key="view" icon={<EyeOutlined />} onClick={() => openViewModal(item)} type="link">Megtekintés</Button>,
                            <Button key="edit" icon={<EditOutlined />} onClick={() => showEditModal(item)} type="link">Szerkesztés</Button>,
                            <Button key="delete" icon={<DeleteOutlined />} danger type="link" onClick={() => handleDelete(item)}>Törlés</Button>,
                        ]}
                    >
                        <List.Item.Meta
                            title={
                                <Space size="small">
                                    <Text strong>{item.name}</Text>
                                    {renderStatus(item)}
                                    {renderTypes(item)}
                                </Space>
                            }
                            description={
                                <Space direction="vertical" size={2}>
                                    <Text type="secondary">{item.tax_number || 'Adószám nincs megadva'}</Text>
                                    <Text type="secondary">{renderAddress(item)}</Text>
                                    {item.email && <Text type="secondary">{item.email}</Text>}
                                </Space>
                            }
                        />
                        <Space>
                            <Switch
                                size="small"
                                checkedChildren={<PoweroffOutlined />}
                                unCheckedChildren={<PoweroffOutlined />}
                                checked={item.is_active !== false}
                                onChange={() => handleToggleActive(item)}
                            />
                        </Space>
                    </List.Item>
                )}
            />

            <Pagination
                style={{ marginTop: 12, textAlign: 'right' }}
                current={page}
                pageSize={pageSize}
                total={filteredCompanies.length}
                showSizeChanger
                onChange={(p, size) => { setPage(p); setPageSize(size); }}
                showTotal={(total) => `${total} cég`}
            />

            <Modal
                open={isModalVisible}
                title={editingCompany ? 'Cég szerkesztése' : 'Új cég'}
                onCancel={() => { setIsModalVisible(false); setEditingCompany(null); form.resetFields(); }}
                onOk={handleSubmit}
                okText="Mentés"
                cancelText="Mégse"
                width={920}
            >
                <Form
                    layout="vertical"
                    form={form}
                    initialValues={defaultFormValues}
                >
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="name" label="Cégnév" rules={[{ required: true, message: 'Kötelező mező' }]}>
                                <Input placeholder="Cégnév" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="short_name" label="Rövid név">
                                <Input placeholder="Rövid név" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="tax_number" label="Adószám">
                                <Input placeholder="12345678-1-42" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="group_tax_number" label="Csoportos adószám">
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="eu_tax_number" label="EU adószám">
                                <Input placeholder="HU..." />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="payment_due_days" label="Fizetési határidő (nap)">
                                <Input type="number" min={0} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left">Cím</Divider>
                    <Row gutter={16}>
                        <Col xs={24} md={8}>
                            <Form.Item name="country" label="Ország">
                                <Input placeholder="Magyarország" />
                            </Form.Item>
                        </Col>
                        <Col xs={10} md={4}>
                            <Form.Item name="postal_code" label="Irányítószám">
                                <Input maxLength={10} />
                            </Form.Item>
                        </Col>
                        <Col xs={14} md={12}>
                            <Form.Item name="city" label="Város">
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="street_name" label="Közterület neve">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Item name="street_type" label="Közterület jellege">
                                <Select
                                    allowClear
                                    showSearch
                                    optionFilterProp="label"
                                    options={STREET_TYPES.map((t) => ({ label: t, value: t }))}
                                    placeholder="pl. utca / útja"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Item name="house_number" label="Házszám">
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="address" label="Egyéb cím / megjegyzés">
                        <TextArea rows={2} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col xs={24} md={8}>
                            <Form.Item name="email" label="E-mail">
                                <Input type="email" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="phone" label="Telefon">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item label="Szerepkörök">
                                <Space>
                                    <Form.Item name="is_customer" valuePropName="checked" noStyle>
                                        <Switch checkedChildren="Ügyfél" unCheckedChildren="Ügyfél" />
                                    </Form.Item>
                                    <Form.Item name="is_supplier" valuePropName="checked" noStyle>
                                        <Switch checkedChildren="Beszállító" unCheckedChildren="Beszállító" />
                                    </Form.Item>
                                </Space>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left">Bankszámlák</Divider>
                    <Form.List name="bank_accounts">
                        {(fields, { add, remove }) => (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {fields.map((field, idx) => {
                                    const accounts = form.getFieldValue('bank_accounts') || [];
                                    const isPrimary = accounts[idx]?.is_primary;
                                    return (
                                        <Card key={field.key} size="small" title={<Space><Text strong>Számla #{idx + 1}</Text>{isPrimary && <Tag color="blue">Elsődleges</Tag>}</Space>} extra={
                                            <Space>
                                                <Button size="small" onClick={() => {
                                                    const current = form.getFieldValue('bank_accounts') || [];
                                                    const next = current.map((acc: any, index: number) => ({ ...acc, is_primary: index === idx }));
                                                    form.setFieldsValue({ bank_accounts: next });
                                                }}>Elsődleges</Button>
                                                <Button size="small" danger onClick={() => remove(field.name)}>Törlés</Button>
                                            </Space>
                                        }>
                                            <Row gutter={12}>
                                                <Col xs={24} md={12}>
                                                    <Form.Item name={[field.name, 'bank_name']} label="Bank neve">
                                                        <Input placeholder="Bank neve" />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} md={12}>
                                                    <Form.Item name={[field.name, 'account_number']} label="Számlaszám">
                                                        <Input placeholder="123-456..." />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Row gutter={12}>
                                                <Col xs={24} md={12}>
                                                    <Form.Item name={[field.name, 'iban']} label="IBAN">
                                                        <Input placeholder="IBAN" />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} md={12}>
                                                    <Form.Item name={[field.name, 'swift_bic']} label="SWIFT/BIC">
                                                        <Input placeholder="SWIFT/BIC" />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Row gutter={12}>
                                                <Col xs={12} md={8}>
                                                    <Form.Item name={[field.name, 'currency']} label="Pénznem" initialValue="HUF">
                                                        <Select options={[
                                                            { label: 'HUF', value: 'HUF' },
                                                            { label: 'EUR', value: 'EUR' },
                                                            { label: 'USD', value: 'USD' },
                                                            { label: 'GBP', value: 'GBP' },
                                                        ]} />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={12} md={8}>
                                                    <Form.Item name={[field.name, 'is_primary']} label="Elsődleges" valuePropName="checked">
                                                        <Switch onChange={() => {
                                                            const current = form.getFieldValue('bank_accounts') || [];
                                                            const next = current.map((acc: any, index: number) => ({ ...acc, is_primary: index === idx }));
                                                            form.setFieldsValue({ bank_accounts: next });
                                                        }} />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        </Card>
                                    );
                                })}
                                <Button type="dashed" onClick={() => add({ currency: 'HUF', is_primary: fields.length === 0 })} block icon={<PlusOutlined />}>Új bankszámla</Button>
                            </Space>
                        )}
                    </Form.List>

                    <Divider orientation="left">Státusz</Divider>
                    <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={isViewModalVisible}
                title="Cég adatlap"
                footer={null}
                onCancel={() => { setIsViewModalVisible(false); setCompanyDetail(null); setCompanyContacts([]); }}
                width={900}
            >
                {detailLoading && <Spin style={{ display: 'block', textAlign: 'center' }} />}
                {!detailLoading && (companyDetail || viewingCompany) && (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        {(() => {
                            const detail = companyDetail || viewingCompany;
                            if (!detail) return null;
                            return (
                        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
                            <Descriptions.Item label="Név">{detail.name}</Descriptions.Item>
                            <Descriptions.Item label="Rövid név">{detail.short_name || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Adószám">{detail.tax_number || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Csoport adószám">{detail.group_tax_number || '-'}</Descriptions.Item>
                            <Descriptions.Item label="EU adószám">{detail.eu_tax_number || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Fizetési határidő">{detail.payment_due_days ? `${detail.payment_due_days} nap` : '-'}</Descriptions.Item>
                            <Descriptions.Item label="Ország">{detail.country || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Város">{detail.city || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Cím">{renderAddress(detail)}</Descriptions.Item>
                            <Descriptions.Item label="E-mail">{detail.email || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Telefon">{detail.phone || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Szerepkörök">{renderTypes(detail)}</Descriptions.Item>
                            <Descriptions.Item label="Státusz">{renderStatus(detail)}</Descriptions.Item>
                        </Descriptions>
                            );
                        })()}

                        <Divider orientation="left">Bankszámlák</Divider>
                        {companyDetail?.bank_accounts?.length ? (
                            <List
                                dataSource={companyDetail.bank_accounts}
                                renderItem={(acc) => (
                                    <List.Item key={acc.id || acc.account_number}>
                                        <Space direction="vertical" size={2}>
                                            <Space size="small">
                                                <Text strong>{acc.account_number || acc.iban || 'Ismeretlen számla'}</Text>
                                                {acc.is_primary && <Tag color="blue">Elsődleges</Tag>}
                                            </Space>
                                            <Text type="secondary">{[acc.bank_name, acc.currency].filter(Boolean).join(' • ') || 'Nincs további adat'}</Text>
                                        </Space>
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Text type="secondary">Nincs rögzített bankszámla</Text>
                        )}

                        <Divider orientation="left">Kapcsolattartók</Divider>
                        {companyContacts.length ? (
                            <List
                                dataSource={companyContacts}
                                renderItem={(ct) => (
                                    <List.Item key={ct.id} onClick={() => navigate(`/crm/contacts?contact=${ct.id}`)} style={{ cursor: 'pointer' }}>
                                        <Space direction="vertical" size={2}>
                                            <Space size="small">
                                                <Text strong>{ct.full_name}</Text>
                                                {ct.is_primary && <Tag color="gold">Elsődleges</Tag>}
                                                {ct.contact_type && <Tag color="blue">{ct.contact_type}</Tag>}
                                            </Space>
                                            <Space size="small">
                                                {ct.email && <Text type="secondary">{ct.email}</Text>}
                                                {ct.phone && <Text type="secondary">{ct.phone}</Text>}
                                            </Space>
                                        </Space>
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Text type="secondary">Nincs kapcsolattartó</Text>
                        )}
                    </Space>
                )}
            </Modal>
        </Card>
    );
};

export default Companies;
