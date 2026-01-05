export const SELECTED_COMPANY_KEY = 'selectedCompanyId';

export function getSelectedCompanyId() {
  try {
    return localStorage.getItem(SELECTED_COMPANY_KEY) || '';
  } catch {
    return '';
  }
}

export function setSelectedCompanyId(id) {
  try {
    if (id) localStorage.setItem(SELECTED_COMPANY_KEY, id);
  } catch {}
}

