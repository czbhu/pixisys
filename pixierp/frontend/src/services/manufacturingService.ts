import api from './api';

export interface ProductClass {
    id: number;
    name: string;
    description?: string;
    image?: string | null;
    image_url?: string | null;
    is_default: boolean;
    calculators: string[];
    hr_department_names: string[];
    created_at: string;
    updated_at: string;
    parent?: number | null;
    parent_name?: string;
    children?: ProductClass[];
}

export interface Project {
    id: number;
    name: string;
    description: string;
    deadline: string;
    contact_names: string[];
    project_manager_name?: string;
    status: 'open' | 'closed';
    company?: number | null;
    company_name?: string | null;
    created_at: string;
    updated_at: string;
}

export interface Currency {
    id: number;
    code: string;
    name: string;
    symbol: string;
    exchange_rate: number;
    is_default: boolean;
}

export interface ManufacturingProduct {
    id: number;
    code?: string;
    date: string;
    name: string;
    description: string;
    internal_description: string;
    quantity: number;
    is_fixed_quantity?: boolean;
    cost_items?: any[];
    quantity_unit?: string;
    product_class_name?: string;
    project_name?: string;
    net_unit_price: number;
    net_total_price: number;
    currency?: number;
    currency_info?: Currency;
    status: string;
    status_display: string;
    allowed_companies?: (number | string)[];
    allowed_companies_data?: { id: number | string; name: string }[];
    allowed_contacts?: (number | string)[];
    allowed_contacts_data?: { id: number | string; name: string }[];
    contact_name?: string;
    contact_company_name?: string;
    deadline: string;
    created_at: string;
    updated_at: string;
}

export interface CreateProductClassData {
    name: string;
    description?: string;
    is_default?: boolean;
    calculators?: string[];
    hr_departments?: number[];
    parent?: number | null;
}

export interface CreateProjectData {
    name: string;
    description?: string;
    deadline: string;
    contacts?: number[];
    project_manager?: number;
    status?: 'open' | 'closed';
}

export interface CreateManufacturingProductData {
    date: string;
    name: string;
    description?: string;
    internal_description?: string;
    quantity: number;
    product_class?: number;
    project?: number;
    net_unit_price: number;
    status: string;
    contact?: number;
    deadline: string;
}

class ManufacturingService {
    // Product Classes
    async getProductClasses(): Promise<ProductClass[]> {
        const response = await api.get('/manufacturing/product-classes/');
        return response.data.results || response.data;
    }

    async getServices() {
        const response = await api.get('/manufacturing/services/');
        if (response.data && response.data.results) return response.data.results;
        return response.data || [];
    }

    async createProductClass(data: CreateProductClassData): Promise<ProductClass> {
        const response = await api.post('/manufacturing/product-classes/', data);
        return response.data;
    }

    async updateProductClass(id: number, data: Partial<CreateProductClassData>): Promise<ProductClass> {
        const response = await api.put(`/manufacturing/product-classes/${id}/`, data);
        return response.data;
    }

    async deleteProductClass(id: number): Promise<void> {
        await api.delete(`/manufacturing/product-classes/${id}/`);
    }

    // Projects
    async getProjects(): Promise<Project[]> {
        const response = await api.get('/manufacturing/projects/');
        return response.data.results || response.data;
    }

    async getOpenProjects(): Promise<Project[]> {
        const response = await api.get('/manufacturing/projects/open_projects/');
        return response.data;
    }

    async createProject(data: CreateProjectData): Promise<Project> {
        const response = await api.post('/manufacturing/projects/', data);
        return response.data;
    }

    async updateProject(id: number, data: Partial<CreateProjectData>): Promise<Project> {
        const response = await api.put(`/manufacturing/projects/${id}/`, data);
        return response.data;
    }

    async patchProject(id: number, data: Partial<CreateProjectData>): Promise<Project> {
        const response = await api.patch(`/manufacturing/projects/${id}/`, data);
        return response.data;
    }

    async deleteProject(id: number): Promise<void> {
        await api.delete(`/manufacturing/projects/${id}/`);
    }

    async getProjectProducts(projectId: number): Promise<ManufacturingProduct[]> {
        const response = await api.get(`/manufacturing/projects/${projectId}/products/`);
        return response.data;
    }

    // Manufacturing Products
    async getProducts(): Promise<ManufacturingProduct[]> {
        const response = await api.get('/manufacturing/products/');
        return response.data.results || response.data;
    }
    async getProduct(id: number): Promise<ManufacturingProduct> {
        const response = await api.get(`/manufacturing/products/${id}/`);
        return response.data;
    }
    async getProductsByStatus(status: string): Promise<ManufacturingProduct[]> {
        const response = await api.get(`/manufacturing/products/by_status/?status=${status}`);
        return response.data;
    }

    async getProductsByProject(projectId: number): Promise<ManufacturingProduct[]> {
        const response = await api.get(`/manufacturing/products/by_project/?project_id=${projectId}`);
        return response.data;
    }

    async createProduct(data: CreateManufacturingProductData): Promise<ManufacturingProduct> {
        const response = await api.post('/manufacturing/products/', data);
        return response.data;
    }

    async updateProduct(id: number, data: Partial<CreateManufacturingProductData>): Promise<ManufacturingProduct> {
        const response = await api.put(`/manufacturing/products/${id}/`, data);
        return response.data;
    }

    async patchProduct(id: number, data: any): Promise<ManufacturingProduct> {
        const response = await api.patch(`/manufacturing/products/${id}/`, data);
        return response.data;
    }

    async deleteProduct(id: number): Promise<void> {
        await api.delete(`/manufacturing/products/${id}/`);
    }

    // Currency methods
    async getCurrencies(): Promise<Currency[]> {
        const response = await api.get('/manufacturing/currencies/');
        return response.data.results || response.data;
    }

    async getActiveCurrencies(): Promise<Currency[]> {
        const response = await api.get('/manufacturing/currencies/active/');
        return response.data;
    }

    async createCurrency(data: any): Promise<Currency> {
        const response = await api.post('/manufacturing/currencies/', data);
        return response.data;
    }

    async updateCurrency(id: number, data: any): Promise<Currency> {
        const response = await api.put(`/manufacturing/currencies/${id}/`, data);
        return response.data;
    }

    async deleteCurrency(id: number): Promise<void> {
        await api.delete(`/manufacturing/currencies/${id}/`);
    }

    async getMNBCurrencies(): Promise<any[]> {
        const response = await api.get('/manufacturing/currencies/mnb_currencies/');
        return response.data;
    }

    // Exchange rate update
    async updateExchangeRates(): Promise<{ message: string }> {
        const response = await api.post('/manufacturing/currencies/update_rates/');
        return response.data;
    }

    // Product attachments
    async getProductAttachments(productId: number): Promise<any[]> {
        const response = await api.get(`/manufacturing/products/${productId}/attachments/`);
        return response.data;
    }

    async uploadProductAttachment(productId: number, file: File, remark?: string): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);
        if (remark) formData.append('remark', remark);
        const response = await api.post(`/manufacturing/products/${productId}/attachments/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    }

    async updateProductAttachmentRemark(productId: number, attachmentId: number, remark: string): Promise<void> {
        await api.post(`/manufacturing/products/${productId}/update_attachment_remark/`, { attachment_id: attachmentId, remark });
    }

    async deleteProductAttachment(productId: number, attachmentId: number): Promise<void> {
        await api.post(`/manufacturing/products/${productId}/delete_attachment/`, { attachment_id: attachmentId });
    }

    async duplicateProduct(id: number): Promise<any> {
        const response = await api.post(`/manufacturing/products/${id}/duplicate/`);
        return response.data;
    }

    async getUnitSuggestions(): Promise<{ unit: string; count: number }[]> {
        const response = await api.get('/manufacturing/products/unit_suggestions/');
        return response.data;
    }
}

export const manufacturingService = new ManufacturingService();