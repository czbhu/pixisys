import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import Employees from './Employees';
import Departments from './Departments';
import AttendanceReport from './AttendanceReport';
import Payroll from './Payroll';
import Leaves from './Leaves';

const EmployeePerformance = lazy(() => import('./EmployeePerformance'));

const HRModule = () => {
    return (
        <Suspense fallback={<Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }} />}>
            <Routes>
                <Route path="/" element={<Navigate to="/hr/employees" replace />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/departments" element={<Departments />} />
                <Route path="/attendance" element={<AttendanceReport />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/leaves" element={<Leaves />} />
                <Route path="/analytics" element={<EmployeePerformance />} />
            </Routes>
        </Suspense>
    );
};

export default HRModule;
