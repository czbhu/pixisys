import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Space,
    Button,
    Select,
    DatePicker,
    message,
    Statistic,
    Row,
    Col,
    Tag,
    Input,
    Modal,
    Form,
    TimePicker,
} from 'antd';
import {
    CalendarOutlined,
    UserOutlined,
    ClockCircleOutlined,
    EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/hu';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import ClockPicker from '../../components/ClockPicker';
import api from '../../services/api';

dayjs.locale('hu');
dayjs.extend(customParseFormat);

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TextArea } = Input;

interface AttendanceRecord {
    id: number | null;
    employee_id: number;
    employee_name: string;
    date: string;
    check_in: string | null;
    check_out: string | null;
    hours_worked: number;
    notes: string;
    is_editable: boolean;
}

interface Employee {
    id: number;
    user_first_name: string;
    user_last_name: string;
    full_name: string;
    employee_id: string;
}

interface AttendanceSummary {
    total_days_worked: number;
    total_hours: number;
    start_date: string;
    end_date: string;
}

const AttendanceReport: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const [monthFilter, setMonthFilter] = useState<string>('current');
    const [summary, setSummary] = useState<AttendanceSummary | null>(null);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
    const [form] = Form.useForm();
    const [editingCell, setEditingCell] = useState<{ recordId: string; field: 'check_in' | 'check_out' } | null>(null);
    const [tempTime, setTempTime] = useState<dayjs.Dayjs | null>(null);
    const [timeModalVisible, setTimeModalVisible] = useState(false);
    const [selectedHour, setSelectedHour] = useState<number>(0);
    const [selectedMinute, setSelectedMinute] = useState<number>(0);

    useEffect(() => {
        fetchEmployees();
        fetchAttendanceData();
    }, []);

    useEffect(() => {
        fetchAttendanceData();
    }, [selectedEmployee, dateRange, monthFilter]);

    const fetchEmployees = async () => {
        try {
            const response = await api.get('/hr/employees/');
            setEmployees(response.data.results || response.data);
        } catch (error) {
            console.error('Error fetching employees:', error);
            message.error('Hiba az alkalmazottak betöltésekor');
        }
    };

    const fetchAttendanceData = async () => {
        setLoading(true);
        try {
            let url = '/hr/attendance-reports/';
            const params = new URLSearchParams();

            if (selectedEmployee) {
                params.append('employee_id', selectedEmployee.toString());
            }

            if (dateRange) {
                params.append('start_date', dateRange[0].format('YYYY-MM-DD'));
                params.append('end_date', dateRange[1].format('YYYY-MM-DD'));
            } else if (monthFilter) {
                params.append('month', monthFilter);
            }

            if (params.toString()) {
                url += '?' + params.toString();
            }

            const response = await api.get(url);
            const data = response.data;
            
            setAttendanceData(data.results || []);
            setSummary(data.summary || null);
        } catch (error) {
            console.error('Error fetching attendance data:', error);
            message.error('Hiba a jelenlét adatok betöltésekor');
        } finally {
            setLoading(false);
        }
    };

    const handleMonthFilterChange = (value: string) => {
        setMonthFilter(value);
        setDateRange(null); // Clear custom date range when using quick filter
    };

    const handleDateRangeChange = (dates: any) => {
        if (dates) {
            setDateRange([dates[0], dates[1]]);
            setMonthFilter(''); // Clear month filter when using custom range
        } else {
            setDateRange(null);
        }
    };

    const handleEdit = (record: AttendanceRecord) => {
        setEditingRecord(record);
        form.setFieldsValue({
            check_in: record.check_in ? dayjs(record.check_in) : null,
            check_out: record.check_out ? dayjs(record.check_out) : null,
            notes: record.notes || '',
        });
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        try {
            const values = await form.validateFields();
            
            if (!editingRecord || !editingRecord.id) {
                message.error('Nincs azonosítási rekord ehhez a naphoz');
                return;
            }

            await api.patch(
                `/hr/attendance-reports/${editingRecord.id}/`,
                {
                    check_in: values.check_in ? values.check_in.toISOString() : null,
                    check_out: values.check_out ? values.check_out.toISOString() : null,
                    notes: values.notes || '',
                }
            );

            message.success('Jelenlét rekord sikeresen frissítve');
            setEditModalVisible(false);
            setEditingRecord(null);
            form.resetFields();
            fetchAttendanceData();
        } catch (error) {
            console.error('Error saving attendance record:', error);
            message.error('Hiba a mentés során');
        }
    };

    const handleTimeChange = async (recordId: string, field: 'check_in' | 'check_out', time: dayjs.Dayjs | null) => {
        try {
            const record = attendanceData.find(r => `${r.employee_id}-${r.date}` === recordId);
            if (!record) {
                message.error('Rekord nem található');
                return;
            }

            // Combine the date from the record with the new time
            const dateStr = record.date;
            let newDateTime = null;
            if (time) {
                newDateTime = dayjs(dateStr).hour(time.hour()).minute(time.minute()).second(0);
                
                // Validate: check_out cannot be before check_in
                if (field === 'check_out' && record.check_in) {
                    const checkInTime = dayjs(record.check_in);
                    if (newDateTime.isBefore(checkInTime)) {
                        message.error('A kilépés időpontja nem lehet korábbi, mint a belépés időpontja');
                        return;
                    }
                }
                if (field === 'check_in' && record.check_out) {
                    const checkOutTime = dayjs(record.check_out);
                    if (newDateTime.isAfter(checkOutTime)) {
                        message.error('A belépés időpontja nem lehet későbbi, mint a kilépés időpontja');
                        return;
                    }
                }
                
                newDateTime = newDateTime.toISOString();
            }
            
            // Ha nincs ID, akkor új rekordot kell létrehozni
            if (!record.id) {
                // POST request új rekord létrehozásához
                const fieldName = field === 'check_in' ? 'check_in_time' : 'check_out_time';
                await api.post('/hr/access-logs/', {
                    employee: record.employee_id,
                    [fieldName]: newDateTime,
                });

                message.success('Idő sikeresen rögzítve');
                setEditingCell(null);
                fetchAttendanceData();
            } else {
                // PATCH request meglévő rekord frissítéséhez
                const fieldName = field === 'check_in' ? 'check_in_time' : 'check_out_time';
                await api.patch(`/hr/attendance-reports/${record.id}/`, {
                    [fieldName]: newDateTime,
                });

                message.success('Idő sikeresen frissítve');
                setEditingCell(null);
                fetchAttendanceData();
            }
        } catch (error) {
            console.error('Error updating time:', error);
            message.error('Hiba a mentés során');
        }
    };

    const renderTimeCell = (time: string | null, record: AttendanceRecord, field: 'check_in' | 'check_out') => {
        const recordId = `${record.employee_id}-${record.date}`;
        const isEditing = editingCell?.recordId === recordId && editingCell?.field === field;
        const color = field === 'check_in' ? 'green' : 'blue';

        return (
            <Tag
                color={time ? color : 'default'}
                icon={<ClockCircleOutlined />}
                onClick={() => {
                    if (record.is_editable) {
                        let currentTime;
                        if (time) {
                            // Ha van érték, azt használja
                            currentTime = dayjs(time);
                        } else if (field === 'check_out' && record.check_in) {
                            // Ha kilépés és nincs érték, de van belépés, akkor a belépés idejét használja
                            currentTime = dayjs(record.check_in);
                        } else {
                            // Alapértelmezett: 8:00
                            currentTime = dayjs().startOf('day').hour(8);
                        }
                        setSelectedHour(currentTime.hour());
                        setSelectedMinute(currentTime.minute());
                        setEditingCell({ recordId, field });
                        setTimeModalVisible(true);
                    }
                }}
                style={{ cursor: record.is_editable ? 'pointer' : 'default' }}
            >
                {time ? dayjs(time).format('HH:mm') : '-'}
            </Tag>
        );
    };

    const handleTimeOk = () => {
        if (!editingCell) return;
        
        const newTime = dayjs().hour(selectedHour).minute(selectedMinute);
        handleTimeChange(editingCell.recordId, editingCell.field, newTime);
        setTimeModalVisible(false);
        setEditingCell(null);
    };

    const handleTimeCancel = () => {
        setTimeModalVisible(false);
        setEditingCell(null);
    };

    const handleClockPickerOk = (hour: number, minute: number) => {
        if (!editingCell) return;
        
        const newTime = dayjs().hour(hour).minute(minute);
        handleTimeChange(editingCell.recordId, editingCell.field, newTime);
        setTimeModalVisible(false);
        setEditingCell(null);
    };

    const handleClockPickerCancel = () => {
        setTimeModalVisible(false);
        setEditingCell(null);
    };

    const columns = [
        {
            title: 'Alkalmazott',
            dataIndex: 'employee_name',
            key: 'employee_name',
            fixed: 'left' as const,
            width: 200,
            render: (text: string) => (
                <Space>
                    <UserOutlined />
                    <span>{text}</span>
                </Space>
            ),
        },
        {
            title: 'Dátum',
            dataIndex: 'date',
            key: 'date',
            width: 120,
            render: (date: string) => dayjs(date).format('YYYY.MM.DD'),
            sorter: (a: AttendanceRecord, b: AttendanceRecord) =>
                dayjs(a.date).unix() - dayjs(b.date).unix(),
        },
        {
            title: 'Hét napja',
            dataIndex: 'date',
            key: 'weekday',
            width: 100,
            render: (date: string) => {
                const day = dayjs(date);
                const weekdays = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];
                return weekdays[day.day()];
            },
        },
        {
            title: 'Belépés',
            dataIndex: 'check_in',
            key: 'check_in',
            width: 120,
            render: (time: string | null, record: AttendanceRecord) => renderTimeCell(time, record, 'check_in'),
        },
        {
            title: 'Kilépés',
            dataIndex: 'check_out',
            key: 'check_out',
            width: 120,
            render: (time: string | null, record: AttendanceRecord) => renderTimeCell(time, record, 'check_out'),
        },
        {
            title: 'Ledolgozott órák',
            dataIndex: 'hours_worked',
            key: 'hours_worked',
            width: 120,
            render: (hours: number | string) => {
                const hoursNum = typeof hours === 'number' ? hours : parseFloat(hours) || 0;
                return (
                    <Tag color={hoursNum > 0 ? 'cyan' : 'default'}>
                        {hoursNum > 0 ? `${hoursNum.toFixed(2)} óra` : '-'}
                    </Tag>
                );
            },
            sorter: (a: AttendanceRecord, b: AttendanceRecord) => {
                const aHours = typeof a.hours_worked === 'number' ? a.hours_worked : parseFloat(a.hours_worked) || 0;
                const bHours = typeof b.hours_worked === 'number' ? b.hours_worked : parseFloat(b.hours_worked) || 0;
                return aHours - bHours;
            },
        },
        {
            title: 'Megjegyzés',
            dataIndex: 'notes',
            key: 'notes',
            width: 200,
            ellipsis: true,
        },
        {
            title: 'Művelet',
            key: 'action',
            width: 100,
            fixed: 'right' as const,
            render: (_: any, record: AttendanceRecord) => (
                <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                    disabled={!record.is_editable}
                >
                    Szerkesztés
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card
                title={
                    <Space>
                        <CalendarOutlined />
                        <span>Jelenlét - Alkalmazottak nyilvántartása</span>
                    </Space>
                }
            >
                {/* Filters */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={6}>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Válasszon alkalmazottat"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            value={selectedEmployee}
                            onChange={setSelectedEmployee}
                        >
                            {employees.map((emp) => (
                                <Option key={emp.id} value={emp.id}>
                                    {emp.full_name} ({emp.employee_id})
                                </Option>
                            ))}
                        </Select>
                    </Col>
                    <Col span={6}>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Válasszon időszakot"
                            value={monthFilter}
                            onChange={handleMonthFilterChange}
                        >
                            <Option value="current">Aktuális hónap</Option>
                            <Option value="previous">Előző hónap</Option>
                        </Select>
                    </Col>
                    <Col span={8}>
                        <RangePicker
                            style={{ width: '100%' }}
                            format="YYYY.MM.DD"
                            value={dateRange}
                            onChange={handleDateRangeChange}
                            placeholder={['Kezdő dátum', 'Záró dátum']}
                        />
                    </Col>
                    <Col span={4}>
                        <Button
                            type="primary"
                            icon={<CalendarOutlined />}
                            onClick={fetchAttendanceData}
                            block
                        >
                            Frissítés
                        </Button>
                    </Col>
                </Row>

                {/* Summary Statistics */}
                {summary && (
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col span={8}>
                            <Card>
                                <Statistic
                                    title="Időszak"
                                    value={`${dayjs(summary.start_date).format('YYYY.MM.DD')} - ${dayjs(summary.end_date).format('YYYY.MM.DD')}`}
                                    valueStyle={{ fontSize: 16 }}
                                />
                            </Card>
                        </Col>
                        <Col span={8}>
                            <Card>
                                <Statistic
                                    title="Ledolgozott napok"
                                    value={summary.total_days_worked}
                                    suffix="nap"
                                    valueStyle={{ color: '#3f8600' }}
                                />
                            </Card>
                        </Col>
                        <Col span={8}>
                            <Card>
                                <Statistic
                                    title="Összesen ledolgozott órák"
                                    value={summary.total_hours.toFixed(2)}
                                    suffix="óra"
                                    valueStyle={{ color: '#1890ff' }}
                                />
                            </Card>
                        </Col>
                    </Row>
                )}

                {/* Attendance Table */}
                <Table
                    columns={columns}
                    dataSource={attendanceData}
                    loading={loading}
                    rowKey={(record) => `${record.employee_id}-${record.date}`}
                    pagination={{
                        pageSize: 31,
                        showTotal: (total) => `Összesen ${total} rekord`,
                    }}
                    scroll={{ x: 1200 }}
                    bordered
                />
            </Card>

            {/* Clock Picker Modal */}
            <ClockPicker
                visible={timeModalVisible}
                initialHour={selectedHour}
                initialMinute={selectedMinute}
                onOk={handleClockPickerOk}
                onCancel={handleClockPickerCancel}
            />

            {/* Edit Modal */}
            <Modal
                title="Jelenlét szerkesztése"
                open={editModalVisible}
                onOk={handleSaveEdit}
                onCancel={() => {
                    setEditModalVisible(false);
                    setEditingRecord(null);
                    form.resetFields();
                }}
                okText="Mentés"
                cancelText="Mégse"
                width={600}
            >
                {editingRecord && (
                    <div style={{ marginBottom: 16 }}>
                        <p>
                            <strong>Alkalmazott:</strong> {editingRecord.employee_name}
                        </p>
                        <p>
                            <strong>Dátum:</strong> {dayjs(editingRecord.date).format('YYYY.MM.DD')}
                        </p>
                    </div>
                )}
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="check_in"
                        label="Belépés időpontja"
                        rules={[{ required: false, message: 'Adja meg a belépés időpontját' }]}
                    >
                        <DatePicker
                            showTime
                            format="YYYY.MM.DD HH:mm"
                            style={{ width: '100%' }}
                            placeholder="Válasszon időpontot"
                        />
                    </Form.Item>
                    <Form.Item
                        name="check_out"
                        label="Kilépés időpontja"
                        rules={[{ required: false, message: 'Adja meg a kilépés időpontját' }]}
                    >
                        <DatePicker
                            showTime
                            format="YYYY.MM.DD HH:mm"
                            style={{ width: '100%' }}
                            placeholder="Válasszon időpontot"
                        />
                    </Form.Item>
                    <Form.Item name="notes" label="Megjegyzés">
                        <TextArea rows={4} placeholder="Írjon megjegyzést..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default AttendanceReport;
