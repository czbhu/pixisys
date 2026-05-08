import React, { createContext, useContext, useState, useEffect } from 'react';
import { salesService } from '../services/salesService';
import { message } from 'antd';
import { useAuth } from './AuthContext';

interface WorkLog {
  id: number;
  customer_order: number;
  item: number | null;
  workflow_name: string;
  started_at: string;
  customer_order_number?: string;
  customer_name?: string;
  item_name?: string;
}

interface TimeTrackerContextType {
  activeLog: WorkLog | null;
  elapsedSeconds: number;
  refreshActiveLog: () => Promise<void>;
  startTimer: (orderId?: number | null, itemId?: number | null, workflowName?: string, subItemId?: number | null, forUserId?: number | null, orderLabel?: string) => Promise<void>;
  stopTimer: () => Promise<void>;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  preselectedOrderId: number | null;
  setPreselectedOrderId: (id: number | null) => void;
  preselectedItemId: number | null;
  setPreselectedItemId: (id: number | null) => void;
  preselectedSubItemId: number | null;
  setPreselectedSubItemId: (id: number | null) => void;
}

const TimeTrackerContext = createContext<TimeTrackerContextType | undefined>(undefined);

export const TimeTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [activeLog, setActiveLog] = useState<WorkLog | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [preselectedOrderId, setPreselectedOrderId] = useState<number | null>(null);
  const [preselectedItemId, setPreselectedItemId] = useState<number | null>(null);
  const [preselectedSubItemId, setPreselectedSubItemId] = useState<number | null>(null);

  const refreshActiveLog = async () => {
    if (!user) {
        setActiveLog(null);
        return;
    }
    try {
      const log = await salesService.getActiveWorkLog();
      // API might return empty object if no active log
      setActiveLog(log && log.id ? log : null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshActiveLog();
  }, [user]);

  useEffect(() => {
    if (!activeLog) {
      setElapsedSeconds(0);
      return;
    }

    const start = new Date(activeLog.started_at).getTime();
    if (isNaN(start)) return;

    // Initial calc
    const now = new Date().getTime();
    setElapsedSeconds(Math.max(0, Math.floor((now - start) / 1000)));

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const diff = Math.floor((now - start) / 1000);
      setElapsedSeconds(diff >= 0 ? diff : 0);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeLog]);

  const startTimer = async (orderId?: number | null, itemId?: number | null, workflowName?: string, subItemId?: number | null, forUserId?: number | null, orderLabel?: string) => {
    try {
      await salesService.startWorkLog({ order_id: orderId, order_label: orderLabel, item_id: itemId, workflow_name: workflowName, sub_item_id: subItemId, for_user_id: forUserId });
      await refreshActiveLog();
      message.success(forUserId ? 'Stopper elindítva (másnak)' : 'Stopper elindítva');
    } catch (e) {
      console.error(e);
      message.error('Hiba az indításkor');
    }
  };

  const stopTimer = async () => {
    if (!activeLog) return;
    try {
      await salesService.stopWorkLog(activeLog.id);
      message.success('Stopper leállítva');
      setActiveLog(null);
    } catch (e) {
      message.error('Hiba a leállításkor');
    }
  };

  return (
    <TimeTrackerContext.Provider value={{ 
        activeLog, 
        elapsedSeconds, 
        refreshActiveLog, 
        startTimer, 
        stopTimer, 
        modalOpen, 
        setModalOpen, 
        preselectedOrderId, 
        setPreselectedOrderId,
        preselectedItemId,
        setPreselectedItemId,
        preselectedSubItemId,
        setPreselectedSubItemId,
    }}>
      {children}
    </TimeTrackerContext.Provider>
  );
};

export const useTimeTracker = () => {
  const context = useContext(TimeTrackerContext);
  if (context === undefined) {
    throw new Error('useTimeTracker must be used within a TimeTrackerProvider');
  }
  return context;
};
