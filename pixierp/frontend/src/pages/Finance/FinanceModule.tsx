import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    FilePdfOutlined,
    CreditCardOutlined,
    PieChartOutlined,
    BarChartOutlined,
    BankOutlined,
    RocketOutlined,
    WalletOutlined,
    SettingOutlined
} from '@ant-design/icons';
import { message } from 'antd';
import api from '../../services/api';
import Invoices from './Invoices';
import Payments from './Payments';
import Budgets from './Budgets';
import Reports from './Reports';
import Accounts from './Accounts';
import CashRegisters from './CashRegisters';
import CashRegisterSetup from './CashRegisterSetup';
import ModuleDashboard from '../../components/ModuleDashboard';

const FinanceModule = () => {

    const handlePixInvoiceSSO = async () => {
        try {
          const response = await api.post('/auth/sso-token/', {});
          const ssoToken = response.data.token;
          const pixinvoiceUrl = `https://i.pixisys.eu/sso-login?token=${encodeURIComponent(ssoToken)}`;
          window.open(pixinvoiceUrl, '_blank');
        } catch (error) {
          console.error('SSO error:', error);
          message.error('Nem sikerült a PixInvoice elérése');
        }
    };

    const dashboardItems = [
        { key: '/finance/invoices', label: 'Számlák', icon: <FilePdfOutlined /> },
        { key: '/finance/payments', label: 'Fizetések', icon: <CreditCardOutlined /> },
        { key: '/finance/cash-registers', label: 'Kasszák', icon: <WalletOutlined /> },
        { key: '/finance/cash-register-setup', label: 'Kassza Regisztráció', icon: <SettingOutlined /> },
        { key: '/finance/budgets', label: 'Költségvetések', icon: <PieChartOutlined /> },
        { key: '/finance/reports', label: 'Jelentések', icon: <BarChartOutlined /> },
        { key: '/finance/accounts', label: 'Számlák (Fiókok)', icon: <BankOutlined /> },
        { key: 'pixinvoice-sso', label: 'PixInvoice', icon: <RocketOutlined />, onClick: handlePixInvoiceSSO },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Pénzügy" items={dashboardItems} />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/cash-registers" element={<CashRegisters />} />
            <Route path="/cash-register-setup" element={<CashRegisterSetup />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/accounts" element={<Accounts />} />
        </Routes>
    );
};

export default FinanceModule;
