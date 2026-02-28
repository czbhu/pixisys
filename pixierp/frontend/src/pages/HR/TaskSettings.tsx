import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, QrcodeOutlined } from '@ant-design/icons';
import api from '../../services/api';

interface TaskConfiguration {
  id: number;
  name: string;
  description?: string;
  schedule_type: 'time' | 'count' | 'time_and_count';
  frequency_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'login';
  interval_minutes?: number | null;
  required_count: number;
  days_of_week: number[];
  due_day_of_month?: number | null;
  due_month_of_year?: number | null;
  flexibility_minutes: number;
  schedule_summary: string;
  qr_code?: string;
  qr_required: boolean;
  kiosk_required: boolean;
  target_level: 'person' | 'department';
  target_level_display: string;
  employee_ids: number[];
  department_ids: number[];
  employee_names: string[];
  department_names: string[];
}

interface EmployeeOption {
  id: number;
  full_name?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_username?: string;
}

interface DepartmentOption {
  id: number;
  name: string;
}

const DAYS = [
  { value: 0, label: 'Hétfő' },
  { value: 1, label: 'Kedd' },
  { value: 2, label: 'Szerda' },
  { value: 3, label: 'Csütörtök' },
  { value: 4, label: 'Péntek' },
  { value: 5, label: 'Szombat' },
  { value: 6, label: 'Vasárnap' },
];

const TaskSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskConfiguration[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskConfiguration | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tasksRes, employeesRes, departmentsRes] = await Promise.all([
        api.get('/hr/task-configurations/'),
        api.get('/hr/employees/', { params: { page_size: 5000 } }),
        api.get('/hr/departments/', { params: { page_size: 5000 } }),
      ]);

      const taskData = tasksRes.data?.results || tasksRes.data || [];
      const employeeData = employeesRes.data?.results || employeesRes.data || [];
      const departmentData = departmentsRes.data?.results || departmentsRes.data || [];

      setTasks(Array.isArray(taskData) ? taskData : []);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
      setDepartments(Array.isArray(departmentData) ? departmentData : []);
    } catch {
      message.error('Nem sikerült betölteni a feladat beállításokat');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingTask(null);
    form.resetFields();
    form.setFieldsValue({
      schedule_type: 'time',
      frequency_type: 'login',
      required_count: 1,
      flexibility_minutes: 0,
      target_level: 'person',
      qr_required: false,
      kiosk_required: false,
      employee_ids: [],
      department_ids: [],
      days_of_week: [],
      due_day_of_month: null,
      due_month_of_year: null,
    });
    setModalOpen(true);
  };

  const openEdit = (task: TaskConfiguration) => {
    setEditingTask(task);
    form.setFieldsValue({
      ...task,
      employee_ids: task.employee_ids || [],
      department_ids: task.department_ids || [],
      days_of_week: task.days_of_week || [],
    });
    setModalOpen(true);
  };

  const handleGenerateQr = async () => {
    try {
      const { data } = await api.post('/hr/task-configurations/generate_qr/', {});
      if (data?.qr_code) {
        form.setFieldValue('qr_code', data.qr_code);
        message.success('QR kód generálva');
      }
    } catch {
      message.error('QR kód generálása sikertelen');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const payload: any = {
        ...values,
        required_count: Number(values.required_count || 1),
        flexibility_minutes: Number(values.flexibility_minutes || 0),
        interval_minutes: values.interval_minutes ? Number(values.interval_minutes) : null,
      };

      if (payload.frequency_type === 'monthly' && values.due_day_of_month) {
        payload.due_day_of_month = Number(values.due_day_of_month);
        delete payload.due_month_of_year;
      } else if (payload.frequency_type === 'yearly' && values.due_month_of_year && values.due_day_of_month) {
        payload.due_month_of_year = Number(values.due_month_of_year);
        payload.due_day_of_month = Number(values.due_day_of_month);
      } else {
        delete payload.due_day_of_month;
        delete payload.due_month_of_year;
      }

      if (!payload.qr_required) {
        payload.kiosk_required = false;
      }

      if (editingTask) {
        await api.patch(`/hr/task-configurations/${editingTask.id}/`, payload);
        message.success('Feladat sikeresen módosítva');
      } else {
        await api.post('/hr/task-configurations/', payload);
        message.success('Feladat sikeresen létrehozva');
      }

      setModalOpen(false);
      form.resetFields();
      fetchAll();
    } catch (error: any) {
      const backendError = error?.response?.data;
      const detail = typeof backendError === 'string'
        ? backendError
        : backendError?.detail || Object.values(backendError || {}).flat().join(' ');
      message.error(detail || 'A feladat mentése sikertelen');
    }
  };

  const duplicateTask = async (task: TaskConfiguration) => {
    try {
      const payload: any = {
        name: `${task.name} (másolat)`,
        description: task.description || '',
        schedule_type: task.schedule_type,
        frequency_type: task.frequency_type,
        interval_minutes: task.interval_minutes ?? null,
        required_count: Number(task.required_count || 1),
        days_of_week: task.days_of_week || [],
        flexibility_minutes: Number(task.flexibility_minutes || 0),
        target_level: task.target_level,
        employee_ids: task.employee_ids || [],
        department_ids: task.department_ids || [],
        qr_code: task.qr_code || '',
        qr_required: !!task.qr_required,
        kiosk_required: !!task.kiosk_required,
        is_active: true,
      };

      if (task.frequency_type === 'monthly' && task.due_day_of_month) {
        payload.due_day_of_month = Number(task.due_day_of_month);
      }
      if (task.frequency_type === 'yearly') {
        if (task.due_month_of_year) {
          payload.due_month_of_year = Number(task.due_month_of_year);
        }
        if (task.due_day_of_month) {
          payload.due_day_of_month = Number(task.due_day_of_month);
        }
      }

      const response = await api.post('/hr/task-configurations/', payload);
      const createdTask: TaskConfiguration = response?.data;
      message.success('Feladat másolva');
      await fetchAll();

      if (createdTask && createdTask.id) {
        openEdit({
          ...createdTask,
          employee_ids: createdTask.employee_ids || [],
          department_ids: createdTask.department_ids || [],
          days_of_week: createdTask.days_of_week || [],
          due_day_of_month: createdTask.due_day_of_month || null,
          due_month_of_year: createdTask.due_month_of_year || null,
        });
      }
    } catch (error: any) {
      const backendError = error?.response?.data;
      const detail = typeof backendError === 'string'
        ? backendError
        : backendError?.detail || Object.values(backendError || {}).flat().join(' ');
      message.error(detail || 'Másolás sikertelen');
    }
  };

  const deleteTask = async (taskId: number) => {
    try {
      await api.delete(`/hr/task-configurations/${taskId}/`);
      message.success('Feladat törölve');
      fetchAll();
    } catch (error: any) {
      const backendError = error?.response?.data;
      const detail = typeof backendError === 'string'
        ? backendError
        : backendError?.detail || Object.values(backendError || {}).flat().join(' ');
      message.error(detail || 'Törlés sikertelen');
    }
  };

  const columns: ColumnsType<TaskConfiguration> = [
    {
      title: 'Feladat neve',
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record: TaskConfiguration) => (
        <a onClick={() => openEdit(record)}>{value}</a>
      ),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      render: (value?: string) => value || '-',
    },
    {
      title: 'Mikor?',
      dataIndex: 'schedule_summary',
      key: 'schedule_summary',
      render: (value?: string) => value || '-',
    },
    {
      title: 'QR kód',
      dataIndex: 'qr_code',
      key: 'qr_code',
      render: (_: string | undefined, record: TaskConfiguration) => {
        if (!record.qr_required) return '-';
        return record.qr_code || '-';
      },
    },
    {
      title: 'Kinek szól?',
      key: 'targets',
      render: (_: any, record: TaskConfiguration) => {
        const names = [...(record.employee_names || []), ...(record.department_names || [])];
        return names.length ? names.join(', ') : '-';
      },
    },
    {
      title: 'Személy vagy Osztály szintű',
      dataIndex: 'target_level_display',
      key: 'target_level_display',
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: TaskConfiguration) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} title="Szerkesztés" />
          <Button size="small" icon={<CopyOutlined />} onClick={() => duplicateTask(record)} title="Másol" />
          <Popconfirm
            title="Biztosan törlöd a feladatot?"
            okText="Igen"
            cancelText="Mégse"
            onConfirm={() => deleteTask(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} title="Töröl" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const scheduleType = Form.useWatch('schedule_type', form);
  const frequencyType = Form.useWatch('frequency_type', form);
  const qrRequired = Form.useWatch('qr_required', form);

  return (
    <Card
      title="Feladatok beállítása"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Új tevékenység
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={tasks}
        columns={columns}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingTask ? 'Tevékenység szerkesztése' : 'Új tevékenység'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Mentés"
        cancelText="Mégse"
        width={840}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Feladat neve" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="description" label="Leírás">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item label="Mikor? - Ütemezés típusa" name="schedule_type" rules={[{ required: true }]}> 
            <Select
              options={[
                { value: 'time', label: 'Idő alapú' },
                { value: 'count', label: 'Darab alapú' },
                { value: 'time_and_count', label: 'Időalapú és darab alapú' },
              ]}
            />
          </Form.Item>

          <Form.Item label="Mikor? - Gyakoriság" name="frequency_type" rules={[{ required: true }]}> 
            <Select
              options={[
                { value: 'once', label: 'Egyszeri' },
                { value: 'login', label: 'Belépés után' },
                { value: 'daily', label: 'Napi' },
                { value: 'weekly', label: 'Heti' },
                { value: 'monthly', label: 'Havi' },
                { value: 'yearly', label: 'Éves' },
              ]}
            />
          </Form.Item>

          {frequencyType === 'monthly' && (
            <Form.Item name="due_day_of_month" label="Minden hónap ... napjáig" rules={[{ required: true, message: 'Kötelező' }]}> 
              <Input type="number" min={1} max={31} placeholder="pl. 12" />
            </Form.Item>
          )}

          {frequencyType === 'yearly' && (
            <Space style={{ width: '100%' }} size="middle" align="start">
              <Form.Item
                name="due_month_of_year"
                label="Minden év ... hónapjában"
                rules={[{ required: true, message: 'Kötelező' }]}
                style={{ flex: 1 }}
              >
                <Input type="number" min={1} max={12} placeholder="pl. 3" />
              </Form.Item>
              <Form.Item
                name="due_day_of_month"
                label="... napján"
                rules={[{ required: true, message: 'Kötelező' }]}
                style={{ flex: 1 }}
              >
                <Input type="number" min={1} max={31} placeholder="pl. 15" />
              </Form.Item>
            </Space>
          )}

          {(scheduleType === 'time' || scheduleType === 'time_and_count') && (
            <Form.Item name="interval_minutes" label="Percenként" rules={[{ required: true, message: 'Kötelező' }]}>
              <Input type="number" min={1} />
            </Form.Item>
          )}

          {(scheduleType === 'count' || scheduleType === 'time_and_count') && (
            <Form.Item name="required_count" label="Darabszám (pl. 1x, 2x)" rules={[{ required: true, message: 'Kötelező' }]}>
              <Input type="number" min={1} />
            </Form.Item>
          )}

          {frequencyType === 'weekly' && (
            <Form.Item name="days_of_week" label="Napok (pl. Hétfőn 1x)">
              <Select mode="multiple" options={DAYS} />
            </Form.Item>
          )}

          <Form.Item name="flexibility_minutes" label="Rugalmasság (perc)">
            <Input type="number" min={0} />
          </Form.Item>

          <Form.Item name="target_level" label="Személy vagy Osztály szintű" rules={[{ required: true }]}> 
            <Select
              options={[
                { value: 'person', label: 'Személy szintű' },
                { value: 'department', label: 'Osztály szintű' },
              ]}
            />
          </Form.Item>

          <Form.Item name="employee_ids" label="Kinek szól? - Alkalmazottak">
            <Select mode="multiple" optionFilterProp="label" options={employees.map((employee) => ({
              value: employee.id,
              label: employee.full_name || `${employee.user_first_name || ''} ${employee.user_last_name || ''}`.trim() || employee.user_username || `ID: ${employee.id}`,
            }))} />
          </Form.Item>

          <Form.Item name="department_ids" label="Kinek szól? - HR osztályok">
            <Select mode="multiple" optionFilterProp="label" options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))} />
          </Form.Item>

          <Form.Item name="qr_required" label="QR kód szükséges" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="QR kód" name="qr_code">
            <Input
              addonAfter={
                <Button size="small" type="link" icon={<QrcodeOutlined />} onClick={handleGenerateQr}>
                  Generálás
                </Button>
              }
            />
          </Form.Item>

          <Form.Item name="kiosk_required" label="KIOSK szükséges" valuePropName="checked">
            <Switch disabled={!qrRequired} />
          </Form.Item>

          <Form.Item name="is_active" label="Aktív" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default TaskSettings;
