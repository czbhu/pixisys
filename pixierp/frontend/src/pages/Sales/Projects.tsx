import React from 'react';
import { Card, Table, Button, Space, Tag, Input, Select, DatePicker } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Search } = Input;
const { Option } = Select;

const Projects = () => {
  const columns = [
    {
      title: 'Projekt neve',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Ügyfél',
      dataIndex: 'client',
      key: 'client',
    },
    {
      title: 'Státusz',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'Aktív' ? 'green' : status === 'Befejezett' ? 'blue' : 'orange';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Kezdés dátuma',
      dataIndex: 'startDate',
      key: 'startDate',
    },
    {
      title: 'Befejezés dátuma',
      dataIndex: 'endDate',
      key: 'endDate',
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: () => (
        <Space>
          <Button type="link" icon={<EditOutlined />} size="small">
            Szerkesztés
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} size="small">
            Törlés
          </Button>
        </Space>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      name: 'Weboldal fejlesztés',
      client: 'ABC Kft.',
      status: 'Aktív',
      startDate: '2024-01-15',
      endDate: '2024-03-15',
    },
    {
      key: '2',
      name: 'Mobil alkalmazás',
      client: 'XYZ Zrt.',
      status: 'Befejezett',
      startDate: '2023-11-01',
      endDate: '2024-01-10',
    },
  ];

  return (
    <div>
      <Card
        title="Projektek"
        extra={
          <Button type="primary" icon={<PlusOutlined />}>
            Új projekt
          </Button>
        }
      >
        <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
          <Space wrap>
            <Search
              placeholder="Projekt keresése"
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
            />
            <Select placeholder="Státusz" style={{ width: 120 }}>
              <Option value="all">Összes</Option>
              <Option value="active">Aktív</Option>
              <Option value="completed">Befejezett</Option>
              <Option value="pending">Függőben</Option>
            </Select>
            <DatePicker placeholder="Kezdés dátuma" />
            <DatePicker placeholder="Befejezés dátuma" />
          </Space>
        </Space>
        <Table columns={columns} dataSource={data} />
      </Card>
    </div>
  );
};

export default Projects;


