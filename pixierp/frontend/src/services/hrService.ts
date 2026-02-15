import api from './api';

export const hrService = {
    // Departments
    async getDepartments() {
        const response = await api.get('/hr/departments/');
        return response.data;
    },

    async createDepartment(data: any) {
        const response = await api.post('/hr/departments/', data);
        return response.data;
    },

    async updateDepartment(id: number, data: any) {
        const response = await api.put(`/hr/departments/${id}/`, data);
        return response.data;
    },

    async patchDepartment(id: number, data: any) {
        const response = await api.patch(`/hr/departments/${id}/`, data);
        return response.data;
    },

    async deleteDepartment(id: number) {
        const response = await api.delete(`/hr/departments/${id}/`);
        return response.data;
    },

    // Positions
    async getPositions() {
        const response = await api.get('/hr/positions/');
        return response.data;
    },

    async createPosition(data: any) {
        const response = await api.post('/hr/positions/', data);
        return response.data;
    },

    async updatePosition(id: number, data: any) {
        const response = await api.put(`/hr/positions/${id}/`, data);
        return response.data;
    },

    async deletePosition(id: number) {
        const response = await api.delete(`/hr/positions/${id}/`);
        return response.data;
    },

    // Employees
    async getEmployees() {
        const response = await api.get('/hr/employees/');
        return response.data;
    },

    async getEmployee(id: number) {
        const response = await api.get(`/hr/employees/${id}/`);
        return response.data;
    },

    async createEmployee(data: any) {
        const response = await api.post('/hr/employees/', data);
        return response.data;
    },

    async updateEmployee(id: number, data: any) {
        const response = await api.put(`/hr/employees/${id}/`, data);
        return response.data;
    },

    async deleteEmployee(id: number, deleteMailbox: boolean = false) {
        const response = await api.delete(`/hr/employees/${id}/`, {
            params: { delete_mailbox: deleteMailbox ? '1' : '0' }
        });
        return response.data;
    },

    async generatePassword(id: number) {
        const response = await api.post(`/hr/employees/${id}/generate_password/`);
        return response.data;
    },

    async generateEmployeeEmailAccount(data: { first_name: string; last_name: string; domain?: string; department_ids?: number[]; employee_id?: number; create_account?: boolean }) {
        const response = await api.post('/hr/employees/generate_email_account/', data);
        return response.data;
    },

    // Attendances
    async getAttendances() {
        const response = await api.get('/hr/attendances/');
        return response.data;
    },

    async createAttendance(data: any) {
        const response = await api.post('/hr/attendances/', data);
        return response.data;
    },

    async updateAttendance(id: number, data: any) {
        const response = await api.put(`/hr/attendances/${id}/`, data);
        return response.data;
    },

    async deleteAttendance(id: number) {
        const response = await api.delete(`/hr/attendance-reports/${id}/`);
        return response.data;
    },

    // Leave Requests
    async getLeaveRequests() {
        const response = await api.get('/hr/leave-requests/');
        return response.data;
    },

    async createLeaveRequest(data: any) {
        const response = await api.post('/hr/leave-requests/', data);
        return response.data;
    },

    async updateLeaveRequest(id: number, data: any) {
        const response = await api.put(`/hr/leave-requests/${id}/`, data);
        return response.data;
    },

    async deleteLeaveRequest(id: number) {
        const response = await api.delete(`/hr/leave-requests/${id}/`);
        return response.data;
    },

    // Payrolls
    async getPayrolls() {
        const response = await api.get('/hr/payrolls/');
        return response.data;
    },

    async createPayroll(data: any) {
        const response = await api.post('/hr/payrolls/', data);
        return response.data;
    },

    async updatePayroll(id: number, data: any) {
        const response = await api.put(`/hr/payrolls/${id}/`, data);
        return response.data;
    },

    async deletePayroll(id: number) {
        const response = await api.delete(`/hr/payrolls/${id}/`);
        return response.data;
    },

    // Analytics
    async getProjectProfitShare(params: any) {
        const response = await api.get('/hr/analytics/project_profit_share/', { params });
        return response.data;
    },

    async getTimeBasedAnalytics(params: any) {
        const response = await api.get('/hr/analytics/time_based_analytics/', { params });
        return response.data;
    },

    async getWorkplaceAttendance(params: any) {
        const response = await api.get('/hr/analytics/workplace_attendance/', { params });
        return response.data;
    },

    async getCombinedAnalytics(params: any) {
        const response = await api.get('/hr/analytics/combined_analytics/', { params });
        return response.data;
    },

    // Time Logs
    async getTimeLogs(params?: any) {
        const response = await api.get('/hr/time-logs/', { params });
        return response.data;
    },

    async createTimeLog(data: any) {
        const response = await api.post('/hr/time-logs/', data);
        return response.data;
    },

    async updateTimeLog(id: number, data: any) {
        const response = await api.put(`/hr/time-logs/${id}/`, data);
        return response.data;
    },

    async deleteTimeLog(id: number) {
        const response = await api.delete(`/hr/time-logs/${id}/`);
        return response.data;
    },

    // Access Logs
    async getAccessLogs(params?: any) {
        const response = await api.get('/hr/access-logs/', { params });
        return response.data;
    },

    async createAccessLog(data: any) {
        const response = await api.post('/hr/access-logs/', data);
        return response.data;
    },

    async updateAccessLog(id: number, data: any) {
        const response = await api.put(`/hr/access-logs/${id}/`, data);
        return response.data;
    },

    async deleteAccessLog(id: number) {
        const response = await api.delete(`/hr/access-logs/${id}/`);
        return response.data;
    },

    // Project Participations
    async getProjectParticipations(params?: any) {
        const response = await api.get('/hr/project-participations/', { params });
        return response.data;
    },

    async createProjectParticipation(data: any) {
        const response = await api.post('/hr/project-participations/', data);
        return response.data;
    },

    async updateProjectParticipation(id: number, data: any) {
        const response = await api.put(`/hr/project-participations/${id}/`, data);
        return response.data;
    },

    async deleteProjectParticipation(id: number) {
        const response = await api.delete(`/hr/project-participations/${id}/`);
        return response.data;
    },

    // Access Credentials
    async getAccessCredentials(params?: any) {
        const response = await api.get('/hr/access-credentials/', { params });
        return response.data;
    },

    async getEmployeeCredentials(employeeId: number) {
        const response = await api.get(`/hr/access-credentials/?employee=${employeeId}`);
        return response.data;
    },

    async createAccessCredential(data: any) {
        const response = await api.post('/hr/access-credentials/', data);
        return response.data;
    },

    async deleteAccessCredential(id: number) {
        const response = await api.delete(`/hr/access-credentials/${id}/`);
        return response.data;
    },

    async syncCredentialToDevice(id: number) {
        const response = await api.post(`/hr/access-credentials/${id}/sync_to_device/`);
        return response.data;
    },

    async readFromDevice(credentialType: string, employeeId: number, fingerIndex: number = 0) {
        const response = await api.post('/hr/access-credentials/read_from_device/', {
            credential_type: credentialType,
            employee_id: employeeId,
            finger_index: fingerIndex
        });
        return response.data;
    },

    async syncFromDevice(employeeId: number) {
        const response = await api.post('/hr/access-credentials/sync_from_device/', {
            employee_id: employeeId
        });
        return response.data;
    },

    // Access Control Config
    async getAccessControlConfigs() {
        const response = await api.get('/hr/access-control-configs/');
        return response.data;
    },

    async testConnection(data: { device_ip: string; device_port: number; device_id: string }) {
        const response = await api.post('/hr/access-control-configs/test_connection/', data);
        return response.data;
    },

    async discoverDevices() {
        const response = await api.get('/hr/access-control-configs/discover_devices/');
        return response.data;
    },

    async getAccessControlConfig(id: number) {
        const response = await api.get(`/hr/access-control-configs/${id}/`);
        return response.data;
    },

    async createAccessControlConfig(data: any) {
        const response = await api.post('/hr/access-control-configs/', data);
        return response.data;
    },

    async updateAccessControlConfig(id: number, data: any) {
        const response = await api.put(`/hr/access-control-configs/${id}/`, data);
        return response.data;
    },

    async deleteAccessControlConfig(id: number) {
        const response = await api.delete(`/hr/access-control-configs/${id}/`);
        return response.data;
    },

    // Attendance Reports
    async getAttendanceReports(params?: any) {
        const response = await api.get('/hr/attendance-reports/', { params });
        return response.data;
    },

    async createAttendanceReport(data: any) {
        const response = await api.post('/hr/attendance-reports/', data);
        return response.data;
    },

    async updateAttendanceReport(id: number, data: any) {
        const response = await api.patch(`/hr/attendance-reports/${id}/`, data);
        return response.data;
    },
};
