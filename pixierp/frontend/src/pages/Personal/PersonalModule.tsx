import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    MailOutlined,
    ShoppingOutlined,
    ClockCircleOutlined,
    CheckSquareOutlined,
    WalletOutlined,
    FileTextOutlined
} from '@ant-design/icons';
import MyOrders from './MyOrders';
import MyInvitations from './MyInvitations';
import MyAttendance from './MyAttendance';
import Approvals from './Approvals';
import MyTasks from './MyTasks';
import ModuleDashboard from '../../components/ModuleDashboard';
import CashRegisters from '../Finance/CashRegisters';
import Tickets from '../Tickets/Tickets';

const PersonalModule: React.FC = () => {
    const dashboardItems = [
        { key: '/personal/invitations', label: 'Meghívásaim', icon: <MailOutlined /> },
        { key: '/personal/orders', label: 'Megrendelések', icon: <ShoppingOutlined /> },
        { key: '/personal/attendance', label: 'Jelenléti ív', icon: <ClockCircleOutlined /> },
        { key: '/personal/tasks', label: 'Feladatok', icon: <CheckSquareOutlined /> },
        { key: '/personal/approvals', label: 'Jóváhagyások', icon: <CheckSquareOutlined /> },
        { key: '/personal/cash-registers', label: 'Kassza', icon: <WalletOutlined /> },
        { key: '/personal/tickets', label: 'Jegyek', icon: <FileTextOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Saját" items={dashboardItems} />} />
            <Route path="orders" element={<MyOrders />} />
            <Route path="invitations" element={<MyInvitations />} />
            <Route path="attendance" element={<MyAttendance />} />
            <Route path="tasks" element={<MyTasks />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="cash-registers" element={<CashRegisters />} />
            <Route path="tickets" element={<Tickets mode="personal" />} />
        </Routes>
    );
};
export default PersonalModule;
