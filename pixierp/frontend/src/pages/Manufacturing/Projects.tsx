import React, { useState, useEffect } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
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
    message,
    Tag,
    Tooltip,
    Popconfirm,
    Row,
    Col
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    LinkOutlined,
    SearchOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { manufacturingService, Project } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';
import { hrService } from '../../services/hrService';
import HungarianDatePicker from '../../components/HungarianDatePicker';
import { createIntelligentFilter } from '../../utils/searchUtils';

const { Option } = Select;
const { TextArea } = Input;

const Projects: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [filtered, setFiltered] = useState<Project[]>([]);
    const [query, setQuery] = useState('');
    const [contacts, setContacts] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [viewingProject, setViewingProject] = useState<Project | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadProjects();
        loadCompanies();
        loadContacts();
        loadEmployees();
    }, []);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const response = await manufacturingService.getProjects();
            setProjects(response);
        } catch (err) {
            console.error('Error loading projects:', err);
            message.error('Hiba történt a projektek betöltése során');
        } finally {
            setLoading(false);
        }
    };

    const loadCompanies = async () => {
        try {
            const response = await crmService.getCompanies();
            const allCompanies = (response as any).results ?? response;
            setCompanies((allCompanies as any[]).filter((c: any) => c.is_customer));
        } catch (err) {
            console.error('Error loading companies:', err);
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

    const loadEmployees = async () => {
        try {
            const response = await hrService.getEmployees();
            setEmployees(response.results || response);
        } catch (err) {
            console.error('Error loading employees:', err);
        }
    };

    const showModal = async (project?: Project) => {
        if (project) {
            setEditingProject(project);
            form.setFieldsValue({
                name: project.name,
                description: project.description,
                deadline: dayjs(project.deadline),
                company_id: (project as any).company?.id || ((project as any).contact_names?.length > 0 ? 'private' : undefined),
                contacts: project.contact_names.map(name =>
                    contacts.find(c => c.name === name)?.id
                ).filter(Boolean),
                project_manager: employees.find(emp => emp.full_name === project.project_manager_name)?.id,
                status: project.status,
            });
            
            // Betöltjük a kapcsolattartókat a céghez vagy magánszemélyeket
            if ((project as any).company?.id) {
                try {
                    const list = await crmService.getContactsByCompany((project as any).company.id);
                    setContacts((list as any).results ?? list);
                } catch {}
            } else if ((project as any).contact_names?.length > 0) {
                try {
                    const list = await crmService.getPrivateContacts();
                    setContacts((list as any).results ?? list);
                } catch {}
            }
        } else {
            setEditingProject(null);
            form.resetFields();
            form.setFieldsValue({
                deadline: dayjs().add(14, 'day'),
                status: 'open',
            });
        }
        setIsModalVisible(true);
    };

    const showViewModal = (project: Project) => {
        setViewingProject(project);
        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            const data: any = {
                name: values.name,
                description: values.description || '',
                deadline: values.deadline.format('YYYY-MM-DD'),
                contacts: values.contacts || [],
                project_manager: values.project_manager,
                status: values.status,
            };
            
            // Set company: null for private, or the actual ID
            if (values.company_id === 'private') {
                data.company = null;
            } else if (values.company_id) {
                data.company = values.company_id;
            }

            if (editingProject) {
                await manufacturingService.updateProject(editingProject.id, data);
                message.success('Projekt sikeresen frissítve!');
            } else {
                await manufacturingService.createProject(data);
                message.success('Projekt sikeresen létrehozva!');
            }

            setIsModalVisible(false);
            form.resetFields();
            loadProjects();
        } catch (err) {
            console.error('Error saving project:', err);
            message.error('Hiba történt a projekt mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await manufacturingService.deleteProject(id);
            message.success('Projekt sikeresen törölve!');
            loadProjects();
        } catch (err) {
            console.error('Error deleting project:', err);
            message.error('Hiba történt a projekt törlése során');
        }
    };

    const handleViewProducts = (project: Project) => {
        // Új böngésző lapon megnyitjuk a termékeket
        const url = `/manufacturing/products?project=${project.id}`;
        window.open(url, '_blank');
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 80,
            sorter: (a: Project, b: Project) => a.id - b.id,
        },
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            sorter: (a: Project, b: Project) => a.name.localeCompare(b.name),
        },
        {
            title: 'Leírás',
            dataIndex: 'description',
            key: 'description',
            width: 250,
            render: (description: string) => description ?
                (description.length > 50 ? `${description.substring(0, 50)}...` : description) : '-',
        },
        {
            title: 'Határidő',
            dataIndex: 'deadline',
            key: 'deadline',
            width: 120,
            render: (deadline: string) => dayjs(deadline).format('YYYY.MM.DD'),
            sorter: (a: Project, b: Project) => dayjs(a.deadline).unix() - dayjs(b.deadline).unix(),
        },
        {
            title: 'Cég',
            dataIndex: 'company_name',
            key: 'company_name',
            width: 150,
            render: (company_name: string) => company_name || 'Magánszemély',
            sorter: (a: Project, b: Project) => ((a as any).company_name || 'Magánszemély').localeCompare((b as any).company_name || 'Magánszemély'),
        },
        {
            title: 'Kapcsolattartók',
            dataIndex: 'contact_names',
            key: 'contact_names',
            width: 200,
            render: (contactNames: string[]) => (
                <div>
                    {contactNames.slice(0, 2).map((name, index) => (
                        <Tag key={index} color="blue" style={{ marginBottom: 2 }}>
                            {name}
                        </Tag>
                    ))}
                    {contactNames.length > 2 && (
                        <Tag color="default">+{contactNames.length - 2}</Tag>
                    )}
                </div>
            ),
            sorter: (a: Project, b: Project) => (a.contact_names || []).join(',').localeCompare((b.contact_names || []).join(',')),
        },
        {
            title: 'Projektvezető',
            dataIndex: 'project_manager_name',
            key: 'project_manager_name',
            width: 150,
            render: (name: string) => name || '-',
            sorter: (a: Project, b: Project) => (a.project_manager_name || '').localeCompare(b.project_manager_name || ''),
        },
        {
            title: 'Állapot',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => (
                <Tag color={status === 'open' ? 'green' : 'red'}>
                    {status === 'open' ? 'Nyitott' : 'Zárt'}
                </Tag>
            ),
            sorter: (a: Project, b: Project) => (a.status || '').localeCompare(b.status || ''),
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 150,
            fixed: 'right' as const,
            render: (record: Project) => (
                <Space size="small">
                    <Tooltip title="Megtekintés">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => showViewModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Termékek">
                        <Button
                            icon={<LinkOutlined />}
                            size="small"
                            onClick={() => handleViewProducts(record)}
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
                            title="Biztosan törölni szeretné ezt a projektet?"
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
                title="Projektek"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showModal()}
                    >
                        Új projekt
                    </Button>
                }
            >
                <EnhancedTable
                    tableKey="projects"
                    searchValue={query}
                    onSearchChange={setQuery}
                    searchPlaceholder="Keresés (név, leírás, kapcsolattartók, projektmenedzser)..."
                    columns={columns}
                    dataSource={filtered}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} projekt`,
                    }}
                    rowKey="id"
                    cardBreakpoint={950}
                    size="small"
                    loading={loading}
                    onRow={(record) => ({
                        onDoubleClick: () => showModal(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            {/* Projekt Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{editingProject ? 'Projekt szerkesztése' : 'Új projekt'}</span>
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
                    <Form.Item
                        name="name"
                        label="Név"
                        rules={[{ required: true, message: 'Kérjük, adja meg a nevet!' }]}
                    >
                        <Input placeholder="Projekt neve" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Leírás"
                    >
                        <TextArea rows={3} placeholder="Projekt leírása" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="deadline"
                                label="Határidő"
                                rules={[{ required: true, message: 'Kérjük, adja meg a határidőt!' }]}
                            >
                                <HungarianDatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="status"
                                label="Állapot"
                                rules={[{ required: true, message: 'Kérjük, válasszon állapotot!' }]}
                            >
                                <Select placeholder="Válasszon állapotot">
                                    <Option value="open">Nyitott</Option>
                                    <Option value="closed">Zárt</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Row gutter={4}>
                                <Col flex="auto">
                                    <Form.Item name="company_id" label="Cég">
                                        <Select
                                            showSearch
                                            optionFilterProp="label"
                                            placeholder="Válassz céget"
                                            onFocus={async () => {
                                                // Frissítjük a cégek listáját amikor rákattintanak
                                                const list = await crmService.getCompanies();
                                                setCompanies((list as any).results ?? list);
                                            }}
                                            onChange={async (val) => {
                                                form.setFieldsValue({ company_id: val });
                                                if (val === 'private') {
                                                    const list = await crmService.getPrivateContacts();
                                                    setContacts((list as any).results ?? list);
                                                    form.setFieldsValue({ contacts: [] });
                                                } else {
                                                    const list = await crmService.getContactsByCompany(val);
                                                    setContacts((list as any).results ?? list);
                                                    form.setFieldsValue({ contacts: [] });
                                                }
                                            }}
                                        >
                                            <Option value="private">Magánszemély</Option>
                                            {companies.map((c: any) => (
                                                <Option key={c.id} value={c.id}>{c.name}</Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col flex="40px">
                                    <Form.Item label=" ">
                                        <Button
                                            icon={<PlusOutlined />}
                                            onClick={() => window.open('/crm/companies?action=create', '_blank')}
                                            title="Új cég"
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Col>
                        <Col span={12}>
                            <Row gutter={4}>
                                <Col flex="auto">
                                    <Form.Item
                                        name="contacts"
                                        label="Kapcsolattartók"
                                    >
                                        <Select
                                            mode="multiple"
                                            placeholder="Válasszon kapcsolattartókat"
                                            allowClear
                                            showSearch
                                            optionFilterProp="children"
                                            onFocus={async () => {
                                                // Frissítjük a kapcsolattartók listáját amikor rákattintanak
                                                const companyId = form.getFieldValue('company_id');
                                                if (companyId === 'private') {
                                                    const list = await crmService.getPrivateContacts();
                                                    setContacts((list as any).results ?? list);
                                                } else if (companyId) {
                                                    const list = await crmService.getContactsByCompany(companyId);
                                                    setContacts((list as any).results ?? list);
                                                } else {
                                                    // Nincs cég választva → összes kapcsolattartó
                                                    const list = await crmService.getContacts();
                                                    setContacts(((list as any).results ?? list) || []);
                                                }
                                            }}
                                            onChange={async (val: any) => {
                                                form.setFieldsValue({ contacts: val });
                                                const companyId = form.getFieldValue('company_id');
                                                if (!companyId && Array.isArray(val) && val.length > 0) {
                                                    const lastId = val[val.length - 1];
                                                    const chosen = contacts.find((c: any) => c.id === lastId || String(c.id) === String(lastId));
                                                    const chosenCompanyId = chosen?.customer || chosen?.customer_id || chosen?.company || chosen?.company_id;
                                                    if (chosenCompanyId) {
                                                        form.setFieldsValue({ company_id: chosenCompanyId });
                                                        const cl = await crmService.getContactsByCompany(chosenCompanyId);
                                                        const loaded: any[] = ((cl as any).results ?? cl) || [];
                                                        const merged = [...loaded];
                                                        (val as any[]).forEach((selId: any) => {
                                                            if (!merged.find((c: any) => c.id === selId || String(c.id) === String(selId))) {
                                                                const ex = contacts.find((c: any) => c.id === selId || String(c.id) === String(selId));
                                                                if (ex) merged.push(ex);
                                                            }
                                                        });
                                                        setContacts(merged);
                                                        const chosenCompanyName = chosen?.customer_name || chosen?.company_name;
                                                        if (chosenCompanyName) {
                                                            setCompanies((prev: any[]) => {
                                                                if (prev.find((c: any) => String(c.id) === String(chosenCompanyId))) return prev;
                                                                return [{ id: chosenCompanyId, name: chosenCompanyName }, ...prev];
                                                            });
                                                        }
                                                    }
                                                }
                                            }}
                                            filterOption={(input, option) => {
                                                const children = option?.children as unknown as string;
                                                if (!children || typeof children !== 'string') return false;

                                                // Ékezetek eltávolítása és kisbetűsítés
                                                const normalizeText = (text: string) => {
                                                    return text
                                                        .normalize('NFD')
                                                        .replace(/[\u0300-\u036f]/g, '')
                                                        .toLowerCase()
                                                        .replace(/[^a-z0-9\s]/g, '');
                                                };

                                                const normalizedInput = normalizeText(input);
                                                const normalizedChildren = normalizeText(children);

                                                return normalizedChildren.includes(normalizedInput);
                                            }}
                                        >
                                            {contacts.map(contact => (
                                                <Option key={contact.id} value={contact.id}>
                                                    {contact.name} - {contact.company_name || 'Magánszemély'}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col flex="40px">
                                    <Form.Item label=" ">
                                        <Button
                                            icon={<PlusOutlined />}
                                            onClick={() => {
                                                const companyId = form.getFieldValue('company_id');
                                                let url = '/crm/contacts?action=create';
                                                if (companyId && companyId !== 'private') {
                                                    url += `&company=${companyId}`;
                                                }
                                                window.open(url, '_blank');
                                            }}
                                            title="Új kapcsolattartó"
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Col>
                    </Row>

                    <Form.Item
                        name="project_manager"
                        label="Projektvezető"
                    >
                        <Select placeholder="Válasszon projektvezetőt" allowClear>
                            {employees.map(employee => (
                                <Option key={employee.id} value={employee.id}>
                                    {employee.full_name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Projekt adatai"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={800}
            >
                {viewingProject && (
                    <div>
                        <Row gutter={16}>
                            <Col span={12}>
                                <p><strong>ID:</strong> {viewingProject.id}</p>
                                <p><strong>Név:</strong> {viewingProject.name}</p>
                                <p><strong>Határidő:</strong> {dayjs(viewingProject.deadline).format('YYYY.MM.DD')}</p>
                                <p><strong>Állapot:</strong>
                                    <Tag color={viewingProject.status === 'open' ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                                        {viewingProject.status === 'open' ? 'Nyitott' : 'Zárt'}
                                    </Tag>
                                </p>
                            </Col>
                            <Col span={12}>
                                <p><strong>Projektvezető:</strong> {viewingProject.project_manager_name || '-'}</p>
                                <p><strong>Kapcsolattartók:</strong></p>
                                <div>
                                    {viewingProject.contact_names.map((name, index) => (
                                        <Tag key={index} color="blue" style={{ marginBottom: 2 }}>
                                            {name}
                                        </Tag>
                                    ))}
                                </div>
                            </Col>
                        </Row>
                        {viewingProject.description && (
                            <div style={{ marginTop: 16 }}>
                                <p><strong>Leírás:</strong></p>
                                <p>{viewingProject.description}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Projects;
