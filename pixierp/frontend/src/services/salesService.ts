import api from './api';
export { default as apiInstance } from './api';

export const salesService = {
    // Customers
    async getCustomers() {
        const response = await api.get('/sales/customers/');
        return response.data;
    },

    async getTopCompanies() {
        const response = await api.get('/sales/quote-requests/top_companies/');
        return response.data;
    },

    async createQuoteFromRfq(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/create_quote/`, {});
        return response.data;
    },

    async getCustomer(id: number) {
        const response = await api.get(`/sales/customers/${id}/`);
        return response.data;
    },

    async createCustomer(customerData: any) {
        const response = await api.post('/sales/customers/', customerData);
        return response.data;
    },

    async updateCustomer(id: number, customerData: any) {
        const response = await api.put(`/sales/customers/${id}/`, customerData);
        return response.data;
    },

    async deleteCustomer(id: number) {
        const response = await api.delete(`/sales/customers/${id}/`);
        return response.data;
    },

    // Products
    async getProducts() {
        const response = await api.get('/sales/products/');
        return response.data;
    },

    async searchProducts(q: string) {
        const response = await api.get(`/sales/products/search/?q=${encodeURIComponent(q)}`);
        return response.data;
    },

    async getProduct(id: number) {
        const response = await api.get(`/sales/products/${id}/`);
        return response.data;
    },

    async createProduct(productData: any) {
        const response = await api.post('/sales/products/', productData);
        return response.data;
    },

    async updateProduct(id: number, productData: any) {
        const response = await api.put(`/sales/products/${id}/`, productData);
        return response.data;
    },

    async deleteProduct(id: number) {
        const response = await api.delete(`/sales/products/${id}/`);
        return response.data;
    },

    // Quotes
    async getQuotes() {
        const response = await api.get('/sales/quotes/');
        return response.data;
    },

    async getQuote(id: number) {
        const response = await api.get(`/sales/quotes/${id}/`);
        return response.data;
    },

    async createQuote(quoteData: any) {
        const response = await api.post('/sales/quotes/', quoteData);
        return response.data;
    },

    async updateQuote(id: number, quoteData: any) {
        const response = await api.put(`/sales/quotes/${id}/`, quoteData);
        return response.data;
    },

    async deleteQuote(id: number) {
        const response = await api.delete(`/sales/quotes/${id}/`);
        return response.data;
    },

    async acceptQuote(id: number, acceptedItems: any[]) {
        const response = await api.post(`/sales/quotes/${id}/accept_quote/`, {
            accepted_items: acceptedItems
        });
        return response.data;
    },

    async createOrderFromQuote(id: number, deliveryDate: string) {
        const response = await api.post(`/sales/quotes/${id}/create_order/`, {
            delivery_date: deliveryDate
        });
        return response.data;
    },

    // Orders
    async getOrders() {
        const response = await api.get('/sales/orders/');
        return response.data;
    },

    async getOrder(id: number) {
        const response = await api.get(`/sales/orders/${id}/`);
        return response.data;
    },

    async createOrder(orderData: any) {
        const response = await api.post('/sales/orders/', orderData);
        return response.data;
    },

    async updateOrder(id: number, orderData: any) {
        const response = await api.put(`/sales/orders/${id}/`, orderData);
        return response.data;
    },

    async deleteOrder(id: number) {
        const response = await api.delete(`/sales/orders/${id}/`);
        return response.data;
    },
    async confirmOrder(id: number) {
        const response = await api.post(`/sales/orders/${id}/confirm_order/`, {});
        return response.data;
    },

    async startProduction(id: number) {
        const response = await api.post(`/sales/orders/${id}/start_production/`, {});
        return response.data;
    },

    // Quote Requests
    async getQuoteRequests() {
          const response = await api.get('/sales/quote-requests/');
          return response.data;
    },
    async createDemand(data: Partial<{ title: string; description: string; deadline: string; company_id: number; contact_ids: number[]; currency_code: string }>) {
        const response = await api.post('/sales/quote-requests/create_demand/', data || {});
        return response.data;
    },
    async getOpenDemands() {
        const response = await api.get('/sales/quote-requests/open_demands/');
        return response.data;
    },
      async setQuoteRequestStatus(id: number, status: string) {
          const response = await api.post(`/sales/quote-requests/${id}/set_status/`, { status });
          return response.data;
      },

    async getNextQuoteRequestNumber(issueDate?: string) {
        const qs = issueDate ? `?date=${encodeURIComponent(issueDate)}` : '';
        const response = await api.get(`/sales/quote-requests/next_number/${qs}`);
        return response.data;
    },

    async getQuoteRequest(id: number) {
        const response = await api.get(`/sales/quote-requests/${id}/`);
        return response.data;
    },

    async createQuoteRequest(quoteRequestData: any) {
        const response = await api.post('/sales/quote-requests/', quoteRequestData);
        return response.data;
    },

    async updateQuoteRequest(id: number, quoteRequestData: any) {
        const response = await api.put(`/sales/quote-requests/${id}/`, quoteRequestData);
        return response.data;
    },
    async updateQuoteRequestBasic(id: number, data: any) {
        const response = await api.post(`/sales/quote-requests/${id}/update_basic/`, data);
        return response.data;
    },
    async copyQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/copy/`, {});
        return response.data as { id: number; number: string };
    },

    async deleteQuoteRequest(id: number) {
        const response = await api.delete(`/sales/quote-requests/${id}/`);
        return response.data;
    },
    // Soft delete lifecycle
    async softDeleteQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/soft_delete/`, {});
        return response.data;
    },
    async listDeletedQuoteRequests() {
        const response = await api.get(`/sales/quote-requests/deleted/`);
        return response.data;
    },
    async restoreQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/restore/`, {});
        return response.data;
    },
    async purgeQuoteRequest(id: number) {
        const response = await api.delete(`/sales/quote-requests/${id}/purge/`);
        return response.data;
    },
    // Assignment actions
    async takeQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/take/`, {});
        return response.data;
    },
    async joinQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/join/`, {});
        return response.data;
    },
    async leaveQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/leave/`, {});
        return response.data;
    },
    async takeoverQuoteRequest(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/takeover/`, {});
        return response.data;
    },
    // Users and invitations
    async listUsers() {
        const response = await api.get(`/sales/quote-requests/users/`);
        return response.data as Array<{ id: number; name: string; email?: string }>;
    },
    async listInvitations(id: number) {
        const response = await api.get(`/sales/quote-requests/${id}/invitations/`);
        return response.data;
    },
    async inviteUserToRfq(id: number, userId: number) {
        const response = await api.post(`/sales/quote-requests/${id}/invite/`, { user_id: userId });
        return response.data;
    },
    async acceptInvitation(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/accept_invite/`, {});
        return response.data;
    },
    async declineInvitation(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/decline_invite/`, {});
        return response.data;
    },
    async listMyInvitations(status: 'pending' | 'accepted' | 'declined' = 'pending') {
        const response = await api.get(`/sales/quote-requests/my_invitations/?status=${status}`);
        return response.data as Array<{ id: number; quote_request: number; status: string; created_at: string }>;
    },
    async getMyInvitationsCount(status: 'pending' | 'accepted' | 'declined' = 'pending') {
        const response = await api.get(`/sales/quote-requests/my_invitations/?status=${status}`);
        const data = response.data;
        const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        return arr.length as number;
    },

    // RFQ actions
    async setRfqProject(id: number, projectId: number) {
        const response = await api.post(`/sales/quote-requests/${id}/set_project/`, { project_id: projectId });
        return response.data;
    },
    async orderAllFromRfq(id: number) {
        const response = await api.post(`/sales/quote-requests/${id}/order_all/`, {});
        return response.data;
    },
    async orderPartialFromRfq(id: number, itemIds: number[]) {
        const response = await api.post(`/sales/quote-requests/${id}/order_partial/`, { item_ids: itemIds });
        return response.data;
    },

    async addRfqProductItem(
        id: number,
        productId: number,
        quantity: number,
        description: string,
        unit?: string,
        net_unit_price?: number,
        vat_rate?: number,
        discount_percent?: number,
        discount_amount?: number,
        material_id?: number,
    ) {
        const response = await api.post(`/sales/quote-requests/${id}/add_product_item/`, {
            product_id: productId,
            material_id: material_id,
            quantity,
            description,
            unit,
            net_unit_price,
            vat_rate,
            discount_percent,
            discount_amount,
        });
        return response.data;
    },

    async addRfqManufacturingItem(
        id: number,
        manufacturingProductId: number,
        quantity: number,
        description: string,
        unit?: string,
        net_unit_price?: number,
        vat_rate?: number,
        discount_percent?: number,
        discount_amount?: number,
    ) {
        const response = await api.post(`/sales/quote-requests/${id}/add_manufacturing_item/`, {
            manufacturing_product_id: manufacturingProductId,
            quantity,
            description,
            unit,
            net_unit_price,
            vat_rate,
            discount_percent,
            discount_amount,
        });
        return response.data;
    },

    async createRfqManufacturingItem(id: number, data: { name: string; quantity: number; deadline: string; description?: string }) {
        const response = await api.post(`/sales/quote-requests/${id}/create_manufacturing_item/`, data);
        return response.data;
    },

    async addRfqServiceItem(
        id: number,
        serviceId: number,
        quantity: number,
        description: string,
        unit?: string,
        net_unit_price?: number,
        vat_rate?: number,
        discount_percent?: number,
        discount_amount?: number,
    ) {
        const response = await api.post(`/sales/quote-requests/${id}/add_service_item/`, {
            service_id: serviceId,
            quantity,
            description,
            unit,
            net_unit_price,
            vat_rate,
            discount_percent,
            discount_amount,
        });
        return response.data;
    },

    async getQuoteRequestLogs(id: number) {
        const response = await api.get(`/sales/quote-requests/${id}/logs/`);
        return response.data;
    },

    async sendQuoteRequestEmail(id: number, data: { to: string; cc?: string; template_key?: string; signature_key?: string; context?: any; body?: string; subject?: string }) {
        const response = await api.post(`/sales/quote-requests/${id}/send_email/`, data);
        return response.data;
    },
    async renderQuoteRequestEmail(id: number, data: { template_key?: string; signature_key?: string; context?: any; body?: string; subject?: string }) {
        const response = await api.post(`/sales/quote-requests/${id}/render_email/`, data);
        return response.data;
    },

    // RFQ-level attachments
    async getQuoteRequestAttachments(id: number) {
        const response = await api.get(`/sales/quote-requests/${id}/attachments/`);
        return response.data;
    },
    async uploadQuoteRequestAttachment(id: number, file: File, remark?: string) {
        const fd = new FormData();
        fd.append('file', file);
        if (remark) fd.append('remark', remark);
        const response = await api.post(`/sales/quote-requests/${id}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return response.data;
    },
    async updateQuoteRequestAttachmentRemark(id: number, attachmentId: number, remark: string) {
        const response = await api.post(`/sales/quote-requests/${id}/update_attachment_remark/`, { attachment_id: attachmentId, remark });
        return response.data;
    },
    async deleteQuoteRequestAttachment(id: number, attachmentId: number) {
        const response = await api.post(`/sales/quote-requests/${id}/delete_attachment/`, { attachment_id: attachmentId });
        return response.data;
    },

    // Services
    async getServices() {
        const response = await api.get('/sales/services/');
        return response.data;
    },
    async getService(id: number) {
        const response = await api.get(`/sales/services/${id}/`);
        return response.data;
    },
    async searchServices(q: string) {
        const response = await api.get(`/sales/services/search/?q=${encodeURIComponent(q)}`);
        return response.data;
    },
    async createService(data: any) {
        const response = await api.post('/sales/services/', data);
        return response.data;
    },
    async updateService(id: number, data: any) {
        const response = await api.put(`/sales/services/${id}/`, data);
        return response.data;
    },
    async deleteService(id: number) {
        const response = await api.delete(`/sales/services/${id}/`);
        return response.data;
    },

    // Top 10 suggestions
    async getTopProducts() {
        const response = await api.get('/sales/products/top/');
        return response.data;
    },
    async getTopServices() {
        const response = await api.get('/sales/services/top/');
        return response.data;
    },
    async getTopManufacturingProducts() {
        const response = await api.get('/sales/manufacturing-products/top/');
        return response.data;
    },
    // Quote request items CRUD
    async updateQuoteRequestItem(itemId: number, data: Partial<{ quantity: number; unit: string; net_unit_price: number; vat_rate: number; description: string; discount_percent: number; discount_amount: number }>) {
        const response = await api.patch(`/sales/quote-request-items/${itemId}/`, data);
        return response.data;
    },
    async deleteQuoteRequestItem(itemId: number, quoteRequestId?: number) {
        if (quoteRequestId) {
            const response = await api.post(`/sales/quote-requests/${quoteRequestId}/delete_item/`, { item_id: itemId });
            return response.data;
        }
        const response = await api.delete(`/sales/quote-request-items/${itemId}/`);
        return response.data;
    },
    // Quote request item attachments
    async getQuoteRequestItemAttachments(itemId: number) {
        const response = await api.get(`/sales/quote-request-items/${itemId}/attachments/`);
        return response.data;
    },
    async uploadQuoteRequestItemAttachment(itemId: number, file: File, remark?: string) {
        const fd = new FormData();
        fd.append('file', file);
        if (remark) fd.append('remark', remark);
        const response = await api.post(`/sales/quote-request-items/${itemId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return response.data;
    },
    async updateQuoteRequestItemAttachmentRemark(itemId: number, attachmentId: number, remark: string) {
        const response = await api.post(`/sales/quote-request-items/${itemId}/update_attachment_remark/`, { attachment_id: attachmentId, remark });
        return response.data;
    },
    async deleteQuoteRequestItemAttachment(itemId: number, attachmentId: number) {
        await api.post(`/sales/quote-request-items/${itemId}/delete_attachment/`, { attachment_id: attachmentId });
    },

    // Costs
    async getQuoteRequestCosts(rfqId: number) {
        const response = await api.get(`/sales/quote-request-costs/?quote_request=${rfqId}`);
        return (response.data.results ?? response.data);
    },
    async createQuoteRequestCost(data: any) {
        const response = await api.post('/sales/quote-request-costs/', data);
        return response.data;
    },
    async updateQuoteRequestCost(id: number, data: any) {
        const response = await api.patch(`/sales/quote-request-costs/${id}/`, data);
        return response.data;
    },
    async deleteQuoteRequestCost(id: number) {
        await api.delete(`/sales/quote-request-costs/${id}/`);
    },

    // Customer Orders - New System
    async getCustomerOrders(params?: any) {
        const response = await api.get('/sales/customer-orders/', { params });
        return response.data;
    },
    async getCustomerOrder(id: number) {
        const response = await api.get(`/sales/customer-orders/${id}/`);
        return response.data;
    },
    
    // Work Logs
    async getWorkLogs(params?: any) {
        const response = await api.get('/sales/work-logs/', { params });
        return response.data;
    },
    async getFrequentWorkflows() {
        const response = await api.get('/sales/work-logs/frequent_workflows/');
        return response.data;
    },
    async getActiveWorkLog() {
        const response = await api.get('/sales/work-logs/active/');
        return response.data;
    },
    async startWorkLog(data: { order_id: number; item_id?: number | null; workflow_name?: string }) {
        const response = await api.post('/sales/work-logs/start/', data);
        return response.data;
    },
    async stopWorkLog(id: number) {
        const response = await api.post(`/sales/work-logs/${id}/stop/`, {});
        return response.data;
    },

    // Chat
    async getChatThread(params: { rfq_id?: number, order_id?: number }) {
        const response = await api.get('/sales/chats/find/', { params });
        return response.data;
    },
    
    // Invitations and Assignees
    async cancelInvitation(rfqId: number, invitationId: number) {
        const response = await api.post(`/sales/quote-requests/${rfqId}/cancel_invitation/`, { invitation_id: invitationId });
        return response.data;
    },
    async removeAssignee(rfqId: number, userId: number) {
        const response = await api.post(`/sales/quote-requests/${rfqId}/remove_assignee/`, { user_id: userId });
        return response.data;
    },
    async sendMessage(threadId: number, content: string, files?: File[]) {
        const formData = new FormData();
        if (content) formData.append('content', content);
        if (files) {
            files.forEach(f => {
                if (f) formData.append('files', f);
            });
        }
        const response = await api.post(`/sales/chats/${threadId}/message/`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        });
        return response.data;
    },
    async promoteAttachment(threadId: number, data: { attachment_id: number; target_type: 'rfq'|'rfq_item'|'order'; target_id: number }) {
        const response = await api.post(`/sales/chats/${threadId}/promote_attachment/`, data);
        return response.data;
    },
    async reorderRfqItems(id: number, items: { id: number; sort_order: number; parent_id: number | null }[]) {
        const response = await api.post(`/sales/quote-requests/${id}/reorder_items/`, items);
        return response.data;
    },
    async getCustomerOrderDetailedItems(id: number) {
        const response = await api.get(`/sales/customer-orders/${id}/detailed_items/`);
        return response.data;
    },
    async getItemWorkSheet(orderId: number, itemId: number) {
        const response = await api.get(`/sales/customer-orders/${orderId}/item_work_sheet/?item_id=${itemId}`, { responseType: 'blob' });
        return response;
    }
};

