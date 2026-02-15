import React, { useState, useEffect, useRef } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    Select,
    Alert,
    message,
    Tag,
    Descriptions,
    Row,
    Col,
    Tooltip,
    Popconfirm
} from 'antd';
import {
    PlusOutlined,
    EyeOutlined,
    EditOutlined,
    DeleteOutlined,
    KeyOutlined,
    SaveOutlined,
    CloseOutlined,
    IdcardOutlined,
    SearchOutlined,
    SafetyOutlined,
    MailOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { hrService } from '../../services/hrService';
import { rolesService, Role } from '../../services/rolesService';
import { postalCodeService } from '../../services/postalCodeService';
import { getCountries } from '../../services/countryService';
import { useSettings } from '../../contexts/SettingsContext';
import HungarianDatePicker from '../../components/HungarianDatePicker';
import AccessCredentialsModal from '../../components/AccessCredentialsModal';

const { Option } = Select;
const { TextArea } = Input;

interface Employee {
    id: number;
    employee_id: string;
    full_name: string;
    department_names?: string[];
    position_name?: string;
    net_salary: number;
    gross_salary: number;
    net_hourly_rate?: number;
    overhead_hourly_rate?: number;
    daily_work_hours?: number;
    hire_date: string;
    is_active: boolean;
    permission_level: string;
    role_ids?: number[];
    // Személyes adatok
    tb_number?: string;
    tax_number?: string;
    birth_first_name?: string;
    birth_last_name?: string;
    birth_place?: string;
    birth_date?: string;
    gender?: string;
    mother_first_name?: string;
    mother_last_name?: string;
    // Lakcím
    address_country: string;
    address_postal_code?: string;
    address_city?: string;
    address_street_name?: string;
    address_street_type?: string;
    address_house_number?: string;
    address_generic?: string;
    // User adatok
    user_first_name: string;
    user_last_name: string;
    user_email: string;
    user_username: string;
    phone?: string;
    last_activity?: string;
    is_online?: boolean;
}

const Employees: React.FC = () => {
    const { settings, updateSettings, getTablePageSize, setTablePageSize } = useSettings();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [filtered, setFiltered] = useState<Employee[]>([]);
    const [query, setQuery] = useState('');
    const [departments, setDepartments] = useState<any[]>([]);
    const [positions, setPositions] = useState<any[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isViewModalVisible, setIsViewModalVisible] = useState(false);
    const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
    const [passwordEmployee, setPasswordEmployee] = useState<Employee | null>(null);
    const [credentialsEmployee, setCredentialsEmployee] = useState<Employee | null>(null);
    const [isCredentialsModalVisible, setIsCredentialsModalVisible] = useState(false);
    const [isPermissionsModalVisible, setIsPermissionsModalVisible] = useState(false);
    const [permissionsEmployee, setPermissionsEmployee] = useState<Employee | null>(null);
    const [deleteEmailPromptEmployee, setDeleteEmailPromptEmployee] = useState<Employee | null>(null);
    const [deleteEmailPromptVisible, setDeleteEmailPromptVisible] = useState(false);
    const [showInactive, setShowInactive] = useState(settings.showInactiveEmployees);
    const [form] = Form.useForm();
    const [formKey, setFormKey] = useState(0);
    const usernameInputRef = useRef<any>(null);
    const [generatingEmail, setGeneratingEmail] = useState(false);

    useEffect(() => {
        loadEmployees();
        loadDepartments();
        loadPositions();
        loadRoles();
    }, []);

    // Keresési logika
    const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    useEffect(() => {
        const q = normalize(query);
        if (!q) { setFiltered(employees); return; }
        const next = employees.filter(emp => {
            const hay = [
                emp.employee_id || '',
                emp.full_name || '',
                (emp.department_names || []).join(' '),
                emp.position_name || '',
                emp.user_email || '',
                emp.phone || ''
            ].join(' \u0001 ');
            return normalize(hay).includes(q);
        });
        setFiltered(next);
    }, [query, employees]);

    // Automatikus felhasználónév generálás új alkalmazott esetén
    const handleNameChange = () => {
        if (!editingEmployee && isModalVisible) {
            const firstName = form.getFieldValue('user_first_name');
            const lastName = form.getFieldValue('user_last_name');
            const currentUsername = form.getFieldValue('user_username');

            // Ha van keresztnév és vezetéknév, de nincs felhasználónév (üres vagy null)
            if (firstName && lastName && (!currentUsername || currentUsername.trim() === '')) {
                generateUsername();
            }
        }
    };

    useEffect(() => {
        loadEmployees();
    }, [showInactive]);

    // Modal megnyitásakor form értékek beállítása
    useEffect(() => {
        if (isModalVisible && editingEmployee) {
            console.log('Modal opened, setting form values for:', editingEmployee);
            const formData = {
                // Alapadatok
                employee_id: editingEmployee.employee_id,
                net_salary: editingEmployee.net_salary,
                gross_salary: editingEmployee.gross_salary,
                net_hourly_rate: editingEmployee.net_hourly_rate,
                overhead_hourly_rate: editingEmployee.overhead_hourly_rate,
                daily_work_hours: editingEmployee.daily_work_hours,
                hire_date: editingEmployee.hire_date ? dayjs(editingEmployee.hire_date) : null,
                is_active: editingEmployee.is_active,
                permission_level: editingEmployee.permission_level,
                departments: (editingEmployee.department_names || []).map((name: string) => {
                    const dept = departments.find(d => d.name === name);
                    return dept?.id;
                }).filter(Boolean),
                position: editingEmployee.position_name,

                // Személyes adatok
                tb_number: editingEmployee.tb_number,
                tax_number: editingEmployee.tax_number,
                birth_first_name: editingEmployee.birth_first_name || editingEmployee.user_first_name,
                birth_last_name: editingEmployee.birth_last_name || editingEmployee.user_last_name,
                birth_place: editingEmployee.birth_place,
                birth_date: editingEmployee.birth_date ? dayjs(editingEmployee.birth_date) : null,
                gender: editingEmployee.gender,
                mother_first_name: editingEmployee.mother_first_name,
                mother_last_name: editingEmployee.mother_last_name,

                // Lakcím
                address_country: editingEmployee.address_country || 'Magyarország',
                address_postal_code: editingEmployee.address_postal_code,
                address_city: editingEmployee.address_city,
                address_street_name: editingEmployee.address_street_name,
                address_street_type: editingEmployee.address_street_type,
                address_house_number: editingEmployee.address_house_number,
                address_generic: editingEmployee.address_generic,

                // User adatok
                user_first_name: editingEmployee.user_first_name,
                user_last_name: editingEmployee.user_last_name,
                user_email: editingEmployee.user_email,
                user_username: editingEmployee.user_username,
                phone: editingEmployee.phone,
            };
            
            console.log('Setting form values in useEffect:', formData);
            form.setFieldsValue(formData);
            
            // Ellenőrizzük, hogy beállították-e az értékeket
            setTimeout(() => {
                console.log('Form values after useEffect setting:', form.getFieldsValue());
                console.log('Username field value after useEffect:', form.getFieldValue('user_username'));
            }, 100);
        }
    }, [isModalVisible, editingEmployee, form]);

    // Külön useEffect a felhasználónév mező frissítéséhez
    useEffect(() => {
        if (editingEmployee && isModalVisible) {
            console.log('Username useEffect triggered:', editingEmployee.user_username);
            // Kényszerítsük a mező frissítését
            setTimeout(() => {
                form.setFieldsValue({ user_username: editingEmployee.user_username });
                console.log('Username set via setTimeout:', editingEmployee.user_username);
            }, 100);
        }
    }, [editingEmployee?.user_username, isModalVisible, form]);


    const loadEmployees = async () => {
        try {
            setLoading(true);
            const response = await hrService.getEmployees();
            let employees = response.results || response;
            employees = Array.isArray(employees) ? employees : [];

            // Ha nem mutatjuk az inaktívakat, akkor szűrjük ki őket
            if (!showInactive) {
                employees = employees.filter((emp: Employee) => emp.is_active);
            }

            setEmployees(employees);
            setFiltered(employees);
            setError(null);
        } catch (err) {
            console.error('Error loading employees:', err);
            const is403 = (err as any)?.response?.status === 403;
            if (is403) {
                message.error('Nincs jogosultság az alkalmazottak szerkesztéséhez, csak saját adatok láthatók.');
                setError('Nincs jogosultság az alkalmazottak szerkesztéséhez.');
                setEmployees([]);
                setFiltered([]);
            } else {
                setError('Hiba történt az alkalmazottak betöltése során');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await hrService.getDepartments();
            setDepartments(response.results || response);
        } catch (err) {
            console.error('Error loading departments:', err);
        }
    };

    const loadPositions = async () => {
        try {
            const response = await hrService.getPositions();
            setPositions(response.results || response);
        } catch (err) {
            console.error('Error loading positions:', err);
        }
    };

    const loadRoles = async () => {
        try {
            const data = await rolesService.getRoles();
            setRoles(data);
        } catch (err) {
            console.error('Error loading roles:', err);
        }
    };

    const handleGenerateEmail = async () => {
        const firstName = (form.getFieldValue('user_first_name') || '').trim();
        const lastName = (form.getFieldValue('user_last_name') || '').trim();
        const departmentIds = form.getFieldValue('departments');

        if (!firstName || !lastName) {
            message.warning('Előbb adja meg a keresztnevet és vezetéknevet.');
            return;
        }

        try {
            setGeneratingEmail(true);
            const response = await hrService.generateEmployeeEmailAccount({
                first_name: firstName,
                last_name: lastName,
                department_ids: Array.isArray(departmentIds) ? departmentIds : [],
                create_account: true,
            });

            if (response?.email) {
                form.setFieldsValue({ user_email: response.email });
            }

            if (response?.account_created && response?.mailbox_password) {
                Modal.success({
                    title: 'E-mail fiók létrehozva',
                    content: (
                        <div>
                            <p><strong>E-mail:</strong> {response.email}</p>
                            <p><strong>Postafiók jelszó:</strong> {response.mailbox_password}</p>
                            <p style={{ marginTop: 8 }}>Mentse el ezt a jelszót, később nem lesz újra lekérhető.</p>
                        </div>
                    ),
                });
            } else {
                message.success(response?.message || 'E-mail cím generálva.');
            }
        } catch (error: any) {
            message.error(error?.response?.data?.error || 'Nem sikerült e-mail fiókot generálni.');
        } finally {
            setGeneratingEmail(false);
        }
    };

    const handlePostalCodeChange = (postalCode: string) => {
        const city = postalCodeService.getCityByPostalCode(postalCode);
        if (city) {
            form.setFieldsValue({ address_city: city });
        }
    };

    const showModal = (employee?: Employee) => {
        if (employee) {
            console.log('Loading employee data:', employee);
            console.log('Username:', employee.user_username);
            console.log('Is active:', employee.is_active);
            setEditingEmployee(employee);
            
            // Form key frissítése a re-render kényszerítéséhez
            setFormKey(prev => prev + 1);
            
            // Először reseteljük a formot
            form.resetFields();
            
            // Több módszerrel próbáljuk meg beállítani az értékeket
            const setFormValues = () => {
                const formData = {
                    // Alapadatok
                    employee_id: employee.employee_id,
                    net_salary: employee.net_salary,
                    gross_salary: employee.gross_salary,
                    net_hourly_rate: employee.net_hourly_rate,
                    overhead_hourly_rate: employee.overhead_hourly_rate,
                    daily_work_hours: employee.daily_work_hours,
                    hire_date: employee.hire_date ? dayjs(employee.hire_date) : null,
                    is_active: employee.is_active,
                    permission_level: employee.permission_level,
                    departments: (employee.department_names || []).map((name: string) => {
                        const dept = departments.find(d => d.name === name);
                        return dept?.id;
                    }).filter(Boolean),
                    position: employee.position_name,
                    
                    // Szerepkörök
                    role_ids: employee.role_ids || [],

                    // Személyes adatok
                    tb_number: employee.tb_number,
                    tax_number: employee.tax_number,
                    birth_first_name: employee.birth_first_name || employee.user_first_name,
                    birth_last_name: employee.birth_last_name || employee.user_last_name,
                    birth_place: employee.birth_place,
                    birth_date: employee.birth_date ? dayjs(employee.birth_date) : null,
                    gender: employee.gender,
                    mother_first_name: employee.mother_first_name,
                    mother_last_name: employee.mother_last_name,

                    // Lakcím
                    address_country: employee.address_country || 'Magyarország',
                    address_postal_code: employee.address_postal_code,
                    address_city: employee.address_city,
                    address_street_name: employee.address_street_name,
                    address_street_type: employee.address_street_type,
                    address_house_number: employee.address_house_number,
                    address_generic: employee.address_generic,

                    // User adatok
                    user_first_name: employee.user_first_name,
                    user_last_name: employee.user_last_name,
                    user_email: employee.user_email,
                    user_username: employee.user_username,
                    phone: employee.phone,
                };
                
                console.log('Setting form values:', formData);
                form.setFieldsValue(formData);
                
                // Ellenőrizzük, hogy beállították-e az értékeket
                setTimeout(() => {
                    console.log('Form values after setting:', form.getFieldsValue());
                    console.log('Username field value:', form.getFieldValue('user_username'));
                }, 200);
            };
            
            // Azonnal próbáljuk meg
            setFormValues();
            
            // Kis késleltetéssel is
            setTimeout(setFormValues, 100);
            setTimeout(setFormValues, 300);
            setTimeout(setFormValues, 500);
        } else {
            setEditingEmployee(null);
            setFormKey(prev => prev + 1);
            form.resetFields();
            form.setFieldsValue({
                address_country: 'Magyarország',
                permission_level: 'basic',
                is_active: true
            });
        }
        setIsModalVisible(true);
    };

    const showViewModal = (employee: Employee) => {
        setViewingEmployee(employee);
        setIsViewModalVisible(true);
    };

    const showPasswordModal = (employee: Employee) => {
        setPasswordEmployee(employee);
        setIsPasswordModalVisible(true);
    };

    const showCredentialsModal = (employee: Employee) => {
        setCredentialsEmployee(employee);
        setIsCredentialsModalVisible(true);
    };

    const showPermissionsModal = (employee: Employee) => {
        setPermissionsEmployee(employee);
        setIsPermissionsModalVisible(true);
    };

    const generateUsername = (force = false) => {
        const firstName = form.getFieldValue('user_first_name') || '';
        const lastName = form.getFieldValue('user_last_name') || '';
        const currentUsername = form.getFieldValue('user_username') || '';

        if (!firstName || !lastName) {
            message.warning('Kérjük, adja meg a keresztnevet és vezetéknevet először!');
            return;
        }

        // Ha nem kényszerített generálás és van már felhasználónév, ne írjuk felül
        if (!force && currentUsername && currentUsername.trim() !== '') {
            message.info('A felhasználónév mező már ki van töltve. Ha újra szeretné generálni, használja a "Generálás" gombot.');
            return;
        }

        // Alap felhasználónév: keresztnev.vezeteknev (ékezetek nélkül)
        const removeAccents = (str: string) => {
            return str
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Eltávolítja az összes diakritikus jelet
                .replace(/[^a-z0-9.]/g, ''); // Csak betűk, számok és pont maradjon
        };

        const baseUsername = `${removeAccents(firstName)}.${removeAccents(lastName)}`;

        // Ellenőrizzük, hogy van-e már ilyen felhasználónév
        const existingUsernames = employees.map(emp => emp.user_username);
        let username = baseUsername;
        let counter = 2;

        while (existingUsernames.includes(username)) {
            username = `${baseUsername}${counter}`;
            counter++;
        }

        // Próbáljuk meg több módon is beállítani a mezőt
        console.log('Setting username to:', username);
        
        // 1. Standard módszer
        form.setFieldsValue({ user_username: username });
        
        // 2. Alternatív módszer - közvetlenül a DOM elemre
        const usernameInput = document.querySelector('input[name="user_username"]') as HTMLInputElement;
        if (usernameInput) {
            usernameInput.value = username;
            // Trigger change event
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // 3. Ref módszer
        if (usernameInputRef.current) {
            usernameInputRef.current.input.value = username;
            usernameInputRef.current.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // 4. Kis késleltetéssel is próbáljuk meg
        setTimeout(() => {
            form.setFieldsValue({ user_username: username });
            if (usernameInput) {
                usernameInput.value = username;
                usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (usernameInputRef.current) {
                usernameInputRef.current.input.value = username;
                usernameInputRef.current.input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, 100);
        
        message.success(`Felhasználónév generálva: ${username}`);
    };

    const handleSubmit = async (values: any) => {
        try {
            const employeeData = {
                ...values,
            };

            // Csak akkor adjuk hozzá a dátum mezőket, ha vannak értékek
            if (values.hire_date) {
                employeeData.hire_date = values.hire_date.format('YYYY-MM-DD');
            }
            if (values.birth_date) {
                employeeData.birth_date = values.birth_date.format('YYYY-MM-DD');
            }

            // Position már ID formátumban jön a Select-ből
            // Nem kell átalakítás

            // Departments mező kezelése - már ID formátumban jön a Select-ből
            if (values.departments && Array.isArray(values.departments)) {
                employeeData.departments = values.departments;
                console.log('Departments to save:', values.departments);
            } else {
                employeeData.departments = [];
                console.log('No departments selected or not an array:', values.departments);
            }

            // Szerepkörök hozzáadása az employeeData-hoz
            if (values.role_ids && Array.isArray(values.role_ids)) {
                employeeData.role_ids = values.role_ids;
                console.log('Roles to save:', values.role_ids);
            } else {
                employeeData.role_ids = [];
                console.log('No roles selected or not an array:', values.role_ids);
            }

            console.log('Employee data to save:', employeeData);

            let savedEmployee: any;
            if (editingEmployee) {
                savedEmployee = await hrService.updateEmployee(editingEmployee.id, employeeData);
                message.success('Alkalmazott sikeresen frissítve!');
            } else {
                savedEmployee = await hrService.createEmployee(employeeData);
                message.success('Alkalmazott sikeresen létrehozva!');
            }

            setIsModalVisible(false);
            form.resetFields();
            loadEmployees();
        } catch (err) {
            console.error('Error saving employee:', err);
            const status = (err as any)?.response?.status;
            const detail = (err as any)?.response?.data?.detail;
            if (status === 403) {
                message.error(detail || 'Nincs jogosultság a módosításhoz.');
            } else {
                message.error('Hiba történt az alkalmazott mentése során');
            }
        }
    };

    const handleDelete = async (id: number, deleteMailbox: boolean = false) => {
        try {
            await hrService.deleteEmployee(id, deleteMailbox);
            if (deleteMailbox) {
                message.success('Alkalmazott és e-mail fiók sikeresen törölve!');
            } else {
                message.success('Alkalmazott sikeresen törölve!');
            }
            loadEmployees();
        } catch (err: any) {
            console.error('Error deleting employee:', err);
            const backendError = err?.response?.data?.error;
            const backendHint = err?.response?.data?.hint;
            if (backendHint) {
                Modal.error({
                    title: 'Törlés sikertelen',
                    content: (
                        <div>
                            <p>{backendError || 'Hiba történt az alkalmazott törlése során'}</p>
                            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{backendHint}</pre>
                        </div>
                    ),
                    width: 760,
                });
                return;
            }
            message.error(backendError || 'Hiba történt az alkalmazott törlése során');
        }
    };

    const confirmDeleteEmployee = (record: Employee) => {
        if (record.user_email && record.user_email.includes('@')) {
            setDeleteEmailPromptEmployee(record);
            setDeleteEmailPromptVisible(true);
            return;
        }

        handleDelete(record.id, false);
    };

    const closeDeleteEmailPrompt = () => {
        setDeleteEmailPromptVisible(false);
        setDeleteEmailPromptEmployee(null);
    };

    const handleDeleteEmployeeOnly = async () => {
        if (!deleteEmailPromptEmployee) return;
        const targetId = deleteEmailPromptEmployee.id;
        closeDeleteEmailPrompt();
        await handleDelete(targetId, false);
    };

    const handleDeleteEmployeeAndMailbox = async () => {
        if (!deleteEmailPromptEmployee) return;
        const targetId = deleteEmailPromptEmployee.id;
        closeDeleteEmailPrompt();
        await handleDelete(targetId, true);
    };

    const handleGeneratePassword = async () => {
        if (!passwordEmployee) return;

        try {
            await hrService.generatePassword(passwordEmployee.id);
            message.success('Jelszó generálva és e-mailben elküldve!');
            setIsPasswordModalVisible(false);
            const empToEdit = passwordEmployee;
            setPasswordEmployee(null);
            if (empToEdit) {
                showModal(empToEdit);
            }
        } catch (err) {
            console.error('Error generating password:', err);
            message.error('Hiba történt a jelszó generálása során');
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

    const columns: any = [
        {
            title: 'Név / Pozíció',
            key: 'name_pos',
            fixed: 'left',
            width: 200,
            render: (_: any, r: Employee) => (
                <Space direction="vertical" size={0}>
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.full_name}
                      <Tooltip title={r.is_online ? "Elérhető" : "Nem elérhető"}>
                        <div style={{ 
                            width: 8, 
                            height: 8, 
                            borderRadius: '50%', 
                            backgroundColor: r.is_online ? '#52c41a' : '#ff4d4f',
                            boxShadow: r.is_online ? '0 0 4px #52c41a' : 'none'
                        }} />
                      </Tooltip>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{r.position_name || '-'}</div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{r.employee_id}</div>
                </Space>
            )
        },
        {
            title: 'Osztályok',
            dataIndex: 'department_names',
            key: 'department_names',
            width: 200,
            responsive: ['md'],
            render: (departmentNames: string[]) => {
                if (!departmentNames || departmentNames.length === 0) {
                    return '-';
                }
                return (
                    <div>
                        {departmentNames.map((name, index) => (
                            <Tag key={index} color="blue" style={{ marginBottom: 2 }}>
                                {name}
                            </Tag>
                        ))}
                    </div>
                );
            },
        },
        {
            title: 'Belépett',
            dataIndex: 'last_activity',
            key: 'last_activity',
            width: 140,
            responsive: ['lg'],
            render: (value: string | undefined) => value ? dayjs(value).format('YYYY.MM.DD HH:mm') : '-',
        },
        {
            title: '',
            key: 'actions',
            width: 120,
            fixed: 'right',
            render: (record: Employee) => (
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
                            title="Biztosan törölni szeretné ezt az alkalmazottat?"
                            onConfirm={() => confirmDeleteEmployee(record)}
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

    const renderAddressFields = (country?: string) => {
        if (country === 'Magyarország') {
            return (
                <>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="address_postal_code"
                                label="Irányítószám"
                            >
                                <Input
                                    placeholder="Irányítószám"
                                    onChange={(e) => handlePostalCodeChange(e.target.value)}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="address_city"
                                label="Város"
                            >
                                <Input placeholder="Város" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="address_street_type"
                                label="Közterület típusa"
                            >
                                <Select
                                    placeholder="Közterület típusa"
                                    showSearch
                                    optionFilterProp="children"
                                    filterOption={(input, option) =>
                                        (option?.children as unknown as string)
                                            .toLowerCase()
                                            .includes(input.toLowerCase())
                                    }
                                >
                                    {postalCodeService.getStreetTypes().map(type => (
                                        <Option key={type.value} value={type.value}>
                                            {type.label}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="address_street_name"
                                label="Közterület neve"
                            >
                                <Input placeholder="Közterület neve" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="address_house_number"
                                label="Házszám"
                            >
                                <Input placeholder="Házszám" />
                            </Form.Item>
                        </Col>
                    </Row>
                </>
            );
        } else {
            return (
                <Form.Item
                    name="address_generic"
                    label="Cím"
                >
                    <TextArea rows={3} placeholder="Teljes cím" />
                </Form.Item>
            );
        }
    };

    return (
        <div>
            <Card
                title="Alkalmazottak"
                extra={
                    <Space>
                        <span>Inaktívak megjelenítése:</span>
                        <Button
                            type={showInactive ? "primary" : "default"}
                            size="small"
                            onClick={() => {
                                const newShowInactive = !showInactive;
                                setShowInactive(newShowInactive);
                                updateSettings({ showInactiveEmployees: newShowInactive });
                            }}
                        >
                            {showInactive ? "Elrejtés" : "Megjelenítés"}
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => showModal()}
                        >
                            Új alkalmazott
                        </Button>
                    </Space>
                }
            >
                {error && <Alert message={error} type="error" style={{ marginBottom: 16 }} />}

                <Input
                    placeholder="Keresés (név, azonosító, osztály, pozíció, email, telefon)..."
                    prefix={<SearchOutlined />}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ marginBottom: 16 }}
                    allowClear
                />

                <Table
                    columns={columns}
                    dataSource={filtered}
                    pagination={{
                        pageSize: getTablePageSize('employees'),
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showQuickJumper: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} alkalmazott`,
                        onShowSizeChange: (current, size) => setTablePageSize('employees', size)
                    }}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    size="small"
                    loading={loading}
                    onRow={(record) => ({
                        onDoubleClick: () => showModal(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            </Card>

            {/* Alkalmazott Modal */}
            <Modal
                title={editingEmployee ? 'Alkalmazott szerkesztése' : 'Új alkalmazott'}
                open={isModalVisible}
                onCancel={handleCancel}
                width={800}
                footer={[
                    <div key="footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <Space>
                            {editingEmployee && (
                                <>
                                    <Button
                                        icon={<SafetyOutlined />}
                                        onClick={() => {
                                            setIsModalVisible(false);
                                            showPermissionsModal(editingEmployee);
                                        }}
                                    >
                                        Jogosultságok
                                    </Button>
                                    <Button
                                        icon={<IdcardOutlined />}
                                        onClick={() => {
                                            setIsModalVisible(false);
                                            showCredentialsModal(editingEmployee);
                                        }}
                                    >
                                        Azonosítók
                                    </Button>
                                    <Button
                                        icon={<KeyOutlined />}
                                        onClick={() => {
                                            setIsModalVisible(false);
                                            showPasswordModal(editingEmployee);
                                        }}
                                    >
                                        Jelszó generálás
                                    </Button>
                                </>
                            )}
                        </Space>
                        <Space>
                            <Button
                                icon={<CloseOutlined />}
                                onClick={() => {
                                    setIsModalVisible(false);
                                    form.resetFields();
                                }}
                            >
                                Bezárás
                            </Button>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={() => form.submit()}
                            >
                                Mentés
                            </Button>
                        </Space>
                    </div>
                ]}
            >
                <Form
                    key={formKey}
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="user_first_name"
                                label="Keresztnév"
                                rules={[{ required: true, message: 'Kérjük, adja meg a keresztnevet!' }]}
                            >
                                <Input placeholder="Keresztnév" onChange={handleNameChange} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="user_last_name"
                                label="Vezetéknév"
                                rules={[{ required: true, message: 'Kérjük, adja meg a vezetéknevet!' }]}
                            >
                                <Input placeholder="Vezetéknév" onChange={handleNameChange} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="user_email"
                                label="E-mail"
                                rules={[
                                    { type: 'email', message: 'Kérjük, adjon meg érvényes e-mail címet!' }
                                ]}
                            >
                                <Input
                                    placeholder="E-mail"
                                    addonAfter={
                                        <Button
                                            type="text"
                                            loading={generatingEmail}
                                            onClick={handleGenerateEmail}
                                            title="E-mail generálása"
                                            icon={<MailOutlined />}
                                        />
                                    }
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="user_username"
                                label="Felhasználónév"
                                tooltip="Alapértelmezetten automatikusan generálódik a név alapján"
                            >
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                        ref={usernameInputRef}
                                        style={{ width: 'calc(100% - 80px)' }}
                                        placeholder="Keresztnev.vezeteknev"
                                        value={editingEmployee?.user_username || ''}
                                        onChange={(e) => {
                                            form.setFieldsValue({ user_username: e.target.value });
                                        }}
                                        onBlur={() => {
                                            // Ha a mező üres lett, automatikusan generáljunk
                                            const currentUsername = form.getFieldValue('user_username');
                                            if (!currentUsername || currentUsername.trim() === '') {
                                                generateUsername();
                                            }
                                        }}
                                    />
                                    <Button
                                        type="default"
                                        style={{ width: '80px' }}
                                        onClick={() => generateUsername(true)}
                                        title="Felhasználónév generálása a név alapján"
                                    >
                                        Generálás
                                    </Button>
                                </Space.Compact>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="phone"
                                label="Telefonszám"
                            >
                                <Input placeholder="+36 30 123 4567" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="employee_id"
                                label="Alkalmazott ID"
                                tooltip="Automatikusan generálódik"
                            >
                                <Input placeholder="Automatikusan generálódik" disabled />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="departments"
                                label="Osztályok"
                            >
                                <Select
                                    mode="multiple"
                                    placeholder="Válasszon osztályokat"
                                    allowClear
                                    onFocus={async () => {
                                        // Frissítjük az osztályok listáját amikor rákattintanak
                                        await loadDepartments();
                                    }}
                                >
                                    {departments.map(dept => (
                                        <Option key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="position"
                                label="Pozíció"
                            >
                                <Select 
                                    placeholder="Válasszon pozíciót"
                                    showSearch
                                    filterOption={(input, option) =>
                                        (option?.children as unknown as string)?.toLowerCase().indexOf(input.toLowerCase()) >= 0
                                    }
                                    onFocus={async () => {
                                        // Frissítjük a pozíciók listáját amikor rákattintanak
                                        await loadPositions();
                                    }}
                                >
                                    {positions.map(pos => (
                                        <Option key={pos.id} value={pos.id}>
                                            {pos.title}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Bejelentési adatok */}
                    <h4>Bejelentési adatok</h4>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="tb_number"
                                label="TB szám"
                            >
                                <Input placeholder="TB szám" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="tax_number"
                                label="Adószám"
                            >
                                <Input placeholder="Adószám" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Születési adatok */}
                    <h4>Születési adatok</h4>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="birth_first_name"
                                label="Születési keresztnév"
                            >
                                <Input placeholder="Születési keresztnév" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="birth_last_name"
                                label="Születési vezetéknév"
                            >
                                <Input placeholder="Születési vezetéknév" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="gender"
                                label="Nem"
                            >
                                <Select placeholder="Válasszon nemet">
                                    <Option value="male">Férfi</Option>
                                    <Option value="female">Nő</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="birth_place"
                                label="Születés helye"
                            >
                                <Input placeholder="Születés helye" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="birth_date"
                                label="Születés ideje"
                            >
                                <HungarianDatePicker
                                    style={{ width: '100%' }}
                                    placeholder="Pl. 1980.12.31 vagy 19801231"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Anyja neve */}
                    <h4>Anyja neve</h4>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="mother_first_name"
                                label="Anyja keresztneve"
                            >
                                <Input placeholder="Anyja keresztneve" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="mother_last_name"
                                label="Anyja vezetékneve"
                            >
                                <Input placeholder="Anyja vezetékneve" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Fizetés */}
                    <h4>Fizetés</h4>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="gross_salary"
                                label="Bruttó fizetés (Ft)"
                            >
                                <Input type="number" placeholder="Bruttó fizetés" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="net_salary"
                                label="Nettó fizetés (Ft)"
                            >
                                <Input 
                                    type="number" 
                                    placeholder="Nettó fizetés"
                                    onChange={(e) => {
                                        const netSalary = parseFloat(e.target.value) || 0;
                                        const dailyHours = form.getFieldValue('daily_work_hours') || 8;
                                        const netHourlyRate = netSalary / (dailyHours * 22);
                                        form.setFieldsValue({ net_hourly_rate: netHourlyRate > 0 ? netHourlyRate.toFixed(2) : 0 });
                                    }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="net_hourly_rate"
                                label="Nettó órabér (Ft)"
                                tooltip="Automatikusan számítva: Nettó fizetés / (Napi munkaóra × 22 nap). Felülírható."
                            >
                                <Input type="number" placeholder="Automatikusan számított" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="overhead_hourly_rate"
                                label="Rezsi órabér (Ft)"
                            >
                                <Input type="number" placeholder="Rezsi órabér" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="daily_work_hours"
                                label="Napi munkaóra"
                            >
                                <Input 
                                    type="number" 
                                    step="0.25" 
                                    placeholder="8"
                                    onChange={(e) => {
                                        const dailyHours = parseFloat(e.target.value) || 8;
                                        const netSalary = form.getFieldValue('net_salary') || 0;
                                        const netHourlyRate = netSalary / (dailyHours * 22);
                                        form.setFieldsValue({ net_hourly_rate: netHourlyRate > 0 ? netHourlyRate.toFixed(2) : 0 });
                                    }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Lakcím */}
                    <h4>Lakcím</h4>
                    <Form.Item
                        name="address_country"
                        label="Ország"
                    >
                        <Select
                            placeholder="Válasszon országot"
                            showSearch
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.children as unknown as string)
                                    .toLowerCase()
                                    .includes(input.toLowerCase())
                            }
                        >
                            {getCountries().map((country: any) => (
                                <Option key={country.value} value={country.value}>
                                    {country.label}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.address_country !== currentValues.address_country}>
                        {({ getFieldValue }) => renderAddressFields(getFieldValue('address_country'))}
                    </Form.Item>

                    {/* Egyéb adatok */}
                    <h4>Egyéb adatok</h4>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="hire_date"
                                label="Felvétel dátuma"
                            >
                                <HungarianDatePicker
                                    style={{ width: '100%' }}
                                    placeholder="Pl. 2024.01.15 vagy 20240115"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="is_active"
                                label="Státusz"
                            >
                                <Select placeholder="Státusz">
                                    <Option value={true}>Aktív</Option>
                                    <Option value={false}>Inaktív</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* Megtekintés Modal */}
            <Modal
                title="Alkalmazott adatai"
                open={isViewModalVisible}
                onCancel={() => setIsViewModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setIsViewModalVisible(false)}>
                        Bezárás
                    </Button>
                ]}
                width={800}
            >
                {viewingEmployee && (
                    <Descriptions bordered column={2}>
                        <Descriptions.Item label="Név" span={2}>
                            {viewingEmployee.full_name}
                        </Descriptions.Item>
                        <Descriptions.Item label="Alkalmazott ID">
                            {viewingEmployee.employee_id}
                        </Descriptions.Item>
                        <Descriptions.Item label="E-mail">
                            {viewingEmployee.user_email}
                        </Descriptions.Item>
                        <Descriptions.Item label="Felhasználónév">
                            {viewingEmployee.user_username}
                        </Descriptions.Item>
                        <Descriptions.Item label="Osztályok">
                            {viewingEmployee.department_names && viewingEmployee.department_names.length > 0 ? (
                                <div>
                                    {viewingEmployee.department_names.map((name, index) => (
                                        <Tag key={index} color="blue" style={{ marginBottom: 2 }}>
                                            {name}
                                        </Tag>
                                    ))}
                                </div>
                            ) : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Pozíció">
                            {viewingEmployee.position_name || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Nettó fizetés">
                            {viewingEmployee.net_salary ? `${viewingEmployee.net_salary.toLocaleString('hu-HU')} Ft` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Bruttó fizetés">
                            {viewingEmployee.gross_salary ? `${viewingEmployee.gross_salary.toLocaleString('hu-HU')} Ft` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Nettó órabér">
                            {viewingEmployee.net_hourly_rate ? `${viewingEmployee.net_hourly_rate.toLocaleString('hu-HU')} Ft/óra` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Rezsi órabér">
                            {viewingEmployee.overhead_hourly_rate ? `${viewingEmployee.overhead_hourly_rate.toLocaleString('hu-HU')} Ft/óra` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Napi munkaóra">
                            {viewingEmployee.daily_work_hours ? `${viewingEmployee.daily_work_hours} óra` : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Jogosultság">
                            {viewingEmployee.permission_level}
                        </Descriptions.Item>
                        <Descriptions.Item label="Státusz">
                            <Tag color={viewingEmployee.is_active ? 'green' : 'red'}>
                                {viewingEmployee.is_active ? 'Aktív' : 'Inaktív'}
                            </Tag>
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>

            {/* Jelszó generálás Modal */}
            <Modal
                title="E-mail fiók törlése is?"
                open={deleteEmailPromptVisible}
                onCancel={closeDeleteEmailPrompt}
                footer={[
                    <Button key="cancel" onClick={closeDeleteEmailPrompt}>
                        Mégse
                    </Button>,
                    <Tooltip key="no-tooltip" title="alkalmazott törlése e-mail fiók törlés nélkül.">
                        <Button key="no" onClick={handleDeleteEmployeeOnly}>
                            Nem
                        </Button>
                    </Tooltip>,
                    <Button key="yes" type="primary" danger onClick={handleDeleteEmployeeAndMailbox}>
                        Igen
                    </Button>,
                ]}
            >
                <p>Az alkalmazott törlése mellett töröljük a Hestia e-mail fiókot és annak tartalmát is?</p>
                <p><strong>{deleteEmailPromptEmployee?.user_email}</strong></p>
            </Modal>

            {/* Jelszó generálás Modal */}
            <Modal
                title="Jelszó generálás"
                open={isPasswordModalVisible}
                onCancel={() => {
                    setIsPasswordModalVisible(false);
                    const empToEdit = passwordEmployee;
                    setPasswordEmployee(null);
                    if (empToEdit) {
                        showModal(empToEdit);
                    }
                }}
                onOk={handleGeneratePassword}
                okText="Generálás"
                cancelText="Mégse"
            >
                <p>Biztosan új jelszót generáljak a(z) <strong>{passwordEmployee?.full_name}</strong> alkalmazottnak?</p>
                <p>A jelszó e-mailben lesz elküldve a következő címre: <strong>{passwordEmployee?.user_email}</strong></p>
            </Modal>

            {/* Azonosítók Modal */}
            <AccessCredentialsModal
                visible={isCredentialsModalVisible}
                onClose={() => {
                    setIsCredentialsModalVisible(false);
                    const empToEdit = credentialsEmployee;
                    setCredentialsEmployee(null);
                    if (empToEdit) {
                        showModal(empToEdit);
                    }
                }}
                employee={credentialsEmployee}
            />

            {/* Jogosultságok Modal */}
            <Modal
                title="Egyéni jogosultságok"
                open={isPermissionsModalVisible}
                onCancel={() => {
                    setIsPermissionsModalVisible(false);
                    const empToEdit = permissionsEmployee;
                    setPermissionsEmployee(null);
                    if (empToEdit) {
                        showModal(empToEdit);
                    }
                }}
                footer={null}
                width={800}
            >
                {permissionsEmployee && (
                    <div>
                        <p><strong>Alkalmazott:</strong> {permissionsEmployee.user_first_name} {permissionsEmployee.user_last_name}</p>
                        <p>Az egyéni jogosultságok kezelése hamarosan elérhető lesz.</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Employees;