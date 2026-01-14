import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Save, ArrowLeft, User, Building, Mail, Phone, Star, Trash2 } from 'lucide-react';
import styled from 'styled-components';
import { contactAPI, customerAPI } from '../services/api';

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

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
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
      const searchText = `${option.name} ${option.tax_number || ''} ${option.email || ''}`.toLowerCase();
      const normalizedSearchText = removeAccents(searchText);
      const normalizedSearchTerm = removeAccents(searchTerm.toLowerCase());
      return normalizedSearchText.includes(normalizedSearchTerm);
    });
    setFilteredOptions(filtered);
  }, [searchTerm, options]);

  const handleSelect = (option) => {
    onChange(option.id);
    setSearchTerm(option.name);
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

  // Keresés a kiválasztott ügyfél nevére
  React.useEffect(() => {
    if (value && options.length > 0) {
      const selectedCustomer = options.find(option => option.id === value);
      if (selectedCustomer) {
        setSearchTerm(selectedCustomer.name);
      }
    }
  }, [value, options]);

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
          {filteredOptions.map((option) => (
            <DropdownItem
              key={option.id}
              onClick={() => handleSelect(option)}
              className={value === option.id ? 'selected' : ''}
            >
              <CustomerName>{option.name}</CustomerName>
              <CustomerDetails>
                {option.tax_number && `Adószám: ${option.tax_number}`}
                {option.email && ` • E-mail: ${option.email}`}
              </CustomerDetails>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </SearchableSelect>
  );
};

const ContactForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const { data: contact, isLoading: contactLoading } = useQuery(
    ['contact', id],
    () => contactAPI.getContact(id),
    {
      enabled: isEdit,
      select: (response) => response.data
    }
  );

  const { data: customers, isLoading: customersLoading, error: customersError } = useQuery(
    ['customers-all'],
    async () => {
      const response = await customerAPI.getCustomers({ page_size: 10000 });
      console.log('ContactForm - Full API response:', response);
      console.log('ContactForm - response.data:', response.data);
      console.log('ContactForm - response.data.results:', response.data?.results);
      console.log('ContactForm - results length:', response.data?.results?.length);
      return response;
    },
    {
      select: (response) => {
        const results = response.data?.results || [];
        console.log('ContactForm - Selected results:', results);
        console.log('ContactForm - Selected results length:', results.length);
        return results;
      }
    }
  );

  const DRAFT_KEY = React.useMemo(() => (isEdit ? `contact_form_draft_${id}` : 'contact_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    defaultValues: {
      customer: '',
      first_name: '',
      last_name: '',
      position: '',
      department: '',
      contact_type: 'primary',
      email: '',
      phone: '',
      mobile: '',
      fax: '',
      notes: '',
      is_primary: false,
      is_active: true
    }
  });

  // Load draft for new contact only
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

  // Persist draft (debounced)
  React.useEffect(() => {
    if (isEdit) return;
    let t = null;
    const sub = watch((value) => {
      clearTimeout(t);
      t = setTimeout(() => {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch {}
      }, 300);
    });
    return () => { sub.unsubscribe(); clearTimeout(t); };
  }, [watch, DRAFT_KEY, isEdit]);

  // Keep draft only on refresh: clear on route leave unless beforeunload set the keep flag
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

  const createContactMutation = useMutation(
    (data) => contactAPI.createContact(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['contacts']);
        toast.success('Kapcsolattartó létrehozva');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/contacts');
      },
      onError: (error) => {
        toast.error('Hiba történt a kapcsolattartó létrehozása során');
        console.error('Create contact error:', error);
      }
    }
  );

  const updateContactMutation = useMutation(
    (data) => contactAPI.updateContact(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['contacts']);
        queryClient.invalidateQueries(['contact', id]);
        queryClient.invalidateQueries(['customer-contacts']);
        toast.success('Kapcsolattartó frissítve');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        navigate('/contacts');
      },
      onError: (error) => {
        toast.error('Hiba történt a kapcsolattartó frissítése során');
        console.error('Update contact error:', error);
      }
    }
  );

  const deleteContactMutation = useMutation(
    () => contactAPI.deleteContact(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['contacts']);
        queryClient.invalidateQueries(['customer-contacts']);
        toast.success('Kapcsolattartó törölve');
        navigate('/contacts');
      },
      onError: (error) => {
        toast.error('Hiba történt a kapcsolattartó törlése során');
        console.error('Delete contact error:', error);
      }
    }
  );

  const handleDelete = () => {
    if (window.confirm('Biztosan törölni szeretné ezt a kapcsolattartót?')) {
      deleteContactMutation.mutate();
    }
  };

  useEffect(() => {
    console.log('ContactForm - customers changed:', customers);
    console.log('ContactForm - customers length:', customers?.length);
    console.log('ContactForm - customersLoading:', customersLoading);
    console.log('ContactForm - customersError:', customersError);
  }, [customers, customersLoading, customersError]);

  useEffect(() => {
    if (contact) {
      console.log('ContactForm - Loading contact data:', contact);
      console.log('ContactForm - Contact customer ID:', contact.customer);
      setValue('customer', contact.customer);
      setValue('first_name', contact.first_name);
      setValue('last_name', contact.last_name);
      setValue('position', contact.position || '');
      setValue('department', contact.department || '');
      setValue('contact_type', contact.contact_type);
      setValue('email', contact.email || '');
      setValue('phone', contact.phone || '');
      setValue('mobile', contact.mobile || '');
      setValue('fax', contact.fax || '');
      setValue('notes', contact.notes || '');
      setValue('is_primary', contact.is_primary);
      setValue('is_active', contact.is_active);
    }
  }, [contact, setValue]);

  const onSubmit = (data) => {
    // Validáljuk, hogy van-e kiválasztott ügyfél
    if (!data.customer) {
      toast.error('Ügyfél kiválasztása kötelező');
      return;
    }
    
    if (isEdit) {
      updateContactMutation.mutate(data);
    } else {
      createContactMutation.mutate(data);
    }
  };

  if (contactLoading || customersLoading) {
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

  return (
    <FormContainer>
      <FormHeader>
        <Title>
          {isEdit ? 'Kapcsolattartó szerkesztése' : 'Új kapcsolattartó'}
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          {isEdit && (
            <Button 
              variant="danger" 
              onClick={handleDelete}
              disabled={deleteContactMutation.isLoading}
            >
              <Trash2 size={16} />
              Törlés
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={createContactMutation.isLoading || updateContactMutation.isLoading}
          >
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Létrehozás'}
          </Button>
        </ButtonGroup>
      </FormHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormGroup>
          <Label htmlFor="customer">Ügyfél *</Label>
          {console.log('ContactForm - Rendering customer field, value:', watch('customer'))}
          {console.log('ContactForm - Rendering customer field, options:', customers)}
          {console.log('ContactForm - Rendering customer field, options length:', customers?.length)}
          <SearchableSelectComponent
            id="customer"
            value={watch('customer') || ''}
            onChange={(value) => {
              console.log('ContactForm - Customer changed to:', value);
              setValue('customer', value);
            }}
            options={customers || []}
            placeholder="Válasszon ügyfelet..."
            className={errors.customer ? 'error' : ''}
          />
          {errors.customer && (
            <ErrorMessage>{errors.customer.message}</ErrorMessage>
          )}
        </FormGroup>

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

        <FormGrid>
          <FormGroup>
            <Label htmlFor="position">Pozíció</Label>
            <Input
              id="position"
              {...register('position')}
              placeholder="Pozíció"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="department">Osztály</Label>
            <Input
              id="department"
              {...register('department')}
              placeholder="Osztály"
            />
          </FormGroup>
        </FormGrid>

        <FormGroup>
          <Label htmlFor="contact_type">Kapcsolattartó típusa *</Label>
          <Select
            id="contact_type"
            {...register('contact_type', { required: 'Kapcsolattartó típusa kötelező' })}
            className={errors.contact_type ? 'error' : ''}
          >
            <option value="primary">Elsődleges</option>
            <option value="billing">Számlázási</option>
            <option value="technical">Technikai</option>
            <option value="sales">Értékesítési</option>
            <option value="support">Támogatási</option>
            <option value="other">Egyéb</option>
          </Select>
          {errors.contact_type && (
            <ErrorMessage>{errors.contact_type.message}</ErrorMessage>
          )}
        </FormGroup>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="e-mail@example.com"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              {...register('phone')}
              placeholder="+36 1 234 5678"
            />
          </FormGroup>
        </FormGrid>

        <FormGrid>
          <FormGroup>
            <Label htmlFor="mobile">Mobil</Label>
            <Input
              id="mobile"
              {...register('mobile')}
              placeholder="+36 20 123 4567"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="fax">Fax</Label>
            <Input
              id="fax"
              {...register('fax')}
              placeholder="+36 1 234 5679"
            />
          </FormGroup>
        </FormGrid>

        <FormGroup>
          <Label htmlFor="notes">Megjegyzések</Label>
          <TextArea
            id="notes"
            {...register('notes')}
            placeholder="További megjegyzések..."
          />
        </FormGroup>

        <CheckboxGroup>
          <Checkbox
            id="is_primary"
            type="checkbox"
            {...register('is_primary')}
          />
          <CheckboxLabel htmlFor="is_primary">
            <Star size={16} />
            Elsődleges kapcsolattartó
          </CheckboxLabel>
        </CheckboxGroup>

        <CheckboxGroup>
          <Checkbox
            id="is_active"
            type="checkbox"
            {...register('is_active')}
          />
          <CheckboxLabel htmlFor="is_active">
            <User size={16} />
            Aktív
          </CheckboxLabel>
        </CheckboxGroup>
      </form>
    </FormContainer>
  );
};

export default ContactForm;
