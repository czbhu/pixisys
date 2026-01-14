import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Save, ArrowLeft, Users, Eye, EyeOff } from 'lucide-react';
import styled from 'styled-components';
import { systemUserAPI, companyAPI, roleAPI } from '../services/api';

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

const MultiSelect = styled.div`
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px;
  min-height: 100px;
  max-height: 200px;
  overflow-y: auto;
  background: white;
`;

const MultiSelectItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f8f9fa;
  }

  &.selected {
    background-color: #e3f2fd;
    color: #1976d2;
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

const SystemUserForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState([]);

  const { data: user, isLoading: userLoading } = useQuery(
    ['system-user', id],
    () => systemUserAPI.getSystemUser(id),
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

  const { data: roles, isLoading: rolesLoading, error: rolesError } = useQuery(
    ['roles-all'],
    () => roleAPI.getRoles({ is_active: true }),
    {
      select: (response) => response.data?.results || response.data || response,
    }
  );

  const DRAFT_KEY = React.useMemo(() => (isEdit ? `system_user_form_draft_${id}` : 'system_user_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
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
      if (Array.isArray(data?.company_ids)) {
        const mapped = (companies || []).filter(c => data.company_ids.includes(c.id));
        if (mapped.length) setSelectedCompanies(mapped);
      }
      if (Array.isArray(data?.role_ids)) {
        const mappedRoles = (roles || []).filter(r => data.role_ids.includes(r.id));
        if (mappedRoles.length) setSelectedRoles(mappedRoles);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY, isEdit, companies, roles]);

  // Persist draft (new only)
  React.useEffect(() => {
    if (isEdit) return;
    let t = null;
    const sub = watch((value) => {
      clearTimeout(t);
      t = setTimeout(() => {
        try { 
          const payload = { ...value, company_ids: selectedCompanies.map(c => c.id), role_ids: selectedRoles.map(r => r.id) };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } catch {}
      }, 300);
    });
    return () => { sub.unsubscribe(); clearTimeout(t); };
  }, [watch, DRAFT_KEY, isEdit, selectedCompanies, selectedRoles]);

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

  const createUserMutation = useMutation(
    (data) => systemUserAPI.createSystemUser(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['system-users']);
        toast.success('Felhasználó létrehozva');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/users');
      },
      onError: (error) => {
        toast.error('Hiba történt a felhasználó létrehozása során');
        console.error('Create user error:', error);
      }
    }
  );

  const updateUserMutation = useMutation(
    (data) => systemUserAPI.updateSystemUser(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['system-users']);
        queryClient.invalidateQueries(['system-user', id]);
        toast.success('Felhasználó frissítve');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/settings/users');
      },
      onError: (error) => {
        toast.error('Hiba történt a felhasználó frissítése során');
        console.error('Update user error:', error);
      }
    }
  );

  React.useEffect(() => {
    if (user) {
      setValue('first_name', user.first_name);
      setValue('last_name', user.last_name);
      setValue('email', user.email);
      setValue('is_active', user.is_active);
      setSelectedCompanies(user.companies || []);
      setSelectedRoles(user.roles || []);
    }
  }, [user, setValue]);

  const handleCompanyToggle = (company) => {
    const isSelected = selectedCompanies.some(c => c.id === company.id);
    if (isSelected) {
      setSelectedCompanies(selectedCompanies.filter(c => c.id !== company.id));
    } else {
      setSelectedCompanies([...selectedCompanies, company]);
    }
  };

  const onSubmit = (data) => {
    const formData = {
      ...data,
      company_ids: selectedCompanies.map(c => c.id),
      role_ids: selectedRoles.map(r => r.id)
    };

    if (isEdit) {
      updateUserMutation.mutate(formData);
    } else {
      createUserMutation.mutate(formData);
    }
  };

  if (userLoading || companiesLoading || rolesLoading) {
    return (
      <FormContainer>
        <LoadingSpinner>Adatok betöltése...</LoadingSpinner>
      </FormContainer>
    );
  }

  if (companiesError || rolesError) {
    return (
      <FormContainer>
        <div>Hiba történt az adatok betöltése során: {(companiesError || rolesError).message}</div>
      </FormContainer>
    );
  }

  return (
    <FormContainer>
      <FormHeader>
        <Title>
          <Users size={24} />
          {isEdit ? 'Felhasználó szerkesztése' : 'Új felhasználó'}
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings/users')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={createUserMutation.isLoading || updateUserMutation.isLoading}
          >
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Létrehozás'}
          </Button>
        </ButtonGroup>
      </FormHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormGrid>
          <FormGroup>
            <Label htmlFor="first_name">Keresztnév *</Label>
            <Input
              id="first_name"
              {...register('first_name', { required: 'Keresztnév megadása kötelező' })}
              className={errors.first_name ? 'error' : ''}
              placeholder="Keresztnév"
            />
            {errors.first_name && (
              <ErrorMessage>{errors.first_name.message}</ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="last_name">Vezetéknév *</Label>
            <Input
              id="last_name"
              {...register('last_name', { required: 'Vezetéknév megadása kötelező' })}
              className={errors.last_name ? 'error' : ''}
              placeholder="Vezetéknév"
            />
            {errors.last_name && (
              <ErrorMessage>{errors.last_name.message}</ErrorMessage>
            )}
          </FormGroup>
        </FormGrid>

        <FormGroup>
          <Label htmlFor="email">E-mail *</Label>
          <Input
            id="email"
            type="email"
            {...register('email', { 
              required: 'E-mail megadása kötelező',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Érvényes e-mail címet adjon meg'
              }
            })}
            className={errors.email ? 'error' : ''}
            placeholder="email@example.com"
          />
          {errors.email && (
            <ErrorMessage>{errors.email.message}</ErrorMessage>
          )}
        </FormGroup>

        {!isEdit && (
          <FormGroup>
            <Label htmlFor="password">Jelszó *</Label>
            <PasswordInput>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                {...register('password', { 
                  required: 'Jelszó megadása kötelező',
                  minLength: {
                    value: 6,
                    message: 'A jelszó legalább 6 karakter hosszú kell legyen'
                  }
                })}
                className={errors.password ? 'error' : ''}
                placeholder="Jelszó"
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
        )}

        <FormGroup>
          <Label>Cégek</Label>
          <MultiSelect>
            {companies && companies.length > 0 ? (
              companies.map((company) => {
                const isSelected = selectedCompanies.some(c => c.id === company.id);
                return (
                  <MultiSelectItem
                    key={company.id}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => handleCompanyToggle(company)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleCompanyToggle(company)}
                    />
                    <span>{company.name}</span>
                  </MultiSelectItem>
                );
              })
            ) : (
              <div style={{ color: '#7f8c8d', textAlign: 'center', padding: '20px' }}>
                Nincsenek elérhető cégek
              </div>
            )}
          </MultiSelect>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#7f8c8d' }}>
            Válassza ki, hogy mely cégekhez fér hozzá a felhasználó
          </div>
        </FormGroup>

        <FormGroup>
          <Label>Szerepkörök</Label>
          <MultiSelect>
            {roles && roles.length > 0 ? (
              roles.map((role) => {
                const isSelected = selectedRoles.some(r => r.id === role.id);
                return (
                  <MultiSelectItem
                    key={role.id}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => {
                      const currentlySelected = selectedRoles.some(r => r.id === role.id);
                      if (currentlySelected) {
                        setSelectedRoles(selectedRoles.filter(r => r.id !== role.id));
                      } else {
                        setSelectedRoles([...selectedRoles, role]);
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const currentlySelected = selectedRoles.some(r => r.id === role.id);
                        if (currentlySelected) {
                          setSelectedRoles(selectedRoles.filter(r => r.id !== role.id));
                        } else {
                          setSelectedRoles([...selectedRoles, role]);
                        }
                      }}
                    />
                    <span>{role.name}</span>
                  </MultiSelectItem>
                );
              })
            ) : (
              <div style={{ color: '#7f8c8d', textAlign: 'center', padding: '20px' }}>
                Nincsenek elérhető szerepkörök
              </div>
            )}
          </MultiSelect>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#7f8c8d' }}>
            Válassza ki a felhasználó szerepköreit (menü jogosultságok)
          </div>
        </FormGroup>

        <CheckboxGroup>
          <Checkbox
            id="is_active"
            type="checkbox"
            {...register('is_active')}
          />
          <CheckboxLabel htmlFor="is_active">
            Aktív felhasználó
          </CheckboxLabel>
        </CheckboxGroup>
      </form>
    </FormContainer>
  );
};

export default SystemUserForm;
