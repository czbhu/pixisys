import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    MailOutlined,
    ShoppingOutlined,
    ClockCircleOutlined,
    CheckSquareOutlined,
    WalletOutlined
} from '@ant-design/icons';
import MyOrders from './MyOrders';
import MyInvitations from './MyInvitations';
import MyAttendance from './MyAttendance';
import Approvals from './Approvals';
import ModuleDashboard from '../../components/ModuleDashboard';
import CashRegisters from '../Finance/CashRegisters';

const PersonalModule: React.FC = () => {
    const dashboardItems = [
        { key: '/personal/invitations', label: 'Meghívásaim', icon: <MailOutlined /> },
        { key: '/personal/orders', label: 'Megrendelések', icon: <ShoppingOutlined /> },
        { key: '/personal/attendance', label: 'Jelenléti ív', icon: <ClockCircleOutlined /> },
        { key: '/personal/approvals', label: 'Jóváhagyások', icon: <CheckSquareOutlined /> },
        { key: '/personal/cash-registers', label: 'Kassza', icon: <WalletOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Saját" items={dashboardItems} />} />
            <Route path="orders" element={<MyOrders />} />
            <Route path="invitations" element={<MyInvitations />} />
            <Route path="attendance" element={<MyAttendance />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="cash-registers" element={<CashRegisters />} />
        </Routes>
    );
};
export default PersonalModule;
