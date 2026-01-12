import api from './api';

export const crmService = {
    // Companies
    async getCompanies() {
        const response = await api.get('/crm/companies/');
        return response.data;
    },

    async getCompany(id: number) {
        const response = await api.get(`/crm/companies/${id}/`);
        return response.data;
    },

    async createCompany(data: any) {
        const response = await api.post('/crm/companies/', data);
        return response.data;
    },

    async updateCompany(id: number, data: any) {
        const response = await api.put(`/crm/companies/${id}/`, data);
        return response.data;
    },

    async deleteCompany(id: number, action: string = 'delete_all', reassignCompanyId?: number) {
        let url = `/crm/companies/${id}/?action=${action}`;
        if ((action === 'reassign_all' || action === 'reassign_contacts') && reassignCompanyId) {
            url += `&reassign_to=${reassignCompanyId}`;
        }
        const response = await api.delete(url);
        return response.data;
    },

    async searchCompanies(query: string) {
        const response = await api.get(`/crm/companies/search/?q=${encodeURIComponent(query)}`);
        return response.data;
    },

    async lookupCompanyByNav(tax: string, opts?: { debug?: boolean }) {
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
                    found: Boolean(name || postal_code || city || street_name),
                };
            }
            return null;
        };

        // 1) Elsődleges: Finance POST endpoint
        let financeHostDown: string | undefined;
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
            // Ha success:false, essünk vissza a CRM GET-re, hogy megmaradjon a meglévő debug útvonal
        } catch (err) {
            if (opts?.debug) {
                // eslint-disable-next-line no-console
                console.warn('[CRM] NAV lookup (finance) ✖ error, falling back to CRM GET', err);
            }
                const host = (err as any)?.response?.data?.host;
            if (host) financeHostDown = host;
        }

        // 2) Visszaesés: CRM GET endpoint (debug info-val)
        const params = new URLSearchParams();
        if (tax8) params.set('tax8', tax8);
        if (digits) params.set('tax', digits);
        if (opts?.debug) params.set('debug', '1');
        const url = `/crm/companies/nav_lookup/?${params.toString()}`;
        try {
            if (opts?.debug) {
                // eslint-disable-next-line no-console
                console.log('[CRM] NAV lookup (crm) → GET', url, { tax, digits, tax8 });
            }
            const response = await api.get(url, { validateStatus: (s) => (s >= 200 && s < 300) || s === 404 });
            if (opts?.debug) {
                // eslint-disable-next-line no-console
                console.log('[CRM] NAV lookup (crm) ← response', response.status, response.data);
            }
            const d = response.data;
            if (financeHostDown) {
                (d.debug || (d.debug = {}));
                (d.debug.finance || (d.debug.finance = {}));
                d.debug.finance.host = financeHostDown;
            }
            if (d && d.found === false && d?.debug?.primary?.data) {
                const normalized = normalizeFromNav(d.debug.primary.data);
                if (normalized) return normalized;
            }
            return d;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[CRM] NAV lookup (crm) ✖ error', { url, tax, digits, tax8, err });
            if (financeHostDown) {
                return { found: false, debug: { finance: { host: financeHostDown } } };
            }
            throw err;
        }
    },

    // Contacts
    async getContacts() {
        const response = await api.get('/crm/contacts/');
        return response.data;
    },

    async getContact(id: number) {
        const response = await api.get(`/crm/contacts/${id}/`);
        return response.data;
    },

    async createContact(data: any) {
        const response = await api.post('/crm/contacts/', data);
        return response.data;
    },

    async updateContact(id: number, data: any) {
        const response = await api.put(`/crm/contacts/${id}/`, data);
        return response.data;
    },

    async deleteContact(id: number) {
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
        const response = await api.get(`/crm/contacts/search/?q=${encodeURIComponent(query)}`);
        return response.data;
    },
};
