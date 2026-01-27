import api from './api';

type NavLookupResult = {
    name: string;
    company_type: string;
    tax_number: string;
    group_tax_number: string;
    eu_tax_number: string;
    country: string;
    postal_code: string;
    city: string;
    street_name: string;
    street_type: string;
    house_number: string;
    full_address: string;
    vat_code: string;
    county_code: string;
    full_tax_number: string;
    vat_group_id: string;
    vat_group_member_tax_number: string;
    found: boolean;
};

export const crmService = {
    // Companies
    async getCompanies(params?: Record<string, any>) {
        const response = await api.get('/crm/companies/', { params });
        return response.data;
    },
    async getCompany(id: number | string) {
        const response = await api.get(`/crm/companies/${id}/`);
        return response.data;
    },

    async createCompany(data: any) {
        const response = await api.post('/crm/companies/', data);
        return response.data;
    },

    async updateCompany(id: number | string, data: any) {
        const response = await api.put(`/crm/companies/${id}/`, data);
        return response.data;
    },

    async deleteCompany(id: number | string) {
        const response = await api.delete(`/crm/companies/${id}/`);
        return response.data;
    },

    async searchCompanies(query: string) {
        const response = await api.get('/crm/companies/', { params: { q: query } });
        return response.data?.results || response.data;
    },
    async lookupCompanyByNav(tax: string, opts?: { debug?: boolean }): Promise<NavLookupResult | { found: false }> {
        const digits = String(tax || '').replace(/[^0-9]/g, '');
        const tax8 = digits.slice(0, 8);
        // Normalizáló util a NAV válaszhoz
        const normalizeFromNav = (d: any) => {
            if (!d) return null;
            if (d.taxpayer_name || d.taxpayer_address_list) {
                const name = d.taxpayer_short_name || d.taxpayer_name || '';
                const tdet = d.tax_number_detail || {};
                const tpid = tdet.taxpayerId || d.taxpayerId || '';
                const vatc = (tdet.vatCode ?? '').toString();
                const ctyc = (tdet.countyCode ?? '').toString();
                const taxNumber = tpid && vatc && ctyc ? `${tpid}-${vatc}-${ctyc}` : (tpid || '');
                const euTax = tpid ? `HU${tpid}` : '';
                const list = d.taxpayer_address_list || [];
                let addr = list.find((a: any) => a?.taxpayerAddressType === 'HQ') || list[0] || {};
                const countryCode = addr.countryCode || 'HU';
                const country = countryCode === 'HU' ? 'Magyarország' : countryCode;
                const postal_code = addr.postalCode || '';
                const city = addr.city || '';
                const street_name = addr.streetName || addr.street || '';
                let street_type = addr.publicPlaceCategory || addr.streetType || 'utca';
                if (String(street_type).toUpperCase() === 'N/A') street_type = 'utca';
                const house_number = addr.number || addr.houseNumber || '';
                const parts = [postal_code, city, street_name, street_type, house_number].filter(Boolean);
                const full_address = parts.join(' ');
                return {
                    name,
                    company_type: 'customer',
                    tax_number: taxNumber || `${tax8}--`,
                    group_tax_number: '',
                    eu_tax_number: euTax,
                    country,
                    postal_code,
                    city,
                    street_name,
                    street_type,
                    house_number,
                    full_address,
                    
                    // Extra mezők, amik a modellben benne vannak
                    vat_code: vatc,
                    county_code: ctyc,
                    full_tax_number: taxNumber,
                    vat_group_id: d.vat_group_membership?.vatGroupId || '',
                    vat_group_member_tax_number: d.vat_group_membership?.vatGroupMemberTaxNumber || '',
                    
                    found: Boolean(name || postal_code || city || street_name),
                };
            }
            return null;
        };

        // PixInvoice/Finance lookup via backend proxy
        try {
            if (opts?.debug) {
                // eslint-disable-next-line no-console
                console.log('[CRM] NAV lookup (finance) → POST /finance/pixinvoice/lookup-taxpayer/', { tax: digits, tax8 });
            }
            const fr = await api.post('/finance/pixinvoice/lookup-taxpayer/', { tax_number: digits });
            if (opts?.debug) {
                // eslint-disable-next-line no-console
                console.log('[CRM] NAV lookup (finance) ← response', fr.status, fr.data);
            }
            const ok = fr?.data?.success;
            const navPayload = fr?.data?.data;
            if (ok && navPayload) {
                const normalized = normalizeFromNav(navPayload);
                if (normalized) return normalized;
            }
        } catch (err) {
            if (opts?.debug) {
                // eslint-disable-next-line no-console
                console.warn('[CRM] NAV lookup (finance) ✖ error', err);
            }
        }
        return { found: false };
    },

    // Contacts
    async getContacts(params?: Record<string, any>) {
        const response = await api.get('/crm/contacts/', { params });
        return response.data;
    },

    async getContact(id: number | string) {
        const response = await api.get(`/crm/contacts/${id}/`);
        return response.data;
    },

    async createContact(data: any) {
        const response = await api.post('/crm/contacts/', data);
        return response.data;
    },

    async updateContact(id: number | string, data: any) {
        const response = await api.put(`/crm/contacts/${id}/`, data);
        return response.data;
    },

    async deleteContact(id: number | string) {
        const response = await api.delete(`/crm/contacts/${id}/`);
        return response.data;
    },

    async getContactsByCompany(companyId: number | string) {
        const response = await api.get(`/crm/contacts/by_company/?company_id=${companyId}`);
        return response.data;
    },

    async getPrivateContacts() {
        const response = await api.get(`/crm/contacts/by_company/?company_id=private`);
        return response.data;
    },

    async searchContacts(query: string) {
        const response = await api.get('/crm/contacts/', { params: { q: query } });
        return response.data?.results || response.data;
    },

    async validateEuVat(data: { vat_number: string }) {
        const response = await api.post('/crm/companies/validate_eu_vat/', data);
        return response.data;
    },
};
