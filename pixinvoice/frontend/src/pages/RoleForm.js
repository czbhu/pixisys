import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { Shield, Save, ArrowLeft } from 'lucide-react';
import styled from 'styled-components';
import { roleAPI } from '../services/api';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 700px;
  margin: 0 auto;
`;

const Header = styled.div`
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
  background-color: ${props => props.variant === 'primary' ? '#3498db' : '#95a5a6'};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'primary' ? '#2980b9' : '#7f8c8d'};
    transform: translateY(-1px);
  }

  &:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
    transform: none;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-weight: 500;
  color: #34495e;
`;

const Input = styled.input`
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
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  min-height: 80px;
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

const PermissionsBox = styled.div`
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
`;

const PermissionItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  background: #f8f9fa;
  transition: background-color 0.2s;

  &:hover {
    background: #e9ecef;
  }
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
`;

const RoleForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const queryClient = useQueryClient();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    defaultValues: {
      name: '',
      description: '',
      menu_permissions: [],
      is_active: true,
    }
  });

  const [menuOptions, setMenuOptions] = useState([]);

  useEffect(() => {
    roleAPI.menuOptions().then(res => {
      setMenuOptions(res.data?.menus || []);
    }).catch(() => {
      setMenuOptions([]);
    });
  }, []);

  const { data: role, isLoading } = useQuery(
    ['role', id],
    () => roleAPI.getRole(id),
    {
      enabled: isEdit,
      select: (response) => response.data,
    }
  );

  useEffect(() => {
    if (role) {
      setValue('name', role.name);
      setValue('description', role.description || '');
      setValue('menu_permissions', role.menu_permissions || []);
      setValue('is_active', role.is_active);
    }
  }, [role, setValue]);

  const createMutation = useMutation((payload) => roleAPI.createRole(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Szerepkör létrehozva');
      navigate('/settings/roles');
    },
    onError: () => toast.error('Hiba történt a létrehozás során'),
  });

  const updateMutation = useMutation((payload) => roleAPI.updateRole(id, payload), {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      queryClient.invalidateQueries(['role', id]);
      toast.success('Szerepkör frissítve');
      navigate('/settings/roles');
    },
    onError: () => toast.error('Hiba történt a frissítés során'),
  });

  const onSubmit = (data) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handlePermissionToggle = (key) => {
    const current = new Set(watch('menu_permissions', []));
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    setValue('menu_permissions', Array.from(current));
  };

  if (isEdit && isLoading) {
    return <Container>Betöltés...</Container>;
  }

  const currentSelections = new Set(watch('menu_permissions', []));

  return (
    <Container>
      <Header>
        <Title>
          <Shield size={24} />
          {isEdit ? 'Szerepkör szerkesztése' : 'Új szerepkör'}
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings/roles')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)}>
            <Save size={16} />
            {isEdit ? 'Frissítés' : 'Létrehozás'}
          </Button>
        </ButtonGroup>
      </Header>

      <Form onSubmit={handleSubmit(onSubmit)}>
        <FormGrid>
          <FormGroup>
            <Label htmlFor="name">Név *</Label>
            <Input
              id="name"
              {...register('name', { required: 'Név megadása kötelező' })}
              className={errors.name ? 'error' : ''}
              placeholder="Pl. Pénzügy, Admin, Sales"
            />
            {errors.name && <span style={{ color: '#e74c3c', fontSize: '12px' }}>{errors.name.message}</span>}
          </FormGroup>
          <FormGroup>
            <Label htmlFor="is_active">Aktív</Label>
            <input
              type="checkbox"
              id="is_active"
              defaultChecked
              {...register('is_active')}
              style={{ width: 16, height: 16 }}
            />
          </FormGroup>
        </FormGrid>

        <FormGroup>
          <Label htmlFor="description">Leírás</Label>
          <TextArea
            id="description"
            {...register('description')}
            placeholder="Rövid leírás a szerepkörről"
          />
        </FormGroup>

        <FormGroup>
          <Label>Menü jogosultságok</Label>
          <PermissionsBox>
            {menuOptions.map((opt) => (
              <PermissionItem key={opt.key}>
                <Checkbox
                  type="checkbox"
                  checked={currentSelections.has(opt.key)}
                  onChange={() => handlePermissionToggle(opt.key)}
                />
                <span>{opt.label}</span>
              </PermissionItem>
            ))}
          </PermissionsBox>
        </FormGroup>
      </Form>
    </Container>
  );
};

export default RoleForm;
