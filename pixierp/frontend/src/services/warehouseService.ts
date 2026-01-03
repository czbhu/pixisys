import api from './api';

export const warehouseService = {
    // Material Types
    async getMaterialTypes() {
        const response = await api.get('/warehouse/material-types/');
        return response.data;
    },

    async getMaterialType(id: number) {
        const response = await api.get(`/warehouse/material-types/${id}/`);
        return response.data;
    },

    async createMaterialType(data: any) {
        const response = await api.post('/warehouse/material-types/', data);
        return response.data;
    },

    async updateMaterialType(id: number, data: any) {
        const response = await api.put(`/warehouse/material-types/${id}/`, data);
        return response.data;
    },

    async deleteMaterialType(id: number) {
        const response = await api.delete(`/warehouse/material-types/${id}/`);
        return response.data;
    },

    // Materials
    async getMaterials(params?: any) {
        const response = await api.get('/warehouse/materials/', { params });
        return response.data;
    },

    async getMaterial(id: number) {
        const response = await api.get(`/warehouse/materials/${id}/`);
        return response.data;
    },

    async createMaterial(data: any) {
        const response = await api.post('/warehouse/materials/', data);
        return response.data;
    },

    async updateMaterial(id: number, data: any) {
        const response = await api.put(`/warehouse/materials/${id}/`, data);
        return response.data;
    },

    async deleteMaterial(id: number) {
        const response = await api.delete(`/warehouse/materials/${id}/`);
        return response.data;
    },

    // Warehouses
    async getWarehouses() {
        const response = await api.get('/warehouse/warehouses/');
        return response.data;
    },

    async getWarehouse(id: number) {
        const response = await api.get(`/warehouse/warehouses/${id}/`);
        return response.data;
    },

    async createWarehouse(data: any) {
        const response = await api.post('/warehouse/warehouses/', data);
        return response.data;
    },

    async updateWarehouse(id: number, data: any) {
        const response = await api.put(`/warehouse/warehouses/${id}/`, data);
        return response.data;
    },

    async deleteWarehouse(id: number) {
        const response = await api.delete(`/warehouse/warehouses/${id}/`);
        return response.data;
    },

    // Shelves
    async getShelves(params?: any) {
        const response = await api.get('/warehouse/shelves/', { params });
        return response.data;
    },

    async getShelf(id: number) {
        const response = await api.get(`/warehouse/shelves/${id}/`);
        return response.data;
    },

    async createShelf(data: any) {
        const response = await api.post('/warehouse/shelves/', data);
        return response.data;
    },

    async updateShelf(id: number, data: any) {
        const response = await api.put(`/warehouse/shelves/${id}/`, data);
        return response.data;
    },

    async deleteShelf(id: number) {
        const response = await api.delete(`/warehouse/shelves/${id}/`);
        return response.data;
    },

    // Material Suppliers
    async getMaterialSuppliers(params?: any) {
        const response = await api.get('/warehouse/material-suppliers/', { params });
        return response.data;
    },

    async getMaterialSupplier(id: number) {
        const response = await api.get(`/warehouse/material-suppliers/${id}/`);
        return response.data;
    },

    async createMaterialSupplier(data: any) {
        const response = await api.post('/warehouse/material-suppliers/', data);
        return response.data;
    },

    async updateMaterialSupplier(id: number, data: any) {
        const response = await api.put(`/warehouse/material-suppliers/${id}/`, data);
        return response.data;
    },

    async deleteMaterialSupplier(id: number) {
        const response = await api.delete(`/warehouse/material-suppliers/${id}/`);
        return response.data;
    },

    // Inventory
    async getInventory(params?: any) {
        const response = await api.get('/warehouse/inventory/', { params });
        return response.data;
    },

    async getInventoryItem(id: number) {
        const response = await api.get(`/warehouse/inventory/${id}/`);
        return response.data;
    },

    async createInventoryItem(data: any) {
        const response = await api.post('/warehouse/inventory/', data);
        return response.data;
    },

    async updateInventoryItem(id: number, data: any) {
        const response = await api.put(`/warehouse/inventory/${id}/`, data);
        return response.data;
    },

    async deleteInventoryItem(id: number) {
        const response = await api.delete(`/warehouse/inventory/${id}/`);
        return response.data;
    },

    async getInventorySummary() {
        const response = await api.get('/warehouse/inventory/summary/');
        return response.data;
    },

    // Material Receipts
    async getReceipts(params?: any) {
        const response = await api.get('/warehouse/receipts/', { params });
        return response.data;
    },

    async getReceipt(id: number) {
        const response = await api.get(`/warehouse/receipts/${id}/`);
        return response.data;
    },

    async createReceipt(data: any) {
        const response = await api.post('/warehouse/receipts/', data);
        return response.data;
    },

    async updateReceipt(id: number, data: any) {
        const response = await api.put(`/warehouse/receipts/${id}/`, data);
        return response.data;
    },

    async deleteReceipt(id: number) {
        const response = await api.delete(`/warehouse/receipts/${id}/`);
        return response.data;
    },

    async confirmReceipt(id: number) {
        const response = await api.post(`/warehouse/receipts/${id}/confirm_receipt/`);
        return response.data;
    },

    async cancelReceipt(id: number) {
        const response = await api.post(`/warehouse/receipts/${id}/cancel_receipt/`);
        return response.data;
    },
};
