import React, { useState, useEffect } from 'react';
import {
    Card,
    Row,
    Col,
    DatePicker,
    Select,
    Button,
    Space,
    Table,
    Statistic,
    Tabs,
    message,
    Tag
} from 'antd';
import {
    BarChartOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    HomeOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { hrService } from '../../services/hrService';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

const EmployeePerformance: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month')
    ]);
    const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
    const [employees, setEmployees] = useState<any[]>([]);
    
    // Analytics data
    const [profitShareData, setProfitShareData] = useState<any>(null);
    const [timeAnalyticsData, setTimeAnalyticsData] = useState<any>(null);
    const [workplaceAttendanceData, setWorkplaceAttendanceData] = useState<any>(null);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658'];

    const loadEmployees = async () => {
        try {
            const response = await hrService.getEmployees();
            setEmployees((response as any).results || response);
        } catch (error) {
            console.error('Error loading employees:', error);
            message.error('Hiba az alkalmazottak betöltése során');
        }
    };

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const params = {
                start_date: dateRange[0].format('YYYY-MM-DD'),
                end_date: dateRange[1].format('YYYY-MM-DD'),
                ...(selectedEmployee && { employee_id: selectedEmployee })
            };

            // Load all three analytics endpoints
            const [profitShare, timeAnalytics, workplace] = await Promise.all([
                hrService.getProjectProfitShare(params),
                hrService.getTimeBasedAnalytics(params),
                hrService.getWorkplaceAttendance(params)
            ]);

            setProfitShareData(profitShare);
            setTimeAnalyticsData(timeAnalytics);
            setWorkplaceAttendanceData(workplace);
        } catch (error) {
            console.error('Error loading analytics:', error);
            message.error('Hiba az analitika betöltése során');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEmployees();
        loadAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRefresh = () => {
        loadAnalytics();
    };

    const handleDateRangeChange = (dates: any) => {
        if (dates) {
            setDateRange([dates[0], dates[1]]);
        }
    };

    // Profit Share Tab
    const renderProfitShareTab = () => {
        if (!profitShareData) return null;

        const profitColumns = [
            {
                title: 'Alkalmazott',
                dataIndex: 'employee_name',
                key: 'employee_name',
            },
            {
                title: 'Projektek száma',
                dataIndex: 'project_count',
                key: 'project_count',
            },
            {
                title: 'Összes profit részesedés',
                dataIndex: 'total_profit_share',
                key: 'total_profit_share',
                render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`,
            },
        ];

        const projectColumns = [
            {
                title: 'Projekt',
                dataIndex: 'project_name',
                key: 'project_name',
            },
            {
                title: 'Szerep',
                dataIndex: 'role',
                key: 'role',
            },
            {
                title: 'Részesedés %',
                dataIndex: 'participation_percentage',
                key: 'participation_percentage',
                render: (value: number) => `${value}%`,
            },
            {
                title: 'Projekt profit',
                dataIndex: 'project_profit',
                key: 'project_profit',
                render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`,
            },
            {
                title: 'Rájutó rész',
                dataIndex: 'profit_share',
                key: 'profit_share',
                render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`,
            },
            {
                title: 'Státusz',
                dataIndex: 'project_status',
                key: 'project_status',
                render: (status: string) => (
                    <Tag color={status === 'open' ? 'green' : 'default'}>
                        {status === 'open' ? 'Nyitott' : 'Zárt'}
                    </Tag>
                ),
            },
        ];

        // Chart data for profit by employee
        const chartData = profitShareData.summary.map((item: any) => ({
            name: item.employee_name,
            profit: item.total_profit_share,
            projects: item.project_count
        }));

        return (
            <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col span={24}>
                        <Card title="Profit részesedés alkalmazottanként">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="profit" fill="#8884d8" name="Profit részesedés (Ft)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col span={24}>
                        <Card title="Összesített adatok">
                            <Table
                                dataSource={profitShareData.summary}
                                columns={profitColumns}
                                rowKey="employee_id"
                                pagination={false}
                            />
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={24}>
                        <Card title="Részletes projekt adatok">
                            <Table
                                dataSource={profitShareData.details}
                                columns={projectColumns}
                                rowKey={(record: any) => `${record.employee_id}-${record.project_id}`}
                            />
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    // Time Analytics Tab
    const renderTimeAnalyticsTab = () => {
        if (!timeAnalyticsData) return null;

        const { summary, by_employee, by_project } = timeAnalyticsData;

        const timeColumns = [
            {
                title: 'Alkalmazott',
                dataIndex: 'employee_name',
                key: 'employee_name',
            },
            {
                title: 'Összes óra',
                dataIndex: 'total_hours',
                key: 'total_hours',
                render: (value: number) => `${value.toFixed(2)} óra`,
            },
            {
                title: 'Számlázható óra',
                dataIndex: 'billable_hours',
                key: 'billable_hours',
                render: (value: number) => `${value.toFixed(2)} óra`,
            },
            {
                title: 'Bejegyzések száma',
                dataIndex: 'log_count',
                key: 'log_count',
            },
        ];

        const projectTimeColumns = [
            {
                title: 'Projekt',
                dataIndex: 'project_name',
                key: 'project_name',
            },
            {
                title: 'Összes óra',
                dataIndex: 'total_hours',
                key: 'total_hours',
                render: (value: number) => `${value.toFixed(2)} óra`,
            },
            {
                title: 'Alkalmazottak száma',
                dataIndex: 'employee_count',
                key: 'employee_count',
            },
        ];

        // Chart data
        const employeeChartData = by_employee.map((item: any) => ({
            name: item.employee_name,
            billable: item.billable_hours,
            nonBillable: item.total_hours - item.billable_hours
        }));

        const projectChartData = by_project.slice(0, 10).map((item: any) => ({
            name: item.project_name,
            hours: item.total_hours
        }));

        return (
            <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col span={8}>
                        <Card>
                            <Statistic
                                title="Összes logolt óra"
                                value={summary.total_hours}
                                precision={2}
                                suffix="óra"
                                prefix={<ClockCircleOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Statistic
                                title="Számlázható órák"
                                value={summary.billable_hours}
                                precision={2}
                                suffix="óra"
                                valueStyle={{ color: '#3f8600' }}
                            />
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Statistic
                                title="Bejegyzések száma"
                                value={summary.log_count}
                            />
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col span={12}>
                        <Card title="Órák alkalmazottanként">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={employeeChartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="billable" stackId="a" fill="#82ca9d" name="Számlázható" />
                                    <Bar dataKey="nonBillable" stackId="a" fill="#8884d8" name="Nem számlázható" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card title="Órák projektekre (Top 10)">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={projectChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={150} />
                                    <Tooltip />
                                    <Bar dataKey="hours" fill="#8884d8" name="Órák" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={12}>
                        <Card title="Alkalmazotti összesítés">
                            <Table
                                dataSource={by_employee}
                                columns={timeColumns}
                                rowKey="employee_id"
                                size="small"
                            />
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card title="Projekt összesítés">
                            <Table
                                dataSource={by_project}
                                columns={projectTimeColumns}
                                rowKey="project_id"
                                size="small"
                            />
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    // Workplace Attendance Tab
    const renderWorkplaceAttendanceTab = () => {
        if (!workplaceAttendanceData) return null;

        const { summary, by_employee, by_date, by_location } = workplaceAttendanceData;

        const attendanceColumns = [
            {
                title: 'Alkalmazott',
                dataIndex: 'employee_name',
                key: 'employee_name',
            },
            {
                title: 'Összes óra',
                dataIndex: 'total_hours',
                key: 'total_hours',
                render: (value: number) => `${value.toFixed(2)} óra`,
            },
            {
                title: 'Napok száma',
                dataIndex: 'days_count',
                key: 'days_count',
            },
            {
                title: 'Átlagos napi óraszám',
                dataIndex: 'avg_daily_hours',
                key: 'avg_daily_hours',
                render: (value: number) => `${value.toFixed(2)} óra`,
            },
        ];

        // Chart data
        const dailyChartData = by_date.map((item: any) => ({
            date: dayjs(item.date).format('MM-DD'),
            hours: item.total_hours,
            employees: item.employee_count
        }));

        const locationChartData = by_location.map((item: any) => ({
            name: item.location,
            value: item.total_hours
        }));

        return (
            <div>
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col span={8}>
                        <Card>
                            <Statistic
                                title="Összes munkahelyi óra"
                                value={summary.total_hours}
                                precision={2}
                                suffix="óra"
                                prefix={<HomeOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Statistic
                                title="Összes munkanap"
                                value={summary.total_days}
                                suffix="nap"
                            />
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Statistic
                                title="Belépési bejegyzések"
                                value={summary.log_count}
                            />
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col span={16}>
                        <Card title="Napi jelenlét">
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={dailyChartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis yAxisId="left" />
                                    <YAxis yAxisId="right" orientation="right" />
                                    <Tooltip />
                                    <Legend />
                                    <Line yAxisId="left" type="monotone" dataKey="hours" stroke="#8884d8" name="Órák" />
                                    <Line yAxisId="right" type="monotone" dataKey="employees" stroke="#82ca9d" name="Alkalmazottak" />
                                </LineChart>
                            </ResponsiveContainer>
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card title="Helyszínek megoszlása">
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={locationChartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {locationChartData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={24}>
                        <Card title="Alkalmazotti jelenlét">
                            <Table
                                dataSource={by_employee}
                                columns={attendanceColumns}
                                rowKey="employee_id"
                            />
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    return (
        <div style={{ padding: '24px' }}>
            <Card
                title={
                    <Space>
                        <BarChartOutlined />
                        <span>Alkalmazotti Tevékenység Mérés</span>
                    </Space>
                }
                extra={
                    <Space>
                        <Select
                            style={{ width: 200 }}
                            placeholder="Válasszon alkalmazottat"
                            allowClear
                            value={selectedEmployee}
                            onChange={setSelectedEmployee}
                        >
                            {employees.map(emp => (
                                <Option key={emp.id} value={emp.id}>
                                    {emp.full_name}
                                </Option>
                            ))}
                        </Select>
                        <RangePicker
                            value={dateRange}
                            onChange={handleDateRangeChange}
                            format="YYYY-MM-DD"
                        />
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={handleRefresh}
                            loading={loading}
                        >
                            Frissítés
                        </Button>
                    </Space>
                }
            >
                <Tabs defaultActiveKey="1">
                    <TabPane
                        tab={
                            <span>
                                <DollarOutlined />
                                Projekt Profit Részesedés
                            </span>
                        }
                        key="1"
                    >
                        {renderProfitShareTab()}
                    </TabPane>
                    <TabPane
                        tab={
                            <span>
                                <ClockCircleOutlined />
                                Idő Alapú Mérés
                            </span>
                        }
                        key="2"
                    >
                        {renderTimeAnalyticsTab()}
                    </TabPane>
                    <TabPane
                        tab={
                            <span>
                                <HomeOutlined />
                                Munkahelyi Jelenlét
                            </span>
                        }
                        key="3"
                    >
                        {renderWorkplaceAttendanceTab()}
                    </TabPane>
                </Tabs>
            </Card>
        </div>
    );
};

export default EmployeePerformance;
