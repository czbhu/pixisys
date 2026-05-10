import React, { useEffect, useMemo, useState } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import { Button, Card, Form, Input, Modal, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { hrService } from '../../services/hrService';
import QRScannerModal from '../../components/QRScannerModal';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';
import { deepSearchMatch } from '../../utils/searchUtils';

interface ActiveExecution {
  id: number;
  status: 'in_progress' | 'paused' | 'completed';
  started_at: string;
  last_resumed_at?: string | null;
  paused_at?: string | null;
  notes?: string;
  elapsed_seconds: number;
  elapsed_minutes: number;
}

interface MyTaskRow {
  task_id: number;
  task_code: string;
  task_name: string;
  description: string;
  task_type: 'simple' | 'qr' | 'kiosk';
  due_at: string;
  due_in_minutes: number;
  overdue_minutes: number;
  period_key: string;
  required_count: number;
  completed_count: number;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by_name?: string | null;
  duration_minutes?: number | null;
  active_execution?: ActiveExecution | null;
  qr_required: boolean;
  kiosk_required: boolean;
  can_start: boolean;
  can_resume: boolean;
  can_finish: boolean;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('hu-HU');
};

const formatDuration = (minutes?: number | null) => {
  if (minutes === null || minutes === undefined) return '-';
  return `${minutes.toFixed(1)} perc`;
};

const formatMinutes = (totalMinutes: number): string => {
  const abs = Math.abs(Math.round(totalMinutes));
  const years   = Math.floor(abs / (60 * 24 * 365));
  const months  = Math.floor((abs % (60 * 24 * 365)) / (60 * 24 * 30));
  const days    = Math.floor((abs % (60 * 24 * 30)) / (60 * 24));
  const hours   = Math.floor((abs % (60 * 24)) / 60);
  const minutes = abs % 60;

  const parts: string[] = [];
  if (years   > 0) parts.push(`${years} év`);
  if (months  > 0) parts.push(`${months} hónap`);
  if (days    > 0) parts.push(`${days} nap`);
  if (hours   > 0) parts.push(`${hours} óra`);
  if (minutes > 0) parts.push(`${minutes} perc`);
  return parts.length > 0 ? parts.join(' ') : '0 perc';
};

const MyTasks: React.FC = () => {
  const [rows, setRows] = useState<MyTaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickFilter, setQuickFilter] = useState<'not_done' | 'done' | 'all'>('not_done');
  const [searchText, setSearchText] = useState('');

  const [startModalOpen, setStartModalOpen] = useState(false);
  const [timerModalOpen, setTimerModalOpen] = useState(false);
  const [stopDecisionOpen, setStopDecisionOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<MyTaskRow | null>(null);
  const [workflowText, setWorkflowText] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [qrCode, setQrCode] = useState('');
  const [kioskToken, setKioskToken] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const loadTasks = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await hrService.getMyTasks();
      setRows(Array.isArray(data) ? data : []);

      if (selectedTask) {
        const fresh = (Array.isArray(data) ? data : []).find((task: MyTaskRow) => task.task_id === selectedTask.task_id);
        if (fresh) {
          setSelectedTask(fresh);
          if (fresh.active_execution) {
            setElapsedSeconds(fresh.active_execution.elapsed_seconds || 0);
            setWorkflowText(fresh.active_execution.notes || '');
          }
        }
      }
    } catch {
      message.error('Nem sikerült betölteni a feladatokat');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    const refreshInterval = setInterval(() => loadTasks(true), 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (!timerModalOpen || !selectedTask?.active_execution) return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerModalOpen, selectedTask?.active_execution?.id]);

  const openTimerFromTask = (task: MyTaskRow) => {
    setSelectedTask(task);
    setWorkflowText(task.active_execution?.notes || '');
    setElapsedSeconds(task.active_execution?.elapsed_seconds || 0);
    setTimerModalOpen(true);
  };

  const handleStartClick = async (task: MyTaskRow) => {
    setSelectedTask(task);
    setWorkflowText('');
    setQrCode('');
    setKioskToken('');

    if (!task.qr_required && !task.kiosk_required) {
      try {
        await hrService.startTaskExecution(task.task_id, {});
        const refreshedRows = await hrService.getMyTasks();
        const normalizedRows = Array.isArray(refreshedRows) ? refreshedRows : [];
        setRows(normalizedRows);
        const freshTask = normalizedRows.find((item: MyTaskRow) => item.task_id === task.task_id);
        if (freshTask) {
          openTimerFromTask(freshTask);
        }
      } catch (error: any) {
        const errMsg = error?.response?.data?.error || 'A feladat indítása sikertelen';
        message.error(errMsg);
      }
      return;
    }

    setStartModalOpen(true);
  };

  const handleRequestKioskToken = async () => {
    if (!selectedTask) return;
    try {
      const data = await hrService.requestKioskToken(selectedTask.task_id);
      const kioskCount = Number(data?.kiosk_count || 0);
      const expiry = Number(data?.expires_seconds || 0);
      message.success(`KIOSK QR kiküldve ${kioskCount} kioszkra${expiry ? ` (${expiry} mp)` : ''}`);
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'KIOSK token kérés sikertelen';
      message.error(errMsg);
    }
  };

  const handleKioskScan = (value: string) => {
    setKioskToken(value || '');
    setScannerOpen(false);
    message.success('KIOSK QR beolvasva');
  };

  const handleConfirmStart = async () => {
    if (!selectedTask) return;

    try {
      await hrService.startTaskExecution(selectedTask.task_id, {
        qr_code: qrCode,
        kiosk_token: kioskToken,
      });
      setStartModalOpen(false);
      await loadTasks(true);
      const refreshedRows = await hrService.getMyTasks();
      const freshTask = (Array.isArray(refreshedRows) ? refreshedRows : []).find((task: MyTaskRow) => task.task_id === selectedTask.task_id);
      if (freshTask) {
        setRows(Array.isArray(refreshedRows) ? refreshedRows : []);
        openTimerFromTask(freshTask);
      }
      message.success('Feladat elindítva');
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'A feladat indítása sikertelen';
      message.error(errMsg);
    }
  };

  const handleResume = async (task: MyTaskRow) => {
    try {
      await hrService.resumeTaskExecution(task.task_id, { notes: workflowText });
      await loadTasks(true);
      const refreshedRows = await hrService.getMyTasks();
      const freshTask = (Array.isArray(refreshedRows) ? refreshedRows : []).find((item: MyTaskRow) => item.task_id === task.task_id);
      if (freshTask) {
        setRows(Array.isArray(refreshedRows) ? refreshedRows : []);
        openTimerFromTask(freshTask);
      }
      message.success('Feladat folytatva');
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'A folytatás sikertelen';
      message.error(errMsg);
    }
  };

  const handleStopPressed = () => {
    setStopDecisionOpen(true);
  };

  const handleComplete = async () => {
    if (!selectedTask) return;
    try {
      await hrService.completeTaskExecution(selectedTask.task_id, { notes: workflowText });
      setStopDecisionOpen(false);
      setTimerModalOpen(false);
      await loadTasks();
      message.success('Feladat befejezve');
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'A befejezés sikertelen';
      message.error(errMsg);
    }
  };

  const handlePause = async () => {
    if (!selectedTask) return;
    try {
      await hrService.pauseTaskExecution(selectedTask.task_id, { notes: workflowText });
      setStopDecisionOpen(false);
      setTimerModalOpen(false);
      await loadTasks();
      message.success('Feladat szüneteltetve');
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'A szüneteltetés sikertelen';
      message.error(errMsg);
    }
  };

  const columns: ColumnsType<MyTaskRow> = [
    {
      title: 'Mikor esedékes?',
      key: 'due',
      render: (_: any, row: MyTaskRow) => {
        if (row.is_completed) {
          return <Tag color="green">Kész</Tag>;
        }
        if (row.overdue_minutes > 0) {
          return <Typography.Text type="danger">Túllépve: {formatMinutes(row.overdue_minutes)}</Typography.Text>;
        }
        if (row.due_in_minutes <= 0) {
          return <Tag color="orange">Most esedékes</Tag>;
        }
        return `${formatMinutes(row.due_in_minutes)} múlva`;
      },
      sorter: (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Feladat neve',
      dataIndex: 'task_name',
      key: 'task_name',
      render: (value: string, row: MyTaskRow) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{row.task_code}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      render: (value?: string) => value || '-',
    },
    {
      title: 'Elvégezve?',
      key: 'completed',
      render: (_: any, row: MyTaskRow) => {
        if (!row.completed_at) return '-';
        return `${formatDateTime(row.completed_at)} (${row.completed_by_name || 'ismeretlen'})`;
      },
    },
    {
      title: 'Időtartam',
      key: 'duration',
      render: (_: any, row: MyTaskRow) => {
        if (row.active_execution && (row.active_execution.status === 'in_progress' || row.active_execution.status === 'paused')) {
          return formatDuration(row.active_execution.elapsed_minutes);
        }
        return formatDuration(row.duration_minutes);
      },
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, row: MyTaskRow) => (
        <Space>
          <Tooltip title="Elkezdés">
            <Button
              icon={<PlayCircleOutlined />}
              onClick={() => handleStartClick(row)}
              disabled={!row.can_start}
            />
          </Tooltip>
          <Tooltip title="Folytatás">
            <Button
              icon={<PauseCircleOutlined />}
              onClick={() => handleResume(row)}
              disabled={!row.can_resume}
            />
          </Tooltip>
          <Tooltip title="Befejezés">
            <Button
              icon={<StopOutlined />}
              danger
              onClick={() => openTimerFromTask(row)}
              disabled={!row.can_finish}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (quickFilter === 'done') {
      filtered = filtered.filter((row) => row.is_completed);
    }
    if (quickFilter === 'not_done') {
      filtered = filtered.filter((row) => !row.is_completed);
    }
    if (searchText?.trim()) {
      filtered = filtered.filter((row) => deepSearchMatch(searchText, row));
    }
    return filtered;
  }, [rows, quickFilter, searchText]);

  const doneCount = useMemo(() => rows.filter((row) => row.is_completed).length, [rows]);
  const notDoneCount = useMemo(() => rows.filter((row) => !row.is_completed).length, [rows]);
  const allCount = rows.length;

  const renderTimer = () => {
    const total = elapsedSeconds;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    return (
      <Statistic title="Időtartam" value={formatted} />
    );
  };

  return (
    <Card
      title="Feladatok"
      extra={(
        <Space>
          <Segmented
            value={quickFilter}
            onChange={(value) => setQuickFilter(value as 'not_done' | 'done' | 'all')}
            options={[
              { label: `Nincs kész (${notDoneCount})`, value: 'not_done' },
              { label: `Kész (${doneCount})`, value: 'done' },
              { label: `Mind (${allCount})`, value: 'all' },
            ]}
          />
          <Button onClick={() => loadTasks()}>Frissítés</Button>
        </Space>
      )}
    >
      <EnhancedTable
        tableKey="myTasks"
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Gyorskereső..."
        rowKey="task_id"
        loading={loading}
        cardBreakpoint={750}
        dataSource={filteredRows}
        columns={columns}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="Feladat azonosítás"
        open={startModalOpen}
        onCancel={() => setStartModalOpen(false)}
        onOk={handleConfirmStart}
        okText="Indítás"
        cancelText="Mégse"
      >
        {selectedTask?.kiosk_required && (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Typography.Text strong>1) KIOSK engedély</Typography.Text>
            <Button onClick={handleRequestKioskToken}>KIOSK QR megjelenítése (engedélyezett kioszkok)</Button>
            <Button onClick={() => setScannerOpen(true)}>KIOSK QR beolvasása</Button>
            <Input
              value={kioskToken}
              onChange={(e) => setKioskToken(e.target.value)}
              placeholder="KIOSK QR token"
            />
          </Space>
        )}

        {selectedTask?.qr_required && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text strong>{selectedTask.kiosk_required ? '2) Feladat QR beolvasás' : 'Feladat QR beolvasás'}</Typography.Text>
            <Input
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="QR kód"
            />
          </Space>
        )}
      </Modal>

      <QRScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleKioskScan}
        title="KIOSK QR beolvasása"
      />

      <Modal
        title="Munkaóra számláló"
        open={timerModalOpen}
        onCancel={() => setTimerModalOpen(false)}
        footer={null}
        centered
        width="min(480px, 96vw)"
        style={{ maxWidth: '96vw' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div style={{ textAlign: 'center' }}>{renderTimer()}</div>

          <Form layout="vertical">
            <Form.Item label="Megrendelés">
              <Input value={selectedTask?.task_code || ''} readOnly />
            </Form.Item>
            <Form.Item label="Tétel">
              <Input value={selectedTask?.task_name || ''} readOnly />
            </Form.Item>
            <Form.Item label="Munkafolyamat">
              <Input.TextArea
                rows={3}
                value={workflowText}
                onChange={(e) => setWorkflowText(e.target.value)}
                placeholder="Munkavégzés leírása (ha üres, a feladat elvégzése kerül mentésre)"
              />
            </Form.Item>
          </Form>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button type="primary" danger size="large" onClick={handleStopPressed}>
              STOP
            </Button>
          </div>
        </Space>
      </Modal>

      <Modal
        title="Feladat leállítása"
        open={stopDecisionOpen}
        onCancel={() => setStopDecisionOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setStopDecisionOpen(false)}>
            Mégse
          </Button>,
          <Button key="pause" onClick={handlePause}>
            Később folytatom
          </Button>,
          <Button key="done" type="primary" onClick={handleComplete}>
            Befejeztem
          </Button>,
        ]}
      >
        Befejezted a feladatot, vagy később folytatod?
      </Modal>
    </Card>
  );
};

export default MyTasks;
