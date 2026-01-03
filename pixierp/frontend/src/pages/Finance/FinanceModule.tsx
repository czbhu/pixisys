import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Invoices from './Invoices';
import Payments from './Payments';
import Budgets from './Budgets';
import Reports from './Reports';
import Accounts from './Accounts';

const FinanceModule = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/finance/invoices" replace />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/accounts" element={<Accounts />} />
        </Routes>
    );
};

export default FinanceModule;
