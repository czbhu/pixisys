import api from './api';

export interface Role {
  id: number;
  name: string;
  description: string;
  is_system: boolean;
  can_approve_orders: boolean;
  permissions: Permission[];
  permissions_count: number;
  users_count: number;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: number;
  role?: number;
  user?: number;
  module: string;
  module_display: string;
  resource?: string;
  resource_display?: string;
  action: string;
  action_display: string;
  allowed: boolean;
  created_at: string;
}

export interface UserRole {
  id: number;
  user: number;
  user_name: string;
  role: number;
  role_name: string;
  assigned_at: string;
  assigned_by?: number;
  assigned_by_name?: string;
}

export interface ModulesAndActions {
  modules: Array<{ value: string; label: string }>;
  resources: Record<string, {
    code: string;
    name: string;
    resources: Array<{ value: string; label: string }>;
  }>;
  actions: Array<{ value: string; label: string }>;
}

export const rolesService = {
  // Roles
  getRoles: async (): Promise<Role[]> => {
    const response = await api.get('/roles/');
    return response.data.results || response.data;
  },

  getRole: async (id: number): Promise<Role> => {
    const response = await api.get(`/roles/${id}/`);
    return response.data;
  },

  createRole: async (data: Partial<Role>): Promise<Role> => {
    const response = await api.post('/roles/', data);
    return response.data;
  },

  updateRole: async (id: number, data: Partial<Role>): Promise<Role> => {
    const response = await api.put(`/roles/${id}/`, data);
    return response.data;
  },

  deleteRole: async (id: number): Promise<void> => {
    await api.delete(`/roles/${id}/`);
  },

  setRolePermissions: async (id: number, permissions: Array<{ module: string; action: string; resource?: string; allowed?: boolean }>): Promise<void> => {
    await api.post(`/roles/${id}/set_permissions/`, { permissions });
  },

  // Permissions
  getPermissions: async (roleId?: number, userId?: number): Promise<Permission[]> => {
    const params: any = {};
    if (roleId) params.role = roleId;
    if (userId) params.user = userId;
    
    const response = await api.get('/permissions/', { params });
    return response.data.results || response.data;
  },

  createPermission: async (data: Partial<Permission>): Promise<Permission> => {
    const response = await api.post('/permissions/', data);
    return response.data;
  },

  updatePermission: async (id: number, data: Partial<Permission>): Promise<Permission> => {
    const response = await api.put(`/permissions/${id}/`, data);
    return response.data;
  },

  deletePermission: async (id: number): Promise<void> => {
    await api.delete(`/permissions/${id}/`);
  },

  getModulesAndActions: async (): Promise<ModulesAndActions> => {
    const response = await api.get('/permissions/modules/');
    return response.data;
  },

  // User Roles
  getUserRoles: async (userId?: number): Promise<UserRole[]> => {
    const params: any = {};
    if (userId) params.user = userId;
    
    const response = await api.get('/user-roles/', { params });
    return response.data.results || response.data;
  },

  assignRole: async (userId: number, roleId: number): Promise<UserRole> => {
    const response = await api.post('/user-roles/', {
      user: userId,
      role: roleId
    });
    return response.data;
  },

  removeUserRole: async (id: number): Promise<void> => {
    await api.delete(`/user-roles/${id}/`);
  },
};
