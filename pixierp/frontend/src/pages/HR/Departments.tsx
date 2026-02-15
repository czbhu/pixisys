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
    Popconfirm,
    Tooltip
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    UserOutlined,
    SearchOutlined,
    ExclamationCircleOutlined,
    MenuOutlined
} from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { hrService } from '../../services/hrService';
import { rolesService } from '../../services/rolesService';

const { Option } = Select;
const { TextArea } = Input;

interface Department {
    id: number;
    name: string;
    description?: string;
    email_domain?: string;
    sort_order?: number;
    managers?: number[];
    manager_names?: string[];
    roles?: number[];
    role_names?: string[];
    budget: number;
    created_at: string;
    updated_at: string;
    employee_count?: number;
    inactivity_timeout?: number;
}

interface Employee {
    id: number;
    user?: number;  // User ID az Employee objektumban
    full_name: string;
    employee_id: string;
    department_names?: string[];
    position_name?: string;
}

interface Role {
    id: number;
    name: string;
}

interface RowContextProps {
    setActivatorNodeRef?: (element: HTMLElement | null) => void;
    listeners?: any;
}

const RowContext = React.createContext<RowContextProps>({});

const DragHandle = () => {
    const { setActivatorNodeRef, listeners } = React.useContext(RowContext);
    return (
        <Button
            type="text"
            size="small"
            icon={<MenuOutlined style={{ cursor: 'grab', color: '#999' }} />}
            ref={setActivatorNodeRef}
            {...listeners}
        />
    );
};

const DraggableRow = ({ children, ...props }: any) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: props['data-row-key'] });

    const style: React.CSSProperties = {
        ...props.style,
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#e6f7ff' } : {}),
    };

    return (
        <RowContext.Provider value={{ setActivatorNodeRef, listeners }}>
            <tr {...props} ref={setNodeRef} style={style} {...attributes}>
                {children}
            </tr>
        </RowContext.Provider>
    );
};

const Departments: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [filtered, setFiltered] = useState<Department[]>([]);
    const [query, setQuery] = useState('');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [viewingDepartment, setViewingDepartment] = useState<Department | null>(null);
    const [departmentEmployees, setDepartmentEmployees] = useState<Employee[]>([]);
    const [savingOrder, setSavingOrder] = useState(false);
    const [form] = Form.useForm();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        loadData();
    }, []);

    // Keresési logika
    const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    useEffect(() => {
        const q = normalize(query);
        if (!q) { setFiltered(departments); return; }
        const next = departments.filter(dept => {
            const hay = [
                dept.name || '',
                dept.description || '',
                dept.email_domain || '',
                (dept.manager_names || []).join(' ') || ''
            ].join(' \u0001 ');
            return normalize(hay).includes(q);
        });
        setFiltered(next);
    }, [query, departments]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [departmentsResponse, employeesResponse, rolesResponse] = await Promise.all([
                hrService.getDepartments(),
                hrService.getEmployees(),
                rolesService.getRoles()
            ]);

            // Handle paginated response
            const departmentsData = departmentsResponse.results || departmentsResponse;
            const employeesData = employeesResponse.results || employeesResponse;
            // rolesService.getRoles() már Promise<Role[]> típust ad vissza
            const rolesData = rolesResponse;

            const deptList = Array.isArray(departmentsData) ? departmentsData : [];
            setDepartments(deptList);
            setFiltered(deptList);
            setEmployees(Array.isArray(employeesData) ? employeesData : []);
            setRoles(Array.isArray(rolesData) ? rolesData : []);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Hiba történt az adatok betöltése során');
        } finally {
            setLoading(false);
        }
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
                    form.resetFields();
                },
            });
        } else {
            setIsModalVisible(false);
            form.resetFields();
        }
    };

    const showCreateModal = () => {
        setEditingDepartment(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const showEditModal = (department: Department) => {
        setEditingDepartment(department);
        form.setFieldsValue({
            name: department.name,
            description: department.description || '',
            email_domain: department.email_domain || '',
            sort_order: department.sort_order !== undefined ? department.sort_order : 100,
            managers: department.managers || [],
            roles: department.roles || [],
            budget: department.budget !== undefined ? department.budget : 0,
            inactivity_timeout: department.inactivity_timeout !== undefined ? department.inactivity_timeout : 60
        });
        setIsModalVisible(true);
    };

    const showViewModal = async (department: Department) => {
        setViewingDepartment(department);

        // Betöltjük az osztály tagjait
        try {
            const departmentEmployees = employees.filter(emp =>
                emp.department_names && emp.department_names.includes(department.name)
            );
            setDepartmentEmployees(departmentEmployees);
        } catch (err) {
            console.error('Error loading department employees:', err);
            setDepartmentEmployees([]);
        }

        setIsViewModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingDepartment) {
                await hrService.updateDepartment(editingDepartment.id, values);
                message.success('Osztály sikeresen frissítve!');
            } else {
                await hrService.createDepartment(values);
                message.success('Osztály sikeresen létrehozva!');
            }
            setIsModalVisible(false);
            form.resetFields();
            loadData();
        } catch (err) {
            console.error('Error saving department:', err);
            message.error('Hiba történt az osztály mentése során');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await hrService.deleteDepartment(id);
            message.success('Osztály sikeresen törölve!');
            loadData();
        } catch (err) {
            console.error('Error deleting department:', err);
            message.error('Hiba történt az osztály törlése során');
        }
    };

    const persistSortOrder = async (orderedDepartments: Department[]) => {
        const updates = orderedDepartments.map((dept, index) => ({
            id: dept.id,
            sort_order: index + 1,
        }));

        setSavingOrder(true);
        try {
            await Promise.all(
                updates.map((item) => hrService.patchDepartment(item.id, { sort_order: item.sort_order }))
            );
            const remapped = orderedDepartments.map((dept, index) => ({
                ...dept,
                sort_order: index + 1,
            }));
            setDepartments(remapped);
            setFiltered(remapped);
            message.success('Sorrend mentve.');
        } catch (err) {
            console.error('Error saving order:', err);
            message.error('A sorrend mentése sikertelen.');
            loadData();
        } finally {
            setSavingOrder(false);
        }
    };

    const onDragEnd = (event: DragEndEvent) => {
        if (query.trim()) {
            message.warning('Drag rendezéshez töröld a keresést.');
            return;
        }

        const { active, over } = event;
        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = departments.findIndex((dept) => dept.id === active.id);
        const newIndex = departments.findIndex((dept) => dept.id === over.id);

        if (oldIndex < 0 || newIndex < 0) {
            return;
        }

        const newOrder = arrayMove(departments, oldIndex, newIndex);
        const remapped = newOrder.map((dept, index) => ({
            ...dept,
            sort_order: index + 1,
        }));
        setDepartments(remapped);
        setFiltered(remapped);
        persistSortOrder(newOrder);
    };

    const columns = [
        {
            title: '',
            key: 'drag',
            width: 48,
            render: () => <DragHandle />,
        },
        {
            title: 'Név',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: Department, b: Department) => a.name.localeCompare(b.name),
            width: 200,
        },
        {
            title: 'Sorrend',
            dataIndex: 'sort_order',
            key: 'sort_order',
            render: (value: number) => value ?? 100,
            sorter: (a: Department, b: Department) => (a.sort_order ?? 100) - (b.sort_order ?? 100),
            width: 90,
        },
        {
            title: 'Domain',
            dataIndex: 'email_domain',
            key: 'email_domain',
            render: (value: string) => value || '-',
            width: 180,
        },
        {
            title: 'Leírás',
            dataIndex: 'description',
            key: 'description',
            render: (description: string) => description ? (
                <span title={description}>
                    {description.length > 50 ? `${description.substring(0, 50)}...` : description}
                </span>
            ) : '-',
            width: 250,
        },
        {
            title: 'Vezető(k)',
            dataIndex: 'manager_names',
            key: 'manager_names',
            render: (managerNames: string[]) => managerNames && managerNames.length > 0 ? (
                <Space size={[0, 8]} wrap>
                    {managerNames.map((name, index) => (
                        <Tag key={index} color="blue" icon={<UserOutlined />}>
                            {name}
                        </Tag>
                    ))}
                </Space>
            ) : '-',
            width: 200,
        },
        {
            title: 'Szerepkörök',
            dataIndex: 'role_names',
            key: 'role_names',
            render: (roleNames: string[]) => roleNames && roleNames.length > 0 ? (
                <Space size={[0, 8]} wrap>
                    {roleNames.map((name, index) => (
                        <Tag key={index} color="purple">
                            {name}
                        </Tag>
                    ))}
                </Space>
            ) : '-',
            width: 200,
        },
        {
            title: 'Költségvetés',
            dataIndex: 'budget',
            key: 'budget',
            render: (budget: number) => budget ? `${budget.toLocaleString('hu-HU')} Ft` : '-',
            sorter: (a: Department, b: Department) => a.budget - b.budget,
            width: 120,
        },
        {
            title: 'Tagok száma',
            key: 'employee_count',
            render: (record: Department) => {
                const count = employees.filter(emp =>
                    emp.department_names && emp.department_names.includes(record.name)
                ).length;
                return <Tag color="green">{count} fő</Tag>;
            },
            sorter: (a: Department, b: Department) => {
                const countA = employees.filter(emp =>
                    emp.department_names && emp.department_names.includes(a.name)
                ).length;
                const countB = employees.filter(emp =>
                    emp.department_names && emp.department_names.includes(b.name)
                ).length;
                return countA - countB;
            },
            width: 100,
        },
        {
            title: 'Műveletek',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (record: Department) => (
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
                            onClick={() => showEditModal(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Biztosan törölni szeretné ezt az osztályt?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Igen"
                        cancelText="Nem"
                    >
                        <Tooltip title="Törlés">
                            <Button
                                icon={<DeleteOutlined />}
                                size="small"
                                danger
                            />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return <Spin size="large" style={{ display: 'block', margin: '50px auto' }} />;
    }

    return (
        <div>
            <Card
                title="Osztályok kezelése"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={showCreateModal}
                    >
                        Új osztály
                    </Button>
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

                <Input
                    placeholder="Keresés (név, domain, leírás, vezető)..."
                    prefix={<SearchOutlined />}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ marginBottom: 16 }}
                    allowClear
                />

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={filtered.map((dept) => dept.id)} strategy={verticalListSortingStrategy}>
                        <Table
                            columns={columns}
                            dataSource={filtered}
                            rowKey="id"
                            loading={savingOrder}
                            pagination={{
                                pageSize: 10,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '20', '50'],
                                showQuickJumper: true,
                                showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} osztály`,
                            }}
                            scroll={{ x: 1000 }}
                            size="small"
                            components={{
                                body: {
                                    row: DraggableRow,
                                },
                            }}
                            onRow={(record) => ({
                                onDoubleClick: () => showEditModal(record),
                                style: { cursor: 'pointer' }
                            })}
                        />
                    </SortableContext>
                </DndContext>
            </Card>

            {/* Létrehozás/Szerkesztés Modal */}
            <Modal
                title={editingDepartment ? 'Osztály szerkesztése' : 'Új osztály létrehozása'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item
                        name="name"
                        label="Osztály neve"
                        rules={[{ required: true, message: 'Kérjük, adja meg az osztály nevét!' }]}
                    >
                        <Input placeholder="Pl. IT osztály" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Leírás"
                    >
                        <TextArea
                            rows={3}
                            placeholder="Osztály leírása, feladatai..."
                        />
                    </Form.Item>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="email_domain"
                                label="E-mail domain"
                                tooltip="Pl.: pixisys.eu"
                            >
                                <Input placeholder="pl. pixisys.eu" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="sort_order"
                                label="Sorrend"
                                tooltip="Kisebb szám = magasabb prioritás"
                                initialValue={100}
                            >
                                <Input type="number" min={0} placeholder="100" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="managers"
                        label="Vezetők"
                    >
                        <Select
                            mode="multiple"
                            placeholder="Válasszon vezető(ke)t"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                            }
                        >
                            {employees.map((employee) => (
                                <Option key={employee.id} value={employee.user || employee.id}>
                                    {employee.full_name} ({employee.employee_id})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="roles"
                        label="Szerepkörök"
                    >
                        <Select
                            mode="multiple"
                            placeholder="Válasszon szerepkör(öke)t"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                            }
                        >
                            {roles.map((role) => (
                                <Option key={role.id} value={role.id}>
                                    {role.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="budget"
                        label="Költségvetés (Ft)"
                    >
                        <Input
                            type="number"
                            placeholder="0"
                            min={0}
                            step={1000}
                        />
                    </Form.Item>

                    <Form.Item
                        name="inactivity_timeout"
                        label="Inaktivitási időkorlát (perc)"
                        tooltip="Ennyi perc inaktivitás után kap figyelmeztetést a felhasználó, majd automatikusan kilépteti a rendszer. 0 = kikapcsolva."
                        initialValue={60}
                    >
                        <Input
                            type="number"
                            placeholder="60"
                            min={0}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={handleCancel}>
                                Mégse
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingDepartment ? 'Frissítés' : 'Létrehozás'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Osztály részletei"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={800}
            >
                {viewingDepartment && (
                    <div>
                        <Descriptions bordered column={1} style={{ marginBottom: 24 }}>
                            <Descriptions.Item label="Osztály neve">
                                {viewingDepartment.name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Leírás">
                                {viewingDepartment.description || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="E-mail domain">
                                {viewingDepartment.email_domain || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Sorrend">
                                {viewingDepartment.sort_order ?? 100}
                            </Descriptions.Item>
                            <Descriptions.Item label="Vezető(k)">
                                {viewingDepartment.manager_names && viewingDepartment.manager_names.length > 0 ? (
                                    <Space size={[0, 8]} wrap>
                                        {viewingDepartment.manager_names.map((name, index) => (
                                            <Tag key={index} color="blue" icon={<UserOutlined />}>
                                                {name}
                                            </Tag>
                                        ))}
                                    </Space>
                                ) : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Szerepkörök">
                                {viewingDepartment.role_names && viewingDepartment.role_names.length > 0 ? (
                                    <Space size={[0, 8]} wrap>
                                        {viewingDepartment.role_names.map((name, index) => (
                                            <Tag key={index} color="purple">
                                                {name}
                                            </Tag>
                                        ))}
                                    </Space>
                                ) : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Költségvetés">
                                {viewingDepartment.budget ? `${viewingDepartment.budget.toLocaleString('hu-HU')} Ft` : '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Létrehozva">
                                {new Date(viewingDepartment.created_at).toLocaleString('hu-HU')}
                            </Descriptions.Item>
                            <Descriptions.Item label="Módosítva">
                                {new Date(viewingDepartment.updated_at).toLocaleString('hu-HU')}
                            </Descriptions.Item>
                        </Descriptions>

                        <h4>Osztály tagjai ({departmentEmployees.length} fő)</h4>
                        {departmentEmployees.length > 0 ? (
                            <Table
                                dataSource={departmentEmployees}
                                columns={[
                                    {
                                        title: 'ID',
                                        dataIndex: 'employee_id',
                                        key: 'employee_id',
                                        width: 100,
                                    },
                                    {
                                        title: 'Név',
                                        dataIndex: 'full_name',
                                        key: 'full_name',
                                    },
                                    {
                                        title: 'Pozíció',
                                        dataIndex: 'position_name',
                                        key: 'position_name',
                                        render: (position: string) => position || '-',
                                    },
                                ]}
                                rowKey="id"
                                pagination={false}
                                size="small"
                            />
                        ) : (
                            <p style={{ color: '#999', fontStyle: 'italic' }}>
                                Nincsenek tagok ebben az osztályban.
                            </p>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Departments;