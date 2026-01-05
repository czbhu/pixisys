import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Save, ArrowLeft, Settings, Eye, EyeOff, TestTube } from 'lucide-react';
import styled from 'styled-components';
import { companyNAVConfigAPI, companyAPI } from '../services/api';

const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 800px;
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

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
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

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const PasswordInput = styled.div`
  position: relative;
  width: 100%;
`;

const PasswordToggle = styled.button`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #7f8c8d;
  padding: 4px;

  &:hover {
    color: #34495e;
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

const InfoBox = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #495057;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin: 24px 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #ecf0f1;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const CompanyNAVConfigurationForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignKey, setShowSignKey] = useState(false);
  const [showExchangeKey, setShowExchangeKey] = useState(false);

  const { data: config, isLoading: configLoading } = useQuery(
    ['company-nav-configuration', id],
    () => companyNAVConfigAPI.getCompanyNAVConfiguration(id),
    {
      enabled: isEdit,
      select: (response) => response.data
    }
  );

  const { data: companies, isLoading: companiesLoading, error: companiesError } = useQuery(
    ['companies'],
    () => companyAPI.getCompanies({ is_active: true }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const DRAFT_KEY = React.useMemo(() => (isEdit ? `company_nav_config_form_draft_${id}` : 'company_nav_config_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    defaultValues: {
      company: '',
      name: '',
      api_url: 'https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3',
      is_test_environment: true,
      login: '',
      password: '',
      tax_number: '',
      sign_key: '',
      exchange_key: '',
      software_id: 'PIXINVOICE',
      software_name: 'PIX Invoice System',
      software_operation: 'ONLINE_SERVICE',
      software_main_version: '1.0',
      software_dev_name: 'PIX Solutions',
      software_dev_contact: 'info@pixsolutions.hu',
      software_dev_country_code: 'HU',
      software_dev_tax_number: '',
      is_active: true,
      is_default: false
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

  const createConfigMutation = useMutation(
    (data) => companyNAVConfigAPI.createCompanyNAVConfiguration(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['company-nav-configurations']);
        toast.success('NAV konfiguráció létrehozva');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/nav-configurations');
      },
      onError: (error) => {
        toast.error('Hiba történt a NAV konfiguráció létrehozása során');
        console.error('Create config error:', error);
      }
    }
  );

  const updateConfigMutation = useMutation(
    (data) => companyNAVConfigAPI.updateCompanyNAVConfiguration(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['company-nav-configurations']);
        queryClient.invalidateQueries(['company-nav-configuration', id]);
        toast.success('NAV konfiguráció frissítve');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/nav-configurations');
      },
      onError: (error) => {
        toast.error('Hiba történt a NAV konfiguráció frissítése során');
        console.error('Update config error:', error);
      }
    }
  );

  const testConnectionMutation = useMutation(
    () => companyNAVConfigAPI.testConnection(id),
    {
      onSuccess: (data) => {
        toast.success('Kapcsolat tesztelése sikeres!');
        console.log('Test connection result:', data);
      },
      onError: (error) => {
        toast.error('Kapcsolat tesztelése sikertelen');
        console.error('Test connection error:', error);
      }
    }
  );

  React.useEffect(() => {
    if (config) {
      setValue('company', config.company);
      setValue('name', config.name);
      setValue('api_url', config.api_url);
      setValue('is_test_environment', config.is_test_environment);
      setValue('login', config.login);
      setValue('tax_number', config.tax_number);
      setValue('software_id', config.software_id);
      setValue('software_name', config.software_name);
      setValue('software_operation', config.software_operation);
      setValue('software_main_version', config.software_main_version);
      setValue('software_dev_name', config.software_dev_name);
      setValue('software_dev_contact', config.software_dev_contact);
      setValue('software_dev_country_code', config.software_dev_country_code);
      setValue('software_dev_tax_number', config.software_dev_tax_number);
      setValue('is_active', config.is_active);
      setValue('is_default', config.is_default);
    }
  }, [config, setValue]);

  const onSubmit = (data) => {
    const payload = { ...data };
    if (isEdit) {
      if (!payload.password) delete payload.password;
      if (!payload.sign_key) delete payload.sign_key;
      if (!payload.exchange_key) delete payload.exchange_key;
    }
    if (isEdit) {
      updateConfigMutation.mutate(payload);
    } else {
      createConfigMutation.mutate(payload);
    }
  };

  const handleTestConnection = () => {
    if (isEdit) {
      testConnectionMutation.mutate();
    } else {
      toast.info('Először mentse el a konfigurációt a teszteléshez');
    }
  };

  if (configLoading || companiesLoading) {
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
          <Settings size={24} />
          {isEdit ? 'NAV konfiguráció szerkesztése' : 'Új NAV konfiguráció'}
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings/nav-configurations')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          {isEdit && (
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isLoading}
            >
              <TestTube size={16} />
              Kapcsolat tesztelése
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={createConfigMutation.isLoading || updateConfigMutation.isLoading}
          >
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Létrehozás'}
          </Button>
        </ButtonGroup>
      </FormHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <SectionTitle>Alapadatok</SectionTitle>
        
        <FormGroup>
          <Label htmlFor="company">Cég *</Label>
          <Select
            id="company"
            {...register('company', { required: 'Cég kiválasztása kötelező' })}
            className={errors.company ? 'error' : ''}
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
          <Label htmlFor="name">Konfiguráció neve *</Label>
          <Input
            id="name"
            {...register('name', { required: 'Konfiguráció neve kötelező' })}
            className={errors.name ? 'error' : ''}
            placeholder="pl. Alapértelmezett NAV konfiguráció"
          />
          {errors.name && (
            <ErrorMessage>{errors.name.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="api_url">API URL *</Label>
            <Input
              id="api_url"
              type="url"
              {...register('api_url', { required: 'API URL megadása kötelező' })}
              className={errors.api_url ? 'error' : ''}
              placeholder="https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3"
            />
            {errors.api_url && (
              <ErrorMessage>{errors.api_url.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="tax_number">Adószám *</Label>
            <Input
              id="tax_number"
              {...register('tax_number', { 
                required: 'Adószám megadása kötelező',
                pattern: {
                  value: /^\d{8}$/,
                  message: 'Adószám 8 számjegyből kell álljon'
                }
              })}
              className={errors.tax_number ? 'error' : ''}
              placeholder="12345678"
              maxLength="8"
            />
            {errors.tax_number && (
              <ErrorMessage>{errors.tax_number.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <SectionTitle>Bejelentkezési adatok</SectionTitle>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="login">Felhasználónév *</Label>
            <Input
              id="login"
              {...register('login', { required: 'Felhasználónév megadása kötelező' })}
              className={errors.login ? 'error' : ''}
              placeholder="NAV felhasználónév"
            />
            {errors.login && (
              <ErrorMessage>{errors.login.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="password">Jelszó *</Label>
            <PasswordInput>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={isEdit ? 'Hagyja üresen a változatlanul hagyáshoz' : 'NAV jelszó'}
                {...register('password', { required: !isEdit ? 'Jelszó megadása kötelező' : false })}
                className={errors.password ? 'error' : ''}
              />
              <PasswordToggle
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </PasswordToggle>
            </PasswordInput>
            {errors.password && (
              <ErrorMessage>{errors.password.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <SectionTitle>Kulcsok</SectionTitle>

        <FormGroup>
          <Label htmlFor="sign_key">Aláírókulcs *</Label>
          <PasswordInput>
            <Input
              id="sign_key"
              type={showSignKey ? 'text' : 'password'}
              placeholder={isEdit ? 'Hagyja üresen a változatlanul hagyáshoz' : 'Aláírókulcs'}
              {...register('sign_key', { required: !isEdit ? 'Aláírókulcs megadása kötelező' : false })}
              className={errors.sign_key ? 'error' : ''}
            />
            <PasswordToggle
              type="button"
              onClick={() => setShowSignKey(!showSignKey)}
            >
              {showSignKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </PasswordToggle>
          </PasswordInput>
          {errors.sign_key && (
            <ErrorMessage>{errors.sign_key.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="exchange_key">Titkosítókulcs *</Label>
          <PasswordInput>
            <Input
              id="exchange_key"
              type={showExchangeKey ? 'text' : 'password'}
              placeholder={isEdit ? 'Hagyja üresen a változatlanul hagyáshoz' : 'Titkosítókulcs'}
              {...register('exchange_key', { required: !isEdit ? 'Titkosítókulcs megadása kötelező' : false })}
              className={errors.exchange_key ? 'error' : ''}
            />
            <PasswordToggle
              type="button"
              onClick={() => setShowExchangeKey(!showExchangeKey)}
            >
              {showExchangeKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </PasswordToggle>
          </PasswordInput>
          {errors.exchange_key && (
            <ErrorMessage>{errors.exchange_key.message}</ErrorMessage>
          )}
        </FormGroup>

        <SectionTitle>Szoftver adatok</SectionTitle>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="software_id">Szoftver azonosító *</Label>
            <Input
              id="software_id"
              {...register('software_id', { required: 'Szoftver azonosító megadása kötelező' })}
              className={errors.software_id ? 'error' : ''}
              placeholder="PIXINVOICE"
            />
            {errors.software_id && (
              <ErrorMessage>{errors.software_id.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="software_name">Szoftver neve *</Label>
            <Input
              id="software_name"
              {...register('software_name', { required: 'Szoftver neve megadása kötelező' })}
              className={errors.software_name ? 'error' : ''}
              placeholder="PIX Invoice System"
            />
            {errors.software_name && (
              <ErrorMessage>{errors.software_name.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="software_operation">Működési mód *</Label>
            <Select
              id="software_operation"
              {...register('software_operation', { required: 'Működési mód megadása kötelező' })}
              className={errors.software_operation ? 'error' : ''}
            >
              <option value="ONLINE_SERVICE">Online szolgáltatás</option>
              <option value="LOCAL_SOFTWARE">Helyi szoftver</option>
            </Select>
            {errors.software_operation && (
              <ErrorMessage>{errors.software_operation.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="software_main_version">Verzió *</Label>
            <Input
              id="software_main_version"
              {...register('software_main_version', { required: 'Verzió megadása kötelező' })}
              className={errors.software_main_version ? 'error' : ''}
              placeholder="1.0"
            />
            {errors.software_main_version && (
              <ErrorMessage>{errors.software_main_version.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <SectionTitle>Fejlesztő adatok</SectionTitle>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="software_dev_name">Fejlesztő neve *</Label>
            <Input
              id="software_dev_name"
              {...register('software_dev_name', { required: 'Fejlesztő neve megadása kötelező' })}
              className={errors.software_dev_name ? 'error' : ''}
              placeholder="PIX Solutions"
            />
            {errors.software_dev_name && (
              <ErrorMessage>{errors.software_dev_name.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="software_dev_contact">Fejlesztő kapcsolat *</Label>
            <Input
              id="software_dev_contact"
              type="email"
              {...register('software_dev_contact', { 
                required: 'Fejlesztő kapcsolat megadása kötelező',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Érvényes e-mail címet adjon meg'
                }
              })}
              className={errors.software_dev_contact ? 'error' : ''}
              placeholder="info@pixsolutions.hu"
            />
            {errors.software_dev_contact && (
              <ErrorMessage>{errors.software_dev_contact.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="software_dev_country_code">Ország kód *</Label>
            <Input
              id="software_dev_country_code"
              {...register('software_dev_country_code', { 
                required: 'Ország kód megadása kötelező',
                pattern: {
                  value: /^[A-Z]{2}$/,
                  message: 'Ország kód 2 betűből kell álljon (pl. HU)'
                }
              })}
              className={errors.software_dev_country_code ? 'error' : ''}
              placeholder="HU"
              maxLength="2"
            />
            {errors.software_dev_country_code && (
              <ErrorMessage>{errors.software_dev_country_code.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="software_dev_tax_number">Fejlesztő adószáma *</Label>
            <Input
              id="software_dev_tax_number"
              {...register('software_dev_tax_number', { 
                required: 'Fejlesztő adószáma megadása kötelező',
                pattern: {
                  value: /^\d{8}$/,
                  message: 'Adószám 8 számjegyből kell álljon'
                }
              })}
              className={errors.software_dev_tax_number ? 'error' : ''}
              placeholder="12345678"
              maxLength="8"
            />
            {errors.software_dev_tax_number && (
              <ErrorMessage>{errors.software_dev_tax_number.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <SectionTitle>Beállítások</SectionTitle>

        <CheckboxGroup>
          <Checkbox
            id="is_test_environment"
            type="checkbox"
            {...register('is_test_environment')}
          />
          <CheckboxLabel htmlFor="is_test_environment">
            Teszt környezet
          </CheckboxLabel>
        </CheckboxGroup>

        <CheckboxGroup>
          <Checkbox
            id="is_active"
            type="checkbox"
            {...register('is_active')}
          />
          <CheckboxLabel htmlFor="is_active">
            Aktív konfiguráció
          </CheckboxLabel>
        </CheckboxGroup>

        <CheckboxGroup>
          <Checkbox
            id="is_default"
            type="checkbox"
            {...register('is_default')}
          />
          <CheckboxLabel htmlFor="is_default">
            Alapértelmezett konfiguráció
          </CheckboxLabel>
        </CheckboxGroup>

        <InfoBox>
          <strong>Fontos:</strong> A NAV API konfigurációk bizalmas adatokat tartalmaznak. 
          Győződjön meg róla, hogy a kulcsok és jelszavak biztonságosan vannak tárolva.
        </InfoBox>
      </form>
    </FormContainer>
  );
};

export default CompanyNAVConfigurationForm;
