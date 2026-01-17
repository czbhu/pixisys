import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Save, ArrowLeft, Building2, Search } from 'lucide-react';
import styled from 'styled-components';
// ...existing code...
import { companyAPI, customerAPI, customerBankAccountAPI, companyBankAccountAPI } from '../services/api';

const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 600px;
  margin: 0 auto;
`;

const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ecf0f1;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: ${props => props.variant === 'primary' ? '#3498db' : props.variant === 'secondary' ? '#95a5a6' : '#e74c3c'};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'primary' ? '#2980b9' : props.variant === 'secondary' ? '#7f8c8d' : '#c0392b'};
    transform: translateY(-1px);
  }

  &:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
    transform: none;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 24px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #34495e;
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const ErrorMessage = styled.span`
  color: #e74c3c;
  font-size: 12px;
  margin-top: 4px;
  display: block;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const FormSectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 24px 0 16px 0;
  color: #34495e;
  border-bottom: 2px solid #3498db;
  padding-bottom: 8px;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ToggleLabel = styled.label`
  font-size: 14px;
  color: #34495e;
`;

// Bank accounts UI (aligned with CustomerForm)
const BankAccountsSection = styled.div`
  margin-top: 24px;
  background: white;
  border-radius: 8px;
  border: 1px solid #ecf0f1;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;
const BankHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #ecf0f1;
`;

const BankTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  color: #2c3e50;
`;

const BankActions = styled.div`
  display: flex;
  gap: 8px;
`;

const BankList = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 12px 16px;
`;

const BankCard = styled.div`
  background: #fff;
  border: 1px solid #ecf0f1;
  border-radius: 8px;
  padding: 12px;
  &.primary {
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52,152,219,0.12);
    background: #f7fbff;
  }
`;

const BankRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
`;

const SmallSelect = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
`;
//
// Remove duplicate/malformed ToggleRow

const SmallInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
`;

const PrimaryBadge = styled.span`
  background: #3498db;
  color: white;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 12px;
`;

// Kereshető Select komponens stílusok
const SearchableSelect = styled.div`
  position: relative;
  width: 100%;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ddd;
  border-top: none;
  border-radius: 0 0 6px 6px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const DropdownItem = styled.div`
  padding: 12px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f8f9fa;

  &:hover {
    background-color: #f8f9fa;
  }

  &.selected {
    background-color: #e3f2fd;
    color: #1976d2;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const CustomerName = styled.div`
  font-weight: 500;
  color: #2c3e50;
`;

const CustomerDetails = styled.div`
  font-size: 12px;
  color: #7f8c8d;
  margin-top: 2px;
`;

// Országok listája (legtöbbször használt 5 elöl) - magyarul
const COUNTRIES = [
  'Magyarország', 'Németország', 'Ausztria', 'Szlovákia', 'Románia',
  'Horvátország', 'Szlovénia', 'Lengyelország', 'Csehország', 'Olaszország',
  'Franciaország', 'Spanyolország', 'Hollandia', 'Belgium', 'Svájc',
  'Egyesült Királyság', 'Írország', 'Dánia', 'Svédország', 'Norvégia',
  'Finnország', 'Észtország', 'Lettország', 'Litvánia', 'Portugália',
  'Görögország', 'Bulgária', 'Szerbia', 'Bosznia-Hercegovina',
  'Montenegró', 'Észak-Macedónia', 'Albánia', 'Moldova', 'Ukrajna',
  'Fehéroroszország', 'Oroszország', 'Törökország', 'Egyesült Államok', 'Kanada',
  'Ausztrália', 'Új-Zéland', 'Japán', 'Kína', 'India',
  'Brazília', 'Argentína', 'Mexikó', 'Dél-Afrika', 'Egyéb'
];

// Közterület típusok listája (legtöbbször használt 5 elöl)
const PUBLIC_PLACE_CATEGORIES = [
  'ÚT', 'TÉR', 'KÖZ', 'SÉTÁLY', 'KERT',
  'UTCA', 'ÚTJA', 'SOR', 'FASOR', 'PARK',
  'SÉTÁNY', 'RÉSZ', 'DŰLŐ', 'LEJTŐ', 'VÖLGY',
  'HEGY', 'DOMB', 'RÉT', 'MEZŐ', 'ERDŐ',
  'VÍZ', 'PART', 'SZIGET', 'FOK', 'CSÚCS',
  'HÁT', 'VÉG', 'SZÉL', 'SAROK', 'KÖZPONT',
  'KÖR', 'KÖRÚT', 'BOULEVARD', 'AVENUE', 'STREET',
  'PLACE', 'SQUARE', 'PARK', 'GARDEN', 'PROMENADE',
  'WALK', 'LANE', 'ROAD', 'DRIVE', 'COURT',
  'CIRCLE', 'CIRCUIT', 'BOULEVARD', 'AVENUE', 'OTHER'
];

// Kereshető Select komponens
const SearchableSelectComponent = ({ 
  value, 
  onChange, 
  options = [], 
  placeholder, 
  className,
  id,
  name
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(Array.isArray(options) ? options : []);

  // Ékezetes betűk eltávolítása a kereséshez
  const removeAccents = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  const toText = (opt) => {
    if (opt == null) return '';
    if (typeof opt === 'string') return opt;
    if (typeof opt === 'object') {
      return `${opt.name || ''} ${opt.tax_number || ''} ${opt.email || ''}`.trim();
    }
    return String(opt);
  };

  const norm = (s) => removeAccents(String(s ?? '')).toLowerCase();

  React.useEffect(() => {
    const arr = Array.isArray(options) ? options : [];
    const term = norm(searchTerm);
    const filtered = arr.filter((option) => norm(toText(option)).includes(term));
    setFilteredOptions(filtered);
  }, [searchTerm, options]);

  const handleSelect = (option) => {
    onChange(option);
    const label = typeof option === 'string' ? option : (option?.name || '');
    setSearchTerm(label);
    setIsOpen(false);
  };

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleInputFocus = (e) => {
    setIsOpen(true);
    // Kijelöli a teljes szöveget, hogy ha elkezdünk írni, felülírja
    e.target.select();
  };

  const handleInputBlur = () => {
    // Kis késleltetés, hogy a kattintás működjön
    setTimeout(() => setIsOpen(false), 150);
  };

  // Beállítjuk a keresőmezőt a kiválasztott érték címkéjére
  React.useEffect(() => {
    if (value == null) return;
    const label = typeof value === 'string' ? value : (value?.name || '');
    setSearchTerm(label);
  }, [value]);

  return (
    <SearchableSelect>
      <SearchInput
        id={id}
        name={name}
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {isOpen && filteredOptions.length > 0 && (
        <Dropdown>
          {filteredOptions.map((option, index) => (
            <DropdownItem
              key={option.id || index}
              onClick={() => handleSelect(option)}
              className={(typeof value === 'object' && value?.id && option?.id && value.id === option.id) || (typeof value === 'string' && typeof option === 'string' && value === option) ? 'selected' : ''}
            >
              {typeof option === 'string' ? (
                option
              ) : (
                <>
                  <CustomerName>{option.name}</CustomerName>
                  <CustomerDetails>
                    {option.tax_number && `Adószám: ${option.tax_number}`}
                    {option.email && ` • E-mail: ${option.email}`}
                  </CustomerDetails>
                </>
              )}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </SearchableSelect>
  );
};

const CompanyForm = () => {
  const { id } = useParams();

  const toggleXmlLogging = async (enabled) => {
    try {
      await companyAPI.toggleXmlLogging(id, enabled);
      toast.success(enabled ? 'XML mentés bekapcsolva' : 'XML mentés kikapcsolva és a naplók törölve');
      queryClient.invalidateQueries(['company', id]);
    } catch (err) {
      toast.error('Hiba az XML mentés kapcsolásakor');
    }
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const DRAFT_KEY = React.useMemo(() => (isEdit ? `company_form_draft_${id}` : 'company_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  // Edit-mode import helper state (must be declared before any early return)
  const [importCustomer, setImportCustomer] = useState(null);

  const { data: company, isLoading: companyLoading } = useQuery(
    ['company', id],
    () => companyAPI.getCompany(id),
    {
      enabled: isEdit,
      select: (response) => response.data
    }
  );

  // Bank accounts state (like CustomerForm)
  const [bankAccounts, setBankAccounts] = useState([]);
  const originalCompanyBankAccountIdsRef = React.useRef(new Set());

  // Load company bank accounts for edit
  const companyBankQuery = useQuery(
    ['company-bank-accounts', id],
    () => companyBankAccountAPI.getAccounts({ company_id: id }),
    {
      enabled: isEdit,
      select: (res) => res.data?.results || res.data || [],
        onSuccess: (rows) => {
          setBankAccounts(rows.map(r => ({
            id: r.id,
            bank_name: r.bank_name || '',
            account_number: r.account_number || '',
            iban: r.iban || '',
            swift_bic: r.swift_bic || '',
            currency: r.currency || 'HUF',
            is_primary: !!r.is_primary,
            round_transfer_to_whole: !!r.round_transfer_to_whole,
          })));
          originalCompanyBankAccountIdsRef.current = new Set(rows.map(r => r.id));
        }
    }
  );

  const { data: customers, isLoading: customersLoading, error: customersError } = useQuery(
    ['customers'],
    () => customerAPI.getCustomers(),
    {
      select: (response) => response.data?.results || []
    }
  );

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    defaultValues: {
      name: '',
      short_name: '',
      tax_number: '',
      full_tax_number: '',
      vat_code: '',
      county_code: '',
      eu_tax_number: '',
      vat_group_id: '',
      vat_group_member_tax_number: '',
      address: '',
      street_name: '',
      public_place_category: '',
      street_number: '',
      building: '',
      staircase: '',
      floor: '',
      door: '',
      city: '',
      postal_code: '',
      country: 'Magyarország',
      email: '',
      phone: '',
      is_active: true
    }
  });

  // Load draft (new only)
  React.useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data || {}).forEach(([k, v]) => setValue(k, v));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY, isEdit]);

  // Persist draft (new only)
  React.useEffect(() => {
    if (isEdit) return;
    let t = null;
    const sub = watch((value) => {
      clearTimeout(t);
      t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch {} }, 300);
    });
    return () => { sub.unsubscribe(); clearTimeout(t); };
  }, [watch, DRAFT_KEY, isEdit]);

  // Keep draft only on refresh (new only)
  React.useEffect(() => {
    if (isEdit) return;
    const beforeUnload = () => { try { localStorage.setItem(KEEP_FLAG_KEY, '1'); } catch {} };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      let keep = false;
      try { keep = localStorage.getItem(KEEP_FLAG_KEY) === '1'; } catch {}
      if (!keep) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
      }
      try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
    };
  }, [KEEP_FLAG_KEY, DRAFT_KEY, isEdit]);

  const createCompanyMutation = useMutation(
    (data) => companyAPI.createCompany(data),
    {
      onSuccess: async (resp) => {
        const cid = resp?.data?.id;
        // Szerver oldali import az ügyféltől (cím + bankszámlák), ha ügyfélből hoztuk létre
        if (cid && selectedCustomer?.id) {
          try {
            await companyAPI.importFromCustomer(cid, { customer_id: selectedCustomer.id, include_accounts: true });
          } catch (e) {
            console.warn('Szerver oldali import sikertelen', e);
          }
        }

        // Formon hozzáadott extra bankszámlák létrehozása
        try {
          if (cid && bankAccounts.length) {
            await Promise.all(
              bankAccounts
                .filter(b => b.bank_name || b.account_number || b.iban)
                .map(b => companyBankAccountAPI.createAccount({ ...b, company: cid }))
            );
          }
        } catch (e) {
          console.warn('Cég bankszámlák létrehozása sikertelen', e);
        }

        queryClient.invalidateQueries(['companies']);
        toast.success('Cég létrehozva');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/companies');
      },
      onError: (error) => {
        toast.error('Hiba történt a cég létrehozása során');
        console.error('Create company error:', error);
      }
    }
  );

  const updateCompanyMutation = useMutation(
    (data) => companyAPI.updateCompany(id, data),
    {
      onSuccess: async () => {
        queryClient.invalidateQueries(['companies']);
        queryClient.invalidateQueries(['company', id]);
        toast.success('Cég frissítve');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        // Upsert company bank accounts
        try {
          const currentIds = new Set();
          for (const b of bankAccounts) {
            if (b.id) {
              currentIds.add(b.id);
              await companyBankAccountAPI.updateAccount(b.id, { ...b, company: id });
            } else if (b.bank_name || b.account_number || b.iban) {
              const res = await companyBankAccountAPI.createAccount({ ...b, company: id });
              currentIds.add(res?.data?.id);
            }
          }
          for (const oldId of Array.from(originalCompanyBankAccountIdsRef.current)) {
            if (!currentIds.has(oldId)) {
              await companyBankAccountAPI.deleteAccount(oldId);
            }
          }
          originalCompanyBankAccountIdsRef.current = currentIds;
        } catch (e) {
          console.warn('Cég bankszámlák upsert hiba', e);
        }
        navigate('/settings/companies');
      },
      onError: (error) => {
        toast.error('Hiba történt a cég frissítése során');
        console.error('Update company error:', error);
      }
    }
  );

  React.useEffect(() => {
    if (company) {
      setValue('name', company.name);
      setValue('short_name', company.short_name || '');
      setValue('tax_number', company.tax_number);
      setValue('full_tax_number', company.full_tax_number || '');
      setValue('vat_code', company.vat_code || '');
      setValue('county_code', company.county_code || '');
      setValue('eu_tax_number', company.eu_tax_number || '');
      setValue('vat_group_id', company.vat_group_id || '');
      setValue('vat_group_member_tax_number', company.vat_group_member_tax_number || '');
      setValue('address', company.address || '');
      setValue('street_name', company.street_name || '');
      setValue('public_place_category', company.public_place_category || '');
      setValue('street_number', company.street_number || '');
      setValue('building', company.building || '');
      setValue('staircase', company.staircase || '');
      setValue('floor', company.floor || '');
      setValue('door', company.door || '');
      setValue('city', company.city);
      setValue('postal_code', company.postal_code);
      setValue('country', company.country);
      setValue('email', company.email || '');
      setValue('phone', company.phone || '');
      setValue('is_active', company.is_active);
    }
  }, [company, setValue]);

  const onSubmit = (data) => {
    const payload = { ...data };
    if (!isEdit && selectedCustomer?.id) {
      payload.source_customer_id = selectedCustomer.id;
    }
    if (isEdit) {
      updateCompanyMutation.mutate(payload);
    } else {
      createCompanyMutation.mutate(payload);
    }
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    // Automatikusan kitöltjük a mezőket az ügyfél adataival
    setValue('name', customer.name);
    setValue('short_name', customer.short_name || '');
    setValue('tax_number', customer.tax_number);
    setValue('full_tax_number', customer.full_tax_number || '');
    setValue('vat_code', customer.vat_code || '');
    setValue('county_code', customer.county_code || '');
    setValue('eu_tax_number', customer.eu_tax_number || '');
    setValue('vat_group_id', customer.vat_group_id || '');
    setValue('vat_group_member_tax_number', customer.vat_group_member_tax_number || '');
    const buildAddress = (c) => {
      if (c.address) return c.address;
      const parts = [
        [c.postal_code, c.city].filter(Boolean).join(' '),
        [c.street_name, c.public_place_category, c.street_number].filter(Boolean).join(' '),
        [c.building, c.staircase, c.floor, c.door].filter(Boolean).join(' ')
      ].filter(s => s && s.trim()).join(', ');
      return parts;
    };
    setValue('address', buildAddress(customer));
    setValue('street_name', customer.street_name || '');
    setValue('public_place_category', customer.public_place_category || '');
    setValue('street_number', customer.street_number || '');
    setValue('building', customer.building || '');
    setValue('staircase', customer.staircase || '');
    setValue('floor', customer.floor || '');
    setValue('door', customer.door || '');
    setValue('city', customer.city);
    setValue('postal_code', customer.postal_code);
    setValue('country', customer.country);
    setValue('email', customer.email || '');
    setValue('phone', customer.phone || '');
  };

  if (companyLoading || customersLoading) {
    return (
      <FormContainer>
        <LoadingSpinner>Adatok betöltése...</LoadingSpinner>
      </FormContainer>
    );
  }

  if (customersError) {
    return (
      <FormContainer>
        <div>Hiba történt az ügyfelek betöltése során: {customersError.message}</div>
      </FormContainer>
    );
  }

  // Edit-mode: import from customer (server-side) and reflect back into form
  const handleImportFromCustomer = async (includeAccounts = false) => {
    const c = importCustomer;
    if (!c || !isEdit) return;
    try {
      const res = await companyAPI.importFromCustomer(id, { customer_id: c.id, include_accounts: includeAccounts });
      const comp = res?.data || {};
      const fields = ['address','street_name','public_place_category','street_number','building','staircase','floor','door','city','postal_code','country'];
      fields.forEach(f => setValue(f, comp[f] || ''));
      const rows = comp.bank_accounts || [];
      setBankAccounts(rows.map(r => ({
        id: r.id,
        bank_name: r.bank_name || '',
        account_number: r.account_number || '',
        iban: r.iban || '',
        swift_bic: r.swift_bic || '',
        currency: r.currency || 'HUF',
        is_primary: !!r.is_primary,
        round_transfer_to_whole: !!r.round_transfer_to_whole,
      })));
      originalCompanyBankAccountIdsRef.current = new Set(rows.map(r => r.id));
      toast.success('Adatok átvétele kész');
    } catch (e) {
      console.warn('Import hiba', e);
      toast.error('Import sikertelen');
    }
  };

  return (
    <FormContainer>
      <FormHeader>
        <Title>
          <Building2 size={24} />
          {isEdit ? 'Cég szerkesztése' : 'Új cég létrehozása'}
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings/companies')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={createCompanyMutation.isLoading || updateCompanyMutation.isLoading}
          >
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Létrehozás'}
          </Button>
        </ButtonGroup>
      </FormHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        {!isEdit && (
          <FormGroup>
            <Label htmlFor="customer">Ügyfél kiválasztása *</Label>
            <SearchableSelectComponent
              id="customer"
              value={selectedCustomer}
              onChange={handleCustomerSelect}
              options={customers || []}
              placeholder="Keresés ügyfél neve, adószám vagy e-mail alapján..."
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#7f8c8d' }}>
              Válasszon egy ügyfelet, akiből céget szeretne létrehozni. Az ügyfél adatai automatikusan kitöltődnek.
            </div>
          </FormGroup>
        )}

        {id && (
          <FormGroup>
            <ToggleRow>
              <input
                id="xml_logging_enabled"
                type="checkbox"
                checked={watch('xml_logging_enabled') || false}
                onChange={(e) => {
                  const val = e.target.checked;
                  setValue('xml_logging_enabled', val);
                  toggleXmlLogging(val);
                }}
              />
              <ToggleLabel htmlFor="xml_logging_enabled">XML mentés az xml_logs mappába</ToggleLabel>
            </ToggleRow>
          </FormGroup>
        )}

        {isEdit && (
          <FormGroup>
            <Label htmlFor="import_customer">Ügyfél adatainak átvétele (opcionális)</Label>
            <SearchableSelectComponent
              id="import_customer"
              value={importCustomer}
              onChange={setImportCustomer}
              options={customers || []}
              placeholder="Keresés ügyfél neve, adószám vagy e-mail alapján..."
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button type="button" variant="secondary" onClick={() => handleImportFromCustomer(false)}>Csak cím átvétele</Button>
              <Button type="button" variant="secondary" onClick={() => handleImportFromCustomer(true)}>Cím + bankszámlák átvétele</Button>
            </div>
          </FormGroup>
        )}

        <FormGroup>
          <Label htmlFor="name">Cég neve *</Label>
          <Input
            id="name"
            {...register('name', { required: 'Cég neve kötelező' })}
            className={errors.name ? 'error' : ''}
            placeholder="Cég neve"
          />
          {errors.name && (
            <ErrorMessage>{errors.name.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="short_name">Rövid név</Label>
          <Input
            id="short_name"
            {...register('short_name')}
            placeholder="Rövid név"
          />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="tax_number">Adószám *</Label>
          <Input
            id="tax_number"
            {...register('tax_number', { required: 'Adószám kötelező' })}
            className={errors.tax_number ? 'error' : ''}
            placeholder="12345678"
          />
          {errors.tax_number && (<ErrorMessage>{errors.tax_number.message}</ErrorMessage>)}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="full_tax_number">Teljes adószám</Label>
          <Input id="full_tax_number" {...register('full_tax_number')} placeholder="12345678-1-23" />
        </FormGroup>

        <FormGroup>
          <Label>Adószám kiegészítők</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input id="vat_code" {...register('vat_code')} placeholder="ÁFA kód (pl. 1)" />
            <Input id="county_code" {...register('county_code')} placeholder="Megye kód (pl. 23)" />
          </div>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="eu_tax_number">EU adószám</Label>
          <Input id="eu_tax_number" {...register('eu_tax_number')} placeholder="HU12345678" />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="vat_group_id">Csoport azonosító</Label>
          <Input id="vat_group_id" {...register('vat_group_id')} placeholder="Csoport azonosító" />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="vat_group_member_tax_number">Csoport tag adószáma</Label>
          <Input id="vat_group_member_tax_number" {...register('vat_group_member_tax_number')} placeholder="Tag adószám" />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="city">Város *</Label>
          <Input
            id="city"
            {...register('city', { required: 'Város kötelező' })}
            className={errors.city ? 'error' : ''}
            placeholder="Város"
          />
          {errors.city && (
            <ErrorMessage>{errors.city.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="postal_code">Irányítószám *</Label>
          <Input
            id="postal_code"
            {...register('postal_code', { required: 'Irányítószám kötelező' })}
            className={errors.postal_code ? 'error' : ''}
            placeholder="1234"
          />
          {errors.postal_code && (
            <ErrorMessage>{errors.postal_code.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormSectionTitle>Részletes cím adatok</FormSectionTitle>
        <FormGroup>
          <Label>Részletes cím</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <Input id="street_name" {...register('street_name')} placeholder="Utca" />
            <SearchableSelectComponent
              id="public_place_category"
              value={watch('public_place_category') || ''}
              onChange={(val) => setValue('public_place_category', val)}
              options={PUBLIC_PLACE_CATEGORIES}
              placeholder="Közterület típusa"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
            <Input id="street_number" {...register('street_number')} placeholder="Házszám" />
            <Input id="building" {...register('building')} placeholder="Épület" />
            <Input id="staircase" {...register('staircase')} placeholder="Lépcsőház" />
            <Input id="floor" {...register('floor')} placeholder="Emelet" />
          </div>
          <div style={{ marginTop: 8 }}>
            <Input id="door" {...register('door')} placeholder="Ajtó" />
          </div>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="country">Ország *</Label>
          <SearchableSelectComponent
            id="country"
            value={watch('country') || ''}
            onChange={(val) => setValue('country', val)}
            options={COUNTRIES}
            placeholder="Válasszon országot..."
          />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register('email')} placeholder="email@example.com" />
        </FormGroup>

        <FormSectionTitle>Bankszámlák</FormSectionTitle>
        <BankAccountsSection>
          <BankHeader>
            <BankTitle>Banki adatok</BankTitle>
            <BankActions>
              <Button type="button" variant="secondary" onClick={() => setBankAccounts([
                ...bankAccounts,
                { bank_name: '', account_number: '', iban: '', swift_bic: '', currency: 'HUF', is_primary: bankAccounts.length === 0, round_transfer_to_whole: false }
              ])}>
                Új bankszámla
              </Button>
            </BankActions>
          </BankHeader>
          <BankList>
            {bankAccounts.length === 0 && (
              <div style={{ color: '#7f8c8d' }}>Nincs megadva bankszámla.</div>
            )}
            {bankAccounts.map((b, idx) => (
              <BankCard key={idx} className={b.is_primary ? 'primary' : ''}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" name="primaryBank" checked={!!b.is_primary} onChange={() => setBankAccounts(bankAccounts.map((row, i) => ({ ...row, is_primary: i === idx })))} />
                    <span>Elsődleges</span>
                    {b.is_primary && <PrimaryBadge>PRIMARY</PrimaryBadge>}
                  </div>
                  <Button type="button" variant="danger" onClick={() => setBankAccounts(bankAccounts.filter((_, i) => i !== idx))}>Törlés</Button>
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id={`round_transfer_to_whole_${idx}`}
                    checked={!!b.round_transfer_to_whole}
                    onChange={(e) => {
                      const v = [...bankAccounts];
                      v[idx] = { ...v[idx], round_transfer_to_whole: e.target.checked };
                      setBankAccounts(v);
                    }}
                  />
                  <label htmlFor={`round_transfer_to_whole_${idx}`}>Csak egész számos utalás</label>
                </div>
                <BankRow>
                  <SmallInput placeholder="Bank neve" value={b.bank_name} onChange={e => { const v=[...bankAccounts]; v[idx]={...v[idx], bank_name:e.target.value}; setBankAccounts(v); }} />
                  <SmallInput placeholder="Számlaszám" value={b.account_number} onChange={e => { const v=[...bankAccounts]; v[idx]={...v[idx], account_number:e.target.value}; setBankAccounts(v); }} />
                </BankRow>
                <BankRow>
                  <SmallInput placeholder="IBAN" value={b.iban} onChange={e => { const v=[...bankAccounts]; v[idx]={...v[idx], iban:e.target.value}; setBankAccounts(v); }} />
                  <SmallInput placeholder="SWIFT/BIC" value={b.swift_bic} onChange={e => { const v=[...bankAccounts]; v[idx]={...v[idx], swift_bic:e.target.value}; setBankAccounts(v); }} />
                </BankRow>
                <div style={{ marginTop: 8 }}>
                  <SmallSelect value={b.currency} onChange={e => { const v=[...bankAccounts]; v[idx]={...v[idx], currency:e.target.value}; setBankAccounts(v); }}>
                    <option value="HUF">HUF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </SmallSelect>
                </div>
              </BankCard>
            ))}
          </BankList>
        </BankAccountsSection>

        <FormGroup>
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" {...register('phone')} placeholder="+36 1 234 5678" />
        </FormGroup>
      </form>
    </FormContainer>
  );
};

export default CompanyForm;
