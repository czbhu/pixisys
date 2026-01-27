import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Save, ArrowLeft, FileText, Hash } from 'lucide-react';
import styled from 'styled-components';
import { invoiceBlockAPI, companyAPI, companyNAVConfigAPI, currencyAPI, companyBankAccountAPI } from '../services/api';

const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 900px;
  margin-left: 20px;
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
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 6px;
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

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  min-height: 90px;
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

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background-color: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  color: #34495e;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ErrorMessage = styled.span`
  color: #e74c3c;
  font-size: 12px;
  margin-top: 4px;
  display: block;
`;

const SmallHelpText = styled.div`
  color: #6b7280;
  font-size: 12px;
  margin-top: 4px;
`;

const InfoBox = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #495057;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const InvoiceBlockForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const { data: block, isLoading: blockLoading } = useQuery(
    ['invoice-block', id],
    () => invoiceBlockAPI.getInvoiceBlock(id),
    {
      enabled: isEdit,
      select: (response) => response.data
    }
  );

  const getId = (val) => (val && typeof val === 'object' ? val.id : val) || '';

  const hasInvoices = (block?.invoice_count || 0) > 0;

  const { data: companies, isLoading: companiesLoading, error: companiesError } = useQuery(
    ['companies'],
    () => companyAPI.getCompanies({ is_active: true }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const DRAFT_KEY = React.useMemo(() => (isEdit ? `invoice_block_form_draft_${id}` : 'invoice_block_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);

  const { register, handleSubmit, control, formState: { errors }, setValue, watch } = useForm({
    defaultValues: {
      company: '',
      name: '',
      prefix: '',
      start_number: 1,
      is_active: true,
      nav_configuration_id: '',
      invoice_appearance: 'ELECTRONIC',
      footer_note: '',
      default_currency: 'HUF',
      default_bank_account: '',
      language: 'hu',
      second_language: '',
    }
  });

  const selectedCompany = watch('company');
  const [bilingual, setBilingual] = useState(false);

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

  // Keep only on refresh (new only)
  React.useEffect(() => {
    if (isEdit) return;
    const beforeUnload = () => { try { localStorage.setItem(KEEP_FLAG_KEY, '1'); } catch {} };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      let keep = false;
      try { keep = localStorage.getItem(KEEP_FLAG_KEY) === '1'; } catch {}
      if (!keep) { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
      try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
    };
  }, [KEEP_FLAG_KEY, DRAFT_KEY, isEdit]);

  const { data: navConfigs, isLoading: navConfigsLoading } = useQuery(
    ['company-nav-configs', { company: selectedCompany }],
    () => selectedCompany ? companyNAVConfigAPI.getCompanyNAVConfigurations({ company_id: selectedCompany }) : Promise.resolve({ data: { results: [] } }),
    {
      enabled: !!selectedCompany,
      select: (response) => response.data?.results || []
    }
  );

  const { data: currencies } = useQuery(
    ['currencies'],
    () => currencyAPI.getCurrencies().then(res => res.data?.results || [])
  );
  
  const activeCurrencies = React.useMemo(() => {
     return (currencies || []).filter(c => c.is_active !== false);
  }, [currencies]);

  const { data: bankAccounts } = useQuery(
    ['company-bank-accounts', { company: selectedCompany }],
    () => selectedCompany ? companyBankAccountAPI.getAccounts({ company_id: selectedCompany }).then(res => res.data?.results || []) : Promise.resolve([]),
    { enabled: !!selectedCompany }
  );

  const createBlockMutation = useMutation(
    (data) => invoiceBlockAPI.createInvoiceBlock(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['invoice-blocks']);
        toast.success('Számlatömb létrehozva');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/invoice-blocks');
      },
      onError: (error) => {
        // Display specific validation errors from backend
        const errorData = error.response?.data;
        if (errorData && typeof errorData === 'object') {
          // Show field-specific errors
          Object.entries(errorData).forEach(([field, messages]) => {
            const errorMsg = Array.isArray(messages) ? messages.join(', ') : messages;
            toast.error(`${field}: ${errorMsg}`);
          });
        } else {
          toast.error('Hiba történt a számlatömb létrehozása során');
        }
        console.error('Create block error:', error);
      }
    }
  );

  const updateBlockMutation = useMutation(
    (data) => invoiceBlockAPI.updateInvoiceBlock(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['invoice-blocks']);
        queryClient.invalidateQueries(['invoice-block', id]);
        toast.success('Számlatömb frissítve');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/invoice-blocks');
      },
      onError: (error) => {
        // Display specific validation errors from backend
        const errorData = error.response?.data;
        if (errorData && typeof errorData === 'object') {
          // Show field-specific errors
          Object.entries(errorData).forEach(([field, messages]) => {
            const errorMsg = Array.isArray(messages) ? messages.join(', ') : messages;
            toast.error(`${field}: ${errorMsg}`);
          });
        } else {
          toast.error('Hiba történt a számlatömb frissítése során');
        }
        console.error('Update block error:', error);
      }
    }
  );

  React.useEffect(() => {
    if (block) {
      setValue('company', getId(block.company));
      setValue('name', block.name);
      setValue('prefix', block.prefix);
      setValue('start_number', block.start_number);
      setValue('is_active', block.is_active);
      setValue('invoice_appearance', block.invoice_appearance || 'ELECTRONIC');
      setValue('footer_note', block.footer_note || '');
      setValue('default_currency', block.default_currency || 'HUF');
      setValue('default_bank_account', getId(block.default_bank_account));
      setValue('language', block.language || 'hu');
      setValue('second_language', block.second_language || '');
      setBilingual(!!block.second_language);
      
      // Handle NAV config from block object if needed
      const navId = getId(block.nav_configuration);
      if(navId && !watch('nav_configuration_id')){
         setValue('nav_configuration_id', navId); 
      }
    }
  }, [block, setValue]);

  // Auto-select NAV config if only one exists
  React.useEffect(() => {
      if (navConfigs && navConfigs.length === 1) {
           const current = watch('nav_configuration_id');
           if (!current) {
               setValue('nav_configuration_id', navConfigs[0].id);
           }
      }
  }, [navConfigs, setValue, watch]);

  const onSubmit = (data) => {
    const formData = {
      ...data,
      company_id: data.company
    };
    delete formData.company;
    if (!formData.nav_configuration_id) {
      formData.nav_configuration_id = null;
    }

    if (isEdit) {
      updateBlockMutation.mutate(formData);
    } else {
      createBlockMutation.mutate(formData);
    }
  };

  if (blockLoading || companiesLoading) {
    return (
      <FormContainer>
        <LoadingSpinner>Adatok betöltése...</LoadingSpinner>
      </FormContainer>
    );
  }

  if (companiesError) {
    return (
      <FormContainer>
        <div>Hiba történt a cégek betöltése során: {companiesError.message}</div>
      </FormContainer>
    );
  }

  return (
    <FormContainer>
      <FormHeader>
        <Title>
          <FileText size={24} />
          {isEdit ? 'Számlatömb szerkesztése' : 'Új számlatömb'}
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings/invoice-blocks')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={createBlockMutation.isLoading || updateBlockMutation.isLoading}
          >
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Létrehozás'}
          </Button>
        </ButtonGroup>
      </FormHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormGroup>
          <Label htmlFor="company">Cég *</Label>
          <Select
            id="company"
            {...register('company', { required: 'Cég kiválasztása kötelező' })}
            className={errors.company ? 'error' : ''}
            disabled={hasInvoices}
          >
            <option value="">Válasszon céget...</option>
            {companies && companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
          {errors.company && (
            <ErrorMessage>{errors.company.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label>Számla nyelve</Label>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
               <input 
                  type="radio" 
                  name="lang_mode" 
                  checked={!bilingual} 
                  onChange={() => {
                      setBilingual(false);
                      setValue('second_language', '');
                  }} 
               />
               Egynyelvű
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
               <input 
                  type="radio" 
                  name="lang_mode" 
                  checked={bilingual} 
                  onChange={() => {
                      setBilingual(true);
                      // Default to English if not set
                      if(!watch('second_language')) setValue('second_language', 'en'); 
                  }} 
               />
               Kétnyelvű
            </label>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: bilingual ? '1fr 1fr' : '1fr', gap: '16px' }}>
              <div>
                  <Label htmlFor="language" style={{fontSize: '13px', color: '#666'}}>
                      {bilingual ? 'Elsődleges nyelv' : 'Nyelv'}
                  </Label>
                  <Select id="language" {...register('language')}>
                    <option value="hu">Magyar</option>
                    <option value="en">Angol</option>
                    <option value="de">Német</option>
                  </Select>
              </div>
              
              {bilingual && (
                  <div>
                      <Label htmlFor="second_language" style={{fontSize: '13px', color: '#666'}}>
                          Másodlagos nyelv
                      </Label>
                      <Select id="second_language" {...register('second_language')}>
                        <option value="en">Angol</option>
                        <option value="de">Német</option>
                        <option value="hu">Magyar</option>
                      </Select>
                  </div>
              )}
          </div>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="invoice_appearance">Megjelenési forma</Label>
          <Select 
            id="invoice_appearance" 
            {...register('invoice_appearance')}
            disabled={hasInvoices}
          >
            <option value="PAPER">Papíralapú</option>
            <option value="ELECTRONIC">Elektronikus</option>
          </Select>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="nav_configuration_id">NAV konfiguráció</Label>
          <Controller
            name="nav_configuration_id"
            control={control}
            render={({ field }) => (
              <Select 
                id="nav_configuration_id" 
                value={field.value || ''} 
                onChange={(e) => field.onChange(e.target.value)}
                disabled={hasInvoices}
              >
                <option value="">Nincs hozzárendelve</option>
                {navConfigs && navConfigs.map((cfg) => (
                  <option key={cfg.id} value={cfg.id}>
                    {cfg.name} {cfg.is_default ? '(alapértelmezett)' : ''}
                  </option>
                ))}
                {(() => {
                  const current = field.value || getId(block?.nav_configuration);
                  const exists = (navConfigs || []).some(c => c.id === current);
                  if (current && !exists) {
                    return (
                      <option value={current}>
                        {block?.nav_configuration_name || 'Kiválasztott NAV konfiguráció'} (inaktív)
                      </option>
                    );
                  }
                  return null;
                })()}
              </Select>
            )}
          />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="default_currency">Alapértelmezett pénznem</Label>
          <Select 
            id="default_currency" 
            {...register('default_currency')}
            disabled={hasInvoices}
          >
            {activeCurrencies && activeCurrencies.map(curr => (
               <option key={curr.code} value={curr.code}>{curr.code} - {curr.name}</option>
            ))}
            {(!activeCurrencies || activeCurrencies.length === 0) && <option value="HUF">HUF</option>}
          </Select>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="default_bank_account">Alapértelmezett bankszámla</Label>
          <Controller
            name="default_bank_account"
            control={control}
            render={({ field }) => (
                <Select id="default_bank_account" {...field} value={field.value || ''}>
                <option value="">Nincs kiválasztva</option>
                {bankAccounts && bankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                    {acc.bank_name} - {acc.currency} - {acc.iban || acc.account_number}
                </option>
                ))}
                {(() => {
                  const current = field.value || getId(block?.default_bank_account);
                  const exists = (bankAccounts || []).some(a => a.id === current);
                  if (current && !exists) {
                    return (
                        <option value={current}>
                           Kiválasztott bankszámla (inaktív vagy nem betöltött)
                        </option>
                    );
                  }
                  return null;
                })()}
            </Select>
            )}
          />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="footer_note">Lábjegyzék</Label>
          <TextArea
            id="footer_note"
            {...register('footer_note')}
            placeholder="A megadott szöveg minden ebben a számlatömbben kiállított számlán megjelenik."
          />
          <SmallHelpText>Egyedi záradékok, fizetési információk vagy figyelmeztetések megadásához.</SmallHelpText>
        </FormGroup>

        <FormGroup>
          <Label htmlFor="name">Számlatömb neve *</Label>
          <Input
            id="name"
            {...register('name', { required: 'Számlatömb neve kötelező' })}
            className={errors.name ? 'error' : ''}
            placeholder="pl. Alap számlatömb"
          />
          {errors.name && (
            <ErrorMessage>{errors.name.message}</ErrorMessage>
          )}
        </FormGroup>

        {hasInvoices && (
            <InfoBox style={{ borderColor: '#f39c12', backgroundColor: '#fcf8e3', color: '#8a6d3b' }}>
                <strong>Figyelem:</strong> Mivel ez a számlatömb már tartalmaz számlát, az előtag és a kezdő sorszám nem módosítható.
            </InfoBox>
        )}

        <FormGroup>
          <Label htmlFor="prefix">Előtag *</Label>
          <Input
            id="prefix"
            {...register('prefix', { required: 'Előtag megadása kötelező' })}
            className={errors.prefix ? 'error' : ''}
            placeholder="pl. INV"
            disabled={hasInvoices}
          />
          {errors.prefix && (
            <ErrorMessage>{errors.prefix.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="start_number">Kezdő sorszám *</Label>
          <Input
            id="start_number"
            type="number"
            min="1"
            {...register('start_number', { 
              required: 'Kezdő sorszám megadása kötelező',
              min: {
                value: 1,
                message: 'A kezdő sorszám legalább 1 kell legyen'
              }
            })}
            className={errors.start_number ? 'error' : ''}
            placeholder="1"
            disabled={hasInvoices}
          />
          {errors.start_number && (
            <ErrorMessage>{errors.start_number.message}</ErrorMessage>
          )}
        </FormGroup>

        <InfoBox>
          <strong>Sorszámozás formátuma:</strong><br />
          [Előtag][Év][Növekvő sorszám]<br />
          <br />
          <strong>Példa:</strong> INV2024000001, INV2024000002, stb.
        </InfoBox>

        <CheckboxGroup>
          <Checkbox
            id="is_active"
            type="checkbox"
            {...register('is_active')}
          />
          <CheckboxLabel htmlFor="is_active">
            Aktív számlatömb
          </CheckboxLabel>
        </CheckboxGroup>
      </form>
    </FormContainer>
  );
};

export default InvoiceBlockForm;
