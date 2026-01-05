import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Save, ArrowLeft, Search, Loader, PlusCircle, Trash2 } from 'lucide-react';
import styled from 'styled-components';
import { customerAPI, customerBankAccountAPI } from '../services/api';

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
`;

const FormSectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 24px 0 16px 0;
  color: #34495e;
  border-bottom: 2px solid #3498db;
  padding-bottom: 8px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background-color: ${props => {
    switch (props.variant) {
      case 'primary': return '#3498db';
      case 'secondary': return '#6c757d';
      default: return '#f8f9fa';
    }
  }};
  color: white;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #2c3e50;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
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

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
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

const SearchableSelect = styled.div`
  position: relative;
  width: 100%;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
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
  border-radius: 0 0 4px 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const DropdownItem = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f8f9fa;
  }

  &.selected {
    background-color: #e3f2fd;
    color: #1976d2;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
`;

const BankCard = styled.div`
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 12px;
  background: #fdfdfd;
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

const SmallInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
`;

const SmallSelect = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  background: white;
`;

const BankCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const PrimaryBadge = styled.span`
  background: #3498db;
  color: white;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 12px;
`;

const Inline = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const TaxNumberGroup = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-end;
`;

const LookupButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #f39c12;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  height: 40px;

  &:hover {
    background-color: #e67e22;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const InfoMessage = styled.div`
  background: #d4edda;
  color: #155724;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  border: 1px solid #c3e6cb;
`;

const ErrorMessageBox = styled.div`
  background: #f8d7da;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  border: 1px solid #f5c6cb;
`;

const WarningMessage = styled.div`
  background: #fff3cd;
  color: #856404;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  border: 1px solid #ffeaa7;
`;

const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 34px;
  }
  
  .slider:before {
    position: absolute;
    content: "";
    height: 26px;
    width: 26px;
    left: 4px;
    bottom: 4px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
  }
  
  input:checked + .slider {
    background-color: #2196F3;
  }
  
  input:checked + .slider:before {
    transform: translateX(26px);
  }
`;

const ToggleLabel = styled.span`
  font-weight: 500;
  color: #333;
  font-size: 16px;
`;

const ToggleDescription = styled.span`
  color: #666;
  font-size: 14px;
`;

// Modal komponens a duplikáció megerősítéséhez
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const ModalTitle = styled.h3`
  margin: 0 0 16px 0;
  color: #2c3e50;
  font-size: 18px;
`;

const ModalText = styled.p`
  margin: 0 0 20px 0;
  color: #34495e;
  line-height: 1.5;
`;

const ExistingCustomerInfo = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 12px;
  margin: 12px 0;
`;

const CustomerInfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const CustomerInfoLabel = styled.span`
  font-weight: 500;
  color: #495057;
`;

const CustomerInfoValue = styled.span`
  color: #6c757d;
`;

const ModalButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const ModalButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &.primary {
    background-color: #dc3545;
    color: white;
    
    &:hover {
      background-color: #c82333;
    }
  }
  
  &.secondary {
    background-color: #6c757d;
    color: white;
    
    &:hover {
      background-color: #5a6268;
    }
  }
`;

// Országok listája (legtöbbször használt 5 elöl) - magyarul
const COUNTRIES = [
  'Magyarország', 'Németország', 'Ausztria', 'Szlovákia', 'Románia', // Legtöbbször használt 5
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
  'ÚT', 'TÉR', 'KÖZ', 'SÉTÁLY', 'KERT', // Legtöbbször használt 5
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
  options, 
  placeholder, 
  className,
  id,
  name
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);

  // Ékezetes betűk eltávolítása a kereséshez
  const removeAccents = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  React.useEffect(() => {
    const filtered = options.filter(option => {
      const normalizedOption = removeAccents(option.toLowerCase());
      const normalizedSearchTerm = removeAccents(searchTerm.toLowerCase());
      return normalizedOption.includes(normalizedSearchTerm);
    });
    setFilteredOptions(filtered);
  }, [searchTerm, options]);

  const handleSelect = (option) => {
    onChange(option);
    setSearchTerm(option);
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

  return (
    <SearchableSelect>
      <SearchInput
        id={id}
        name={name}
        value={searchTerm || value}
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
              key={index}
              onClick={() => handleSelect(option)}
              className={value === option ? 'selected' : ''}
            >
              {option}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </SearchableSelect>
  );
};

const CustomerForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const location = useLocation();
  const returnTo = React.useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search);
      return sp.get('return') || '';
    } catch {
      return '';
    }
  }, [location.search]);
  const [lookupMessage, setLookupMessage] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isHungarianTaxpayer, setIsHungarianTaxpayer] = useState(true);
  const [vatStatus, setVatStatus] = useState('DOMESTIC');
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]); // Local editable list
  const originalBankAccountIdsRef = React.useRef(new Set());

  const { data: customer, isLoading: customerLoading } = useQuery(
    ['customer', id],
    () => customerAPI.getCustomer(id),
    {
      enabled: isEdit,
    }
  );

  // Draft autosave for customer form
  const DRAFT_KEY = React.useMemo(() => (isEdit ? `customer_form_draft_${id}` : 'customer_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);

  // Load bank accounts for edit
  const bankQuery = useQuery(
    ['customer-bank-accounts', id],
    () => customerBankAccountAPI.getAccounts({ customer_id: id }),
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
        })));
        originalBankAccountIdsRef.current = new Set(rows.map(r => r.id));
      }
    }
  );

  // Fallback: ha a külön lekérés még nem jött meg, de a customer payload tartalmaz bank_accounts‑ot
  React.useEffect(() => {
    if (!isEdit) return;
    const rows = customer?.data?.bank_accounts;
    if (rows && rows.length && bankAccounts.length === 0) {
      setBankAccounts(rows.map(r => ({
        id: r.id,
        bank_name: r.bank_name || '',
        account_number: r.account_number || '',
        iban: r.iban || '',
        swift_bic: r.swift_bic || '',
        currency: r.currency || 'HUF',
        is_primary: !!r.is_primary,
      })));
      originalBankAccountIdsRef.current = new Set(rows.map(r => r.id));
    }
  }, [isEdit, customer, bankAccounts.length]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
    watch,
  } = useForm({
    defaultValues: {
      name: '',
      short_name: '',
      tax_number: '',
      full_tax_number: '',
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
      vat_code: '',
      county_code: '',
      vat_group_id: '',
      vat_group_member_tax_number: '',
      vat_status: 'DOMESTIC',
      is_hungarian_taxpayer: true,
      eu_tax_number: '',
    },
  });

  // Load draft
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data || {}).forEach(([k, v]) => setValue(k, v));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);

  // Persist draft (debounced)
  React.useEffect(() => {
    let t = null;
    const sub = watch((value) => {
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          const fields = { ...value };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
        } catch {}
      }, 300);
    });
    return () => { sub.unsubscribe(); clearTimeout(t); };
  }, [watch, DRAFT_KEY]);

  // Keep draft only on refresh: clear on route leave unless beforeunload set the keep flag (new customer only)
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

  const createCustomerMutation = useMutation(
    (data) => customerAPI.createCustomer(data),
    {
      onSuccess: async (response) => {
        queryClient.invalidateQueries(['customers']);
        toast.success('Ügyfél létrehozva');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        const newId = response?.data?.id;
        // Create bank accounts if any
        if (newId && bankAccounts.length) {
          try {
            await Promise.all(
              bankAccounts
                .filter(b => b.bank_name || b.account_number || b.iban)
                .map(b => customerBankAccountAPI.createAccount({ ...b, customer: newId }))
            );
          } catch (e) {
            console.warn('Bank accounts create error', e);
          }
        }
        if (returnTo && newId) {
          const sep = returnTo.includes('?') ? '&' : '?';
          navigate(`${returnTo}${sep}customer_id=${encodeURIComponent(newId)}`);
        } else {
          navigate('/customers');
        }
      },
      onError: (error, data) => {
        if (error.response?.status === 409 && error.response?.data?.error === 'duplicate_tax_number') {
          setDuplicateModal({
            type: 'create',
            existingCustomer: error.response.data.existing_customer,
            message: error.response.data.message
          });
          setPendingData(data);
        } else {
          toast.error('Hiba történt az ügyfél létrehozása során');
          console.error('Create customer error:', error);
        }
      },
    }
  );

  const updateCustomerMutation = useMutation(
    (data) => customerAPI.updateCustomer(id, data),
    {
      onSuccess: async () => {
        queryClient.invalidateQueries(['customers']);
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        queryClient.invalidateQueries(['customer', id]);
        // Upsert bank accounts
        try {
          const currentIds = new Set();
          // Create or update
          for (const b of bankAccounts) {
            if (b.id) {
              currentIds.add(b.id);
              await customerBankAccountAPI.updateAccount(b.id, { ...b, customer: id });
            } else if (b.bank_name || b.account_number || b.iban) {
              const res = await customerBankAccountAPI.createAccount({ ...b, customer: id });
              currentIds.add(res?.data?.id);
            }
          }
          // Delete removed
          for (const oldId of Array.from(originalBankAccountIdsRef.current)) {
            if (!currentIds.has(oldId)) {
              await customerBankAccountAPI.deleteAccount(oldId);
            }
          }
          originalBankAccountIdsRef.current = currentIds;
        } catch (e) {
          console.warn('Bank accounts upsert error', e);
        }
        toast.success('Ügyfél frissítve');
        navigate('/customers');
      },
      onError: (error, data) => {
        if (error.response?.status === 409 && error.response?.data?.error === 'duplicate_tax_number') {
          setDuplicateModal({
            type: 'update',
            existingCustomer: error.response.data.existing_customer,
            message: error.response.data.message
          });
          setPendingData(data);
        } else {
          toast.error('Hiba történt az ügyfél frissítése során');
        }
      },
    }
  );



  const retryLookupTaxpayer = async (taxNumber, attempt = 1) => {
    try {
      const response = await customerAPI.lookupTaxpayer(taxNumber);
      
      const hasRealData = response.data?.data && (
        response.data.data.taxpayer_name || 
        response.data.data.taxpayer_short_name || 
        response.data.data.tax_number_detail ||
        response.data.data.taxpayer_address_list ||
        response.data.data.vat_group_membership
      );
      
      if (hasRealData) {
        const navData = response.data.data;
        
        if (navData.taxpayer_name) {
          setValue('name', navData.taxpayer_name);
        }
        
        if (navData.taxpayer_short_name) {
          setValue('short_name', navData.taxpayer_short_name);
        }
        
        if (navData.tax_number_detail) {
          let fullTaxNumber = getValues('tax_number');
          if (navData.tax_number_detail.vatCode) {
            setValue('vat_code', navData.tax_number_detail.vatCode);
            fullTaxNumber += '-' + navData.tax_number_detail.vatCode;
          }
          if (navData.tax_number_detail.countyCode) {
            setValue('county_code', navData.tax_number_detail.countyCode);
            fullTaxNumber += '-' + navData.tax_number_detail.countyCode;
          }
          setValue('full_tax_number', fullTaxNumber);
        }
        
        if (navData.vat_group_membership) {
          if (navData.vat_group_membership.vatGroupId && navData.vat_group_membership.vatGroupId !== null) {
            setValue('vat_group_id', navData.vat_group_membership.vatGroupId);
          } else {
            setValue('vat_group_id', '');
          }
          if (navData.vat_group_membership.vatGroupMemberTaxNumber && navData.vat_group_membership.vatGroupMemberTaxNumber !== null) {
            setValue('vat_group_member_tax_number', navData.vat_group_membership.vatGroupMemberTaxNumber);
          } else {
            setValue('vat_group_member_tax_number', '');
          }
        } else {
          setValue('vat_group_id', '');
          setValue('vat_group_member_tax_number', '');
        }
        
        if (navData.taxpayer_address_list && navData.taxpayer_address_list.length > 0) {
          const address = navData.taxpayer_address_list[0];
          
          if (address.streetName) {
            setValue('street_name', address.streetName);
          }
          if (address.publicPlaceCategory) {
            setValue('public_place_category', address.publicPlaceCategory);
          }
          if (address.number) {
            setValue('street_number', address.number);
          }
          if (address.building) {
            setValue('building', address.building);
          }
          if (address.staircase) {
            setValue('staircase', address.staircase);
          }
          if (address.floor) {
            setValue('floor', address.floor);
          }
          if (address.door) {
            setValue('door', address.door);
          }
          
          if (address.city) {
            setValue('city', address.city);
          }
          
          if (address.postalCode) {
            setValue('postal_code', address.postalCode);
          }
          
          if (address.countryCode) {
            const countryMap = {
              'HU': 'Magyarország',
              'AT': 'Ausztria', 
              'DE': 'Németország',
              'SK': 'Szlovákia',
              'RO': 'Románia',
              'HR': 'Horvátország',
              'SI': 'Szlovénia',
              'PL': 'Lengyelország',
              'CZ': 'Csehország',
              'IT': 'Olaszország',
              'FR': 'Franciaország',
              'ES': 'Spanyolország',
              'NL': 'Hollandia',
              'BE': 'Belgium',
              'CH': 'Svájc',
              'GB': 'Egyesült Királyság',
              'IE': 'Írország',
              'DK': 'Dánia',
              'SE': 'Svédország',
              'NO': 'Norvégia',
              'FI': 'Finnország',
              'EE': 'Észtország',
              'LV': 'Lettország',
              'LT': 'Litvánia',
              'PT': 'Portugália',
              'GR': 'Görögország',
              'BG': 'Bulgária',
              'RS': 'Szerbia',
              'BA': 'Bosznia-Hercegovina',
              'ME': 'Montenegró',
              'MK': 'Észak-Macedónia',
              'AL': 'Albánia',
              'MD': 'Moldova',
              'UA': 'Ukrajna',
              'BY': 'Fehéroroszország',
              'RU': 'Oroszország',
              'TR': 'Törökország',
              'US': 'Egyesült Államok',
              'CA': 'Kanada',
              'AU': 'Ausztrália',
              'NZ': 'Új-Zéland',
              'JP': 'Japán',
              'CN': 'Kína',
              'IN': 'India',
              'BR': 'Brazília',
              'AR': 'Argentína',
              'MX': 'Mexikó',
              'ZA': 'Dél-Afrika'
            };
            setValue('country', countryMap[address.countryCode] || 'Egyéb');
          }
          
          let fullAddress = '';
          if (address.streetName) {
            fullAddress += address.streetName;
          }
          if (address.publicPlaceCategory) {
            fullAddress += ' ' + address.publicPlaceCategory;
          }
          if (address.number) {
            fullAddress += ' ' + address.number;
          }
          if (address.building) {
            fullAddress += ' ' + address.building;
          }
          if (address.staircase) {
            fullAddress += ' ' + address.staircase;
          }
          if (address.floor) {
            fullAddress += ' ' + address.floor;
          }
          if (address.door) {
            fullAddress += ' ' + address.door;
          }
          
          if (fullAddress.trim()) {
            setValue('address', fullAddress.trim());
          }
        }
        
        setLookupMessage({
          type: 'success',
          message: `Adószám validálás sikeres! Az adatok betöltve a NAV szerverről. (${attempt}. próbálkozás)`
        });
        toast.success('Adószám validálás sikeres - adatok betöltve');
        setIsRetrying(false);
        setRetryCount(0);
        return true;
      } else if (attempt < 5) {
        console.log(`NAV API próbálkozás ${attempt + 1}/5 - nincs adat, újrapróbálkozás...`);
        setRetryCount(attempt);
        setTimeout(() => {
          retryLookupTaxpayer(taxNumber, attempt + 1);
        }, 1000);
        return false;
      } else {
        setLookupMessage({
          type: 'error',
          message: 'Az adószám nem található a NAV rendszerében (5 próbálkozás után)'
        });
        toast.error('Adószám nem található');
        setIsRetrying(false);
        setRetryCount(0);
        return false;
      }
    } catch (error) {
      console.error(`NAV API hiba a ${attempt}. próbálkozásnál:`, error);
      if (attempt < 5) {
        setRetryCount(attempt);
        setTimeout(() => {
          retryLookupTaxpayer(taxNumber, attempt + 1);
        }, 1000);
        return false;
      } else {
        setLookupMessage({
          type: 'error',
          message: 'NAV API hiba történt (5 próbálkozás után)'
        });
        toast.error('NAV API hiba');
        setIsRetrying(false);
        setRetryCount(0);
        return false;
      }
    }
  };

  const handleLookupTaxpayer = () => {
    const taxNumber = getValues('tax_number');
    if (!taxNumber || taxNumber.length !== 8) {
      setLookupMessage({
        type: 'error',
        message: 'Kérjük, adjon meg egy 8 számjegyű adószámot'
      });
      return;
    }
    
    setIsLookingUp(true);
    setIsRetrying(true);
    setRetryCount(0);
    setLookupMessage(null);
    retryLookupTaxpayer(taxNumber, 1);
  };

  const handleVatStatusChange = (status) => {
    setVatStatus(status);
    const isHu = status === 'DOMESTIC';
    setIsHungarianTaxpayer(isHu);
    setValue('vat_status', status);
    setValue('is_hungarian_taxpayer', isHu);
    if (!isHu) {
      setValue('tax_number', '');
      setValue('full_tax_number', '');
      setValue('vat_code', '');
      setValue('county_code', '');
      setValue('vat_group_id', '');
      setValue('vat_group_member_tax_number', '');
      setValue('street_name', '');
      setValue('public_place_category', '');
      setValue('street_number', '');
      setValue('building', '');
      setValue('staircase', '');
      setValue('floor', '');
      setValue('door', '');
    }
  };


  React.useEffect(() => {
    const c = customer?.data;
    if (c) {
      setValue('name', c.name || '');
      setValue('short_name', c.short_name || '');
      setValue('tax_number', c.tax_number || '');
      setValue('full_tax_number', c.full_tax_number || '');
      setValue('address', c.address || '');
      setValue('street_name', c.street_name || '');
      setValue('public_place_category', c.public_place_category || '');
      setValue('street_number', c.street_number || '');
      setValue('building', c.building || '');
      setValue('staircase', c.staircase || '');
      setValue('floor', c.floor || '');
      setValue('door', c.door || '');
      setValue('city', c.city || '');
      setValue('postal_code', c.postal_code || '');
      setValue('country', c.country || 'Magyarország');
      setValue('email', c.email || '');
      setValue('phone', c.phone || '');
      setValue('vat_code', c.vat_code || '');
      setValue('county_code', c.county_code || '');
      setValue('vat_group_id', c.vat_group_id || '');
      setValue('vat_group_member_tax_number', c.vat_group_member_tax_number || '');
      setValue('payment_due_days', c.payment_due_days ?? 8);
      const status = c.vat_status || (c.is_hungarian_taxpayer ? 'DOMESTIC' : 'OTHER');
      setValue('vat_status', status);
      setVatStatus(status);
      const hu = status === 'DOMESTIC';
      setValue('is_hungarian_taxpayer', hu);
      setIsHungarianTaxpayer(hu);
      setValue('eu_tax_number', c.eu_tax_number || '');
    }
  }, [customer, setValue]);

  React.useEffect(() => {
    if (lookupMessage) {
      const timer = setTimeout(() => {
        setLookupMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lookupMessage]);

  React.useEffect(() => {
    if (!isRetrying) {
      setIsLookingUp(false);
    }
  }, [isRetrying]);

  const onSubmit = (data) => {
    console.log('CustomerForm onSubmit data:', data);
    
    // Közvetlenül mentjük - a backend kezeli a duplikációt
    if (isEdit) {
      updateCustomerMutation.mutate(data);
    } else {
      createCustomerMutation.mutate(data);
    }
  };

  const handleDuplicateConfirm = () => {
    // Felülírjuk a meglévő ügyfelet
    if (isEdit) {
      updateCustomerMutation.mutate(pendingData);
    } else {
      // Hozzáadjuk az overwrite paramétert
      const dataWithOverwrite = { ...pendingData, overwrite: true };
      createCustomerMutation.mutate(dataWithOverwrite);
    }
    setDuplicateModal(null);
    setPendingData(null);
  };

  const handleDuplicateCancel = () => {
    setDuplicateModal(null);
    setPendingData(null);
  };

  if (customerLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  return (
    <FormContainer>
      <FormHeader>
        <Title>{isEdit ? 'Ügyfél szerkesztése' : 'Új ügyfél'}</Title>
        <ButtonGroup>
          <Button
            variant="secondary"
            onClick={() => navigate('/customers')}
          >
            <ArrowLeft size={16} />
            Vissza
          </Button>
        </ButtonGroup>
      </FormHeader>

      <ToggleContainer>
        <div>
          <ToggleLabel>Vevő adóalanyisága</ToggleLabel>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" name="vatStatus" checked={vatStatus==='DOMESTIC'} onChange={() => handleVatStatusChange('DOMESTIC')} /> Magyar adószámos
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" name="vatStatus" checked={vatStatus==='PRIVATE_PERSON'} onChange={() => handleVatStatusChange('PRIVATE_PERSON')} /> Magánszemély
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" name="vatStatus" checked={vatStatus==='OTHER'} onChange={() => handleVatStatusChange('OTHER')} /> Egyéb
            </label>
          </div>
          <ToggleDescription style={{ marginTop: 6 }}>
            {vatStatus === 'DOMESTIC' ? 'Magyar adószámmal rendelkező adóalany - NAV lekérdezés elérhető' : vatStatus === 'PRIVATE_PERSON' ? 'Magánszemély - adószám nem kötelező' : 'Egyéb (EU/3. ország) - egyszerűsített adatbevitel'}
          </ToggleDescription>
        </div>
      </ToggleContainer>

      <form onSubmit={handleSubmit(onSubmit)}>
        {isRetrying && (
          <InfoMessage>
            NAV API lekérdezés folyamatban... ({retryCount}/5 próbálkozás)
          </InfoMessage>
        )}
        {lookupMessage && (
          lookupMessage.type === 'success' ? (
            <InfoMessage>{lookupMessage.message}</InfoMessage>
          ) : lookupMessage.type === 'warning' ? (
            <WarningMessage>{lookupMessage.message}</WarningMessage>
          ) : (
            <ErrorMessageBox>{lookupMessage.message}</ErrorMessageBox>
          )
        )}

        <FormGroup>
          <Label htmlFor="name">Ügyfél neve *</Label>
          <Input
            id="name"
            {...register('name', { required: 'Ügyfél neve kötelező' })}
            className={errors.name ? 'error' : ''}
          />
          {errors.name && (
            <ErrorMessage>{errors.name.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="payment_due_days">Esedékesség (nap)</Label>
          <Input
            id="payment_due_days"
            type="number"
            min="0"
            {...register('payment_due_days', { valueAsNumber: true })}
            placeholder="Alapértelmezés: 8"
          />
        </FormGroup>

        <BankAccountsSection>
          <BankHeader>
            <BankTitle>Bankszámlák</BankTitle>
            <BankActions>
              {isEdit && (
                <Button type="button" variant="secondary" onClick={async () => {
                  try {
                    const res = await customerAPI.fetchBankAccounts(id);
                    if (res.status === 200 && Array.isArray(res.data?.accounts)) {
                      setBankAccounts(res.data.accounts);
                    } else {
                      alert(res.data?.message || 'Automatikus lekérdezés nem elérhető');
                    }
                  } catch (e) {
                    alert('Automatikus lekérdezés nem elérhető');
                  }
                }}>Automatikus lekérdezés</Button>
              )}
              <Button type="button" variant="primary" onClick={() => setBankAccounts([
                ...bankAccounts,
                { bank_name: '', account_number: '', iban: '', swift_bic: '', currency: 'HUF', is_primary: bankAccounts.length === 0 }
              ])}>
                <PlusCircle size={16} /> Új bankszámla
              </Button>
            </BankActions>
          </BankHeader>
          <BankList>
            {bankAccounts.length === 0 && (
              <div style={{ color: '#7f8c8d', fontSize: 14 }}>Nincs rögzített bankszámla.</div>
            )}
            {bankAccounts.map((b, idx) => (
              <BankCard key={b.id || idx} className={b.is_primary ? 'primary' : ''}>
                <BankCardHeader>
                  <Inline>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="radio"
                        name="primaryBankAccount"
                        checked={!!b.is_primary}
                        onChange={() => setBankAccounts(bankAccounts.map((row, i) => ({ ...row, is_primary: i === idx })))}
                      />
                      elsődleges
                    </label>
                    {b.is_primary && <PrimaryBadge>Elsődleges</PrimaryBadge>}
                  </Inline>
                  <Button type="button" variant="danger" onClick={() => setBankAccounts(bankAccounts.filter((_, i) => i !== idx))}>
                    <Trash2 size={16} /> Törlés
                  </Button>
                </BankCardHeader>
                <BankRow>
                  <SmallInput placeholder="Bank neve" value={b.bank_name || ''} onChange={e => {
                    const v = [...bankAccounts]; v[idx] = { ...v[idx], bank_name: e.target.value }; setBankAccounts(v);
                  }} />
                  <SmallInput placeholder="Számlaszám" value={b.account_number || ''} onChange={e => {
                    const v = [...bankAccounts]; v[idx] = { ...v[idx], account_number: e.target.value }; setBankAccounts(v);
                  }} />
                </BankRow>
                <BankRow>
                  <SmallInput placeholder="IBAN" value={b.iban || ''} onChange={e => {
                    const v = [...bankAccounts]; v[idx] = { ...v[idx], iban: e.target.value }; setBankAccounts(v);
                  }} />
                  <SmallInput placeholder="SWIFT/BIC" value={b.swift_bic || ''} onChange={e => {
                    const v = [...bankAccounts]; v[idx] = { ...v[idx], swift_bic: e.target.value }; setBankAccounts(v);
                  }} />
                </BankRow>
                <BankRow>
                  <SmallSelect value={b.currency || 'HUF'} onChange={e => {
                    const v = [...bankAccounts]; v[idx] = { ...v[idx], currency: e.target.value }; setBankAccounts(v);
                  }}>
                    <option value="HUF">HUF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </SmallSelect>
                  <div></div>
                </BankRow>
              </BankCard>
            ))}
          </BankList>
        </BankAccountsSection>

        {isHungarianTaxpayer ? (
          <>
            <FormGroup>
              <Label htmlFor="short_name">Rövid név</Label>
              <Input
                id="short_name"
                {...register('short_name')}
                placeholder="Rövid név (opcionális)"
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="full_tax_number">Teljes adószám</Label>
              <Input
                id="full_tax_number"
                {...register('full_tax_number')}
                placeholder="Adószám-VAT kód-megye kód"
                readOnly
              />
            </FormGroup>

            <FormGrid>
              <FormGroup>
                <Label htmlFor="vat_group_id">Csoport azonosító</Label>
                <Input
                  id="vat_group_id"
                  {...register('vat_group_id')}
                  placeholder="Csoport azonosító"
                  readOnly
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="vat_group_member_tax_number">Csoport tag adószáma</Label>
                <Input
                  id="vat_group_member_tax_number"
                  {...register('vat_group_member_tax_number')}
                  placeholder="Csoport tag adószáma"
                  readOnly
                />
              </FormGroup>
            </FormGrid>

            <FormGroup>
              <Label htmlFor="tax_number">Adószám *</Label>
              <TaxNumberGroup>
                <Input
                  id="tax_number"
                  {...register('tax_number', { 
                    required: 'Adószám megadása kötelező',
                    pattern: {
                      value: /^\d{8}$/,
                      message: 'Adószám 8 számjegyű kell legyen'
                    }
                  })}
                  placeholder="12345678"
                  maxLength="8"
                />
                <LookupButton
                  type="button"
                  onClick={handleLookupTaxpayer}
                  disabled={isLookingUp || isRetrying}
                >
                  {isLookingUp || isRetrying ? (
                    <>
                      <Loader size={16} />
                      {isRetrying ? `NAV lekérdezés (${retryCount}/5)` : 'NAV lekérdezés...'}
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      NAV lekérdezés
                    </>
                  )}
                </LookupButton>
              </TaxNumberGroup>
              {errors.tax_number && <ErrorMessage>{errors.tax_number.message}</ErrorMessage>}
            </FormGroup>

            <FormSectionTitle>Részletes cím adatok</FormSectionTitle>

            <FormGrid>
              <FormGroup>
                <Label htmlFor="street_name">Utca</Label>
                <Input
                  id="street_name"
                  {...register('street_name')}
                  placeholder="Utca neve"
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="public_place_category">Közterület típusa</Label>
                <SearchableSelectComponent
                  id="public_place_category"
                  value={watch('public_place_category') || ''}
                  onChange={(value) => setValue('public_place_category', value)}
                  options={PUBLIC_PLACE_CATEGORIES}
                  placeholder="Válasszon közterület típust..."
                />
              </FormGroup>
            </FormGrid>

            <FormGrid>
              <FormGroup>
                <Label htmlFor="street_number">Házszám</Label>
                <Input
                  id="street_number"
                  {...register('street_number')}
                  placeholder="Házszám"
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="building">Épület</Label>
                <Input
                  id="building"
                  {...register('building')}
                  placeholder="Épület"
                />
              </FormGroup>
            </FormGrid>

            <FormGrid>
              <FormGroup>
                <Label htmlFor="staircase">Lépcsőház</Label>
                <Input
                  id="staircase"
                  {...register('staircase')}
                  placeholder="Lépcsőház"
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="floor">Emelet</Label>
                <Input
                  id="floor"
                  {...register('floor')}
                  placeholder="Emelet"
                />
              </FormGroup>
            </FormGrid>

            <FormGroup>
              <Label htmlFor="door">Ajtó</Label>
              <Input
                id="door"
                {...register('door')}
                placeholder="Ajtó"
              />
            </FormGroup>
          </>
        ) : (
          <>
            <FormGroup>
              <Label htmlFor="tax_number">Adószám (opcionális)</Label>
              <Input
                id="tax_number"
                {...register('tax_number')}
                placeholder="Adószám (opcionális)"
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="eu_tax_number">EU adószám (opcionális)</Label>
              <Input
                id="eu_tax_number"
                {...register('eu_tax_number')}
                placeholder="EU adószám (opcionális)"
              />
            </FormGroup>
          </>
        )}

        <FormGrid>
          <FormGroup>
            <Label htmlFor="city">Város *</Label>
            <Input
              id="city"
              {...register('city', { required: 'Város megadása kötelező' })}
              className={errors.city ? 'error' : ''}
            />
            {errors.city && (
              <ErrorMessage>{errors.city.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="postal_code">Irányítószám *</Label>
            <Input
              id="postal_code"
              {...register('postal_code', { required: 'Irányítószám megadása kötelező' })}
              className={errors.postal_code ? 'error' : ''}
            />
            {errors.postal_code && (
              <ErrorMessage>{errors.postal_code.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <FormGroup>
          <Label htmlFor="country">Ország *</Label>
          <SearchableSelectComponent
            id="country"
            value={watch('country') || ''}
            onChange={(value) => setValue('country', value)}
            options={COUNTRIES}
            placeholder="Válasszon országot..."
            className={errors.country ? 'error' : ''}
          />
          {errors.country && (
            <ErrorMessage>{errors.country.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && (
              <ErrorMessage>{errors.email.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="phone">Telefonszám</Label>
            <Input
              id="phone"
              {...register('phone')}
              className={errors.phone ? 'error' : ''}
            />
            {errors.phone && (
              <ErrorMessage>{errors.phone.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <ButtonGroup style={{ marginTop: '24px', justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            variant="primary"
            disabled={createCustomerMutation.isLoading || updateCustomerMutation.isLoading}
          >
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Mentés'}
          </Button>
        </ButtonGroup>
      </form>

      {/* Duplikáció megerősítő modal */}
      {duplicateModal && (
        <ModalOverlay onClick={handleDuplicateCancel}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Duplikált adószám</ModalTitle>
            <ModalText>
              {duplicateModal.message}
            </ModalText>
            
            <ExistingCustomerInfo>
              <CustomerInfoRow>
                <CustomerInfoLabel>Ügyfél neve:</CustomerInfoLabel>
                <CustomerInfoValue>{duplicateModal.existingCustomer.name}</CustomerInfoValue>
              </CustomerInfoRow>
              <CustomerInfoRow>
                <CustomerInfoLabel>Adószám:</CustomerInfoLabel>
                <CustomerInfoValue>{duplicateModal.existingCustomer.tax_number}</CustomerInfoValue>
              </CustomerInfoRow>
              <CustomerInfoRow>
                <CustomerInfoLabel>Létrehozva:</CustomerInfoLabel>
                <CustomerInfoValue>
                  {new Date(duplicateModal.existingCustomer.created_at).toLocaleDateString('hu-HU')}
                </CustomerInfoValue>
              </CustomerInfoRow>
            </ExistingCustomerInfo>

            <ModalText>
              Szeretné felülírni a meglévő ügyfelet az új adatokkal?
            </ModalText>

            <ModalButtonGroup>
              <ModalButton 
                className="secondary" 
                onClick={handleDuplicateCancel}
              >
                Mégse
              </ModalButton>
              <ModalButton 
                className="primary" 
                onClick={handleDuplicateConfirm}
                disabled={createCustomerMutation.isLoading || updateCustomerMutation.isLoading}
              >
                {duplicateModal.type === 'create' ? 'Felülírás' : 'Frissítés'}
              </ModalButton>
            </ModalButtonGroup>
          </ModalContent>
        </ModalOverlay>
      )}
    </FormContainer>
  );
};

export default CustomerForm;
