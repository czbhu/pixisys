import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { 
    TeamOutlined, 
    ApartmentOutlined, 
    ScheduleOutlined, 
    FieldTimeOutlined, 
    MoneyCollectOutlined, 
    RestOutlined, 
    BarChartOutlined 
} from '@ant-design/icons';
import Employees from './Employees';
import Departments from './Departments';
import AttendanceReport from './AttendanceReport';
import Payroll from './Payroll';
import Leaves from './Leaves';
import WorkLogs from './WorkLogs';
import ModuleDashboard from '../../components/ModuleDashboard';

const EmployeePerformance = lazy(() => import('./EmployeePerformance'));

const HRModule = () => {
    const dashboardItems = [
        { key: '/hr/employees', label: 'Alkalmazottak', icon: <TeamOutlined /> },
        { key: '/hr/departments', label: 'Osztályok', icon: <ApartmentOutlined /> },
        { key: '/hr/attendance', label: 'Jelenlét', icon: <ScheduleOutlined /> },
        { key: '/hr/work-logs', label: 'Munkanaplók', icon: <FieldTimeOutlined /> },
        { key: '/hr/payroll', label: 'Bérszámfejtés', icon: <MoneyCollectOutlined /> },
        { key: '/hr/leaves', label: 'Szabadságok', icon: <RestOutlined /> },
        { key: '/hr/analytics', label: 'Teljesítmény Mérés', icon: <BarChartOutlined /> },
    ];

    return (
        <Suspense fallback={<Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }} />}>
            <Routes>
                <Route path="/" element={<ModuleDashboard title="HR Modul" items={dashboardItems} />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/departments" element={<Departments />} />
                <Route path="/attendance" element={<AttendanceReport />} />
                <Route path="/work-logs" element={<WorkLogs />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/leaves" element={<Leaves />} />
                <Route path="/analytics" element={<EmployeePerformance />} />
            </Routes>
        </Suspense>
    );
};

export default HRModule;
