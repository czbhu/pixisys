import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm, Controller } from 'react-hook-form';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import { RefreshCw, Coins, Plus, Edit, Trash2 } from 'lucide-react';
import { currencyAPI } from '../../services/api';
import Modal from '../../components/Modal';

const Container = styled.div`
  padding: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: ${props => props.variant === 'primary' ? '#3498db' : props.variant === 'danger' ? '#e74c3c' : props.variant === 'secondary' ? '#bdc3c7' : '#ecf0f1'};
  color: ${props => props.variant === 'primary' || props.variant === 'danger' ? 'white' : '#2c3e50'};
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'primary' ? '#2980b9' : props.variant === 'danger' ? '#c0392b' : props.variant === 'secondary' ? '#a0a0a0' : '#bdc3c7'};
    transform: translateY(-1px);
  }

  &:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
    transform: none;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

const Th = styled.th`
  text-align: left;
  padding: 16px;
  background-color: #f8f9fa;
  color: #7f8c8d;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  border-bottom: 1px solid #ecf0f1;
`;

const Td = styled.td`
  padding: 16px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;
  font-size: 14px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #7f8c8d;
  transition: color 0.2s;

  &:hover {
    color: ${props => props.color || '#3498db'};
  }
  &:disabled {
    cursor: default;
    color: #ccc;
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
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }
  
  &:read-only {
    background-color: #f8f9fa;
    color: #7f8c8d;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
  background-color: white;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }
`;

const ErrorMsg = styled.span`
  color: #e74c3c;
  font-size: 12px;
  margin-top: 4px;
  display: block;
`;


const Badge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background-color: ${props => props.color || '#95a5a6'};
  color: white;
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #34495e;
  cursor: pointer;
`;

const Currencies = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm({
    defaultValues: {
      code: '',
      name: '',
      current_rate: '',
      rate_valid_date: new Date().toISOString().split('T')[0],
      is_active: true,
      is_default: false
    }
  });

  const { data: currencies, isLoading } = useQuery(
    ['currencies'],
    () => currencyAPI.getCurrencies().then(res => res.data?.results || [])
  );
  
  const { data: mnbCurrencies, isLoading: isMnbLoading } = useQuery(
    ['mnbCurrencies'],
    () => currencyAPI.getMNBCurrencies().then(res => {
        const list = res.data || [];
        // Ensure HUF is available
        if(!list.find(c => c.code === 'HUF')) {
            list.unshift({
                code: 'HUF',
                name: 'Magyar Forint',
                current_rate: 1
            });
        }
        return list;
    }),
    {
       enabled: modalOpen && !editingItem, 
       staleTime: 1000 * 60 * 60 
    }
  );

  const mnbUpdateMutation = useMutation(
    () => currencyAPI.updateMNB(),
    {
      onSuccess: (data) => {
        toast.success(data.data.message);
        queryClient.invalidateQueries(['currencies']);
      },
      onError: (error) => {
        toast.error('Hiba az MNB árfolyamok frissítésekor: ' + (error.response?.data?.error || error.message));
      }
    }
  );

  const createMutation = useMutation(
    (data) => currencyAPI.createCurrency(data),
    {
      onSuccess: () => {
        toast.success('Deviza létrehozva');
        queryClient.invalidateQueries(['currencies']);
        closeModal();
      },
      onError: (err) => toast.error('Hiba létrehozáskor: ' + (err.response?.data?.error || err.message))
    }
  );

  const updateMutation = useMutation(
    (data) => currencyAPI.updateCurrency(editingItem.id, data), 
    {
      onSuccess: () => {
        toast.success('Deviza frissítve');
        queryClient.invalidateQueries(['currencies']);
        closeModal();
      },
      onError: (err) => toast.error('Hiba frissítéskor: ' + (err.response?.data?.error || err.message))
    }
  );
  
  const deleteMutation = useMutation(
      (id) => currencyAPI.deleteCurrency(id),
      {
          onSuccess: () => {
              toast.success('Deviza törölve');
              queryClient.invalidateQueries(['currencies']);
          },
          onError: (err) => toast.error('Hiba törléskor: ' + (err.response?.data?.error || err.message))
      }
  );

  const openModal = (item = null) => {
    setEditingItem(item);
    if (item) {
      setValue('code', item.code);
      setValue('name', item.name);
      setValue('current_rate', item.current_rate);
      setValue('rate_valid_date', item.rate_valid_date || new Date().toISOString().split('T')[0]);
      setValue('is_active', item.is_active);
      setValue('is_default', item.is_default);
    } else {
      reset({
        code: '',
        name: '',
        current_rate: '',
        rate_valid_date: new Date().toISOString().split('T')[0],
        is_active: true,
        is_default: false
      });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    reset();
  };

  const onSubmit = (data) => {
    if (editingItem) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };
  
  const handleDelete = (id, code) => {
      if(window.confirm(`Biztosan törölni szeretnéd a(z) ${code} devizát?`)) {
          deleteMutation.mutate(id);
      }
  };

  if (isLoading) return <div>Betöltés...</div>;

  return (
    <Container>
      <Header>
        <Title>
          <Coins size={24} />
          Deviza árfolyamok
        </Title>
        <ButtonGroup>
          <Button variant="primary" onClick={() => openModal()}>
            <Plus size={16} />
            Új deviza
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => mnbUpdateMutation.mutate()}
            disabled={mnbUpdateMutation.isLoading}
          >
            <RefreshCw size={16} className={mnbUpdateMutation.isLoading ? 'spin' : ''} />
            MNB Frissítés
          </Button>
        </ButtonGroup>
      </Header>

      <Table>
        <thead>
          <tr>
            <Th>Devizanem</Th>
            <Th>Megnevezés</Th>
            <Th>Árfolyam (HUF)</Th>
            <Th>Érvényesség kezdete</Th>
            <Th>Státusz</Th>
            <Th>Utolsó frissítés</Th>
            <Th style={{ width: 100 }}>Műveletek</Th>
          </tr>
        </thead>
        <tbody>
          {currencies && currencies.map(currency => (
            <tr key={currency.code}>
              <Td>
                  <strong>{currency.code}</strong>
                  {currency.is_default && (
                      <Badge color="#2ecc71" style={{ marginLeft: 8 }}>Alapértelmezett</Badge>
                  )}
              </Td>
              <Td>{currency.name}</Td>
              <Td>
                {currency.current_rate ? (
                    new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 2 }).format(currency.current_rate) + ' Ft'
                ) : '-'}
              </Td>
              <Td>{currency.rate_valid_date || '-'}</Td>
              <Td>
                  {currency.is_active ? (
                      <Badge color="#27ae60">Aktív</Badge>
                  ) : (
                      <Badge color="#95a5a6">Inaktív</Badge>
                  )}
              </Td>
              <Td>{new Date(currency.updated_at).toLocaleString('hu-HU')}</Td>
              <Td>
                  <ActionButton onClick={() => openModal(currency)} title="Szerkesztés">
                      <Edit size={16} />
                  </ActionButton>
                   <ActionButton onClick={() => handleDelete(currency.id, currency.code)} title="Törlés" color="#e74c3c">
                      <Trash2 size={16} />
                  </ActionButton>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      
      <Modal
        isOpen={modalOpen}
        title={editingItem ? 'Deviza szerkesztése' : 'Új deviza'}
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Mégsem</Button>
            <Button variant="primary" onClick={handleSubmit(onSubmit)}>Mentés</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormGroup>
            <Label htmlFor="code">Devizakód (ISO)</Label>
            {editingItem ? (
                <Input 
                  id="code" 
                  {...register('code', { required: 'Kód megadása kötelező' })}
                  readOnly
                  placeholder="pl. EUR"
                  style={{ textTransform: 'uppercase' }}
                />
            ) : (
                <Controller
                    control={control}
                    name="code"
                    rules={{ required: 'Válassz devizát' }}
                    render={({ field }) => (
                        <Select 
                            {...field} 
                            id="code"
                            disabled={isMnbLoading}
                            onChange={(e) => {
                                field.onChange(e);
                                const selected = mnbCurrencies?.find(c => c.code === e.target.value);
                                if (selected) {
                                    setValue('name', selected.name);
                                    if (selected.current_rate) {
                                        setValue('current_rate', selected.current_rate);
                                    }
                                }
                            }}
                        >
                            <option value="">{isMnbLoading ? 'Betöltés...' : '-- Válassz devizát --'}</option>
                            {mnbCurrencies?.map(c => (
                                <option key={c.code} value={c.code}>
                                    {c.code} - {c.name} {c.current_rate ? `(${c.current_rate} Ft)` : ''}
                                </option>
                            ))}
                        </Select>
                    )}
                />
            )}
            {errors.code && <ErrorMsg>{errors.code.message}</ErrorMsg>}
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="name">Megnevezés</Label>
            <Input 
              id="name" 
              {...register('name', { required: 'Megnevezés megadása kötelező' })} 
              placeholder="pl. Euró"
            />
            {errors.name && <ErrorMsg>{errors.name.message}</ErrorMsg>}
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="current_rate">Aktuális árfolyam (HUF)</Label>
            <Input 
              id="current_rate" 
              type="number"
              step="0.0001"
              {...register('current_rate', { required: 'Árfolyam megadása kötelező' })}
            />
            {errors.current_rate && <ErrorMsg>{errors.current_rate.message}</ErrorMsg>}
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="rate_valid_date">Érvényesség kezdete</Label>
            <Input 
              id="rate_valid_date" 
              type="date"
              {...register('rate_valid_date')}
            />
          </FormGroup>

          <CheckboxContainer>
              <CheckboxLabel>
                  <input type="checkbox" {...register('is_active')} />
                  Aktív
              </CheckboxLabel>
              <CheckboxLabel>
                  <input type="checkbox" {...register('is_default')} />
                  Alapértelmezett
              </CheckboxLabel>
          </CheckboxContainer>
        </form>
      </Modal>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </Container>
  );
};

export default Currencies;