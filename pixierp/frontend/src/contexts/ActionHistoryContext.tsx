import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { message } from 'antd';

export interface Action {
    id: string;
    description: string;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    timestamp: number;
}

interface ActionHistoryContextType {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    addAction: (action: Omit<Action, 'id' | 'timestamp'>) => void;
    history: Action[];
    currentIndex: number;
}

const ActionHistoryContext = createContext<ActionHistoryContextType | undefined>(undefined);

export const useActionHistory = () => {
    const context = useContext(ActionHistoryContext);
    if (!context) {
        throw new Error('useActionHistory must be used within an ActionHistoryProvider');
    }
    return context;
};

interface ActionHistoryProviderProps {
    children: ReactNode;
}

export const ActionHistoryProvider: React.FC<ActionHistoryProviderProps> = ({ children }) => {
    const [history, setHistory] = useState<Action[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);

    const addAction = useCallback((actionData: Omit<Action, 'id' | 'timestamp'>) => {
        const newAction: Action = {
            ...actionData,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
        };

        setHistory(prev => {
            const newHistory = prev.slice(0, currentIndex + 1);
            return [...newHistory, newAction];
        });
        setCurrentIndex(prev => prev + 1);
    }, [currentIndex]);

    const undo = useCallback(async () => {
        if (currentIndex < 0) return;

        const action = history[currentIndex];
        const hide = message.loading(`Visszavonás: ${action.description}...`, 0);
        try {
            await action.undo();
            setCurrentIndex(prev => prev - 1);
            message.success(`Visszavonva: ${action.description}`);
        } catch (error) {
            console.error('Undo failed:', error);
            message.error('Sikertelen visszavonás');
        } finally {
            hide();
        }
    }, [history, currentIndex]);

    const redo = useCallback(async () => {
        if (currentIndex >= history.length - 1) return;

        const nextIndex = currentIndex + 1;
        const action = history[nextIndex];
        const hide = message.loading(`Újra: ${action.description}...`, 0);
        try {
            await action.redo();
            setCurrentIndex(nextIndex);
            message.success(`Újra végrehajtva: ${action.description}`);
        } catch (error) {
            console.error('Redo failed:', error);
            message.error('Sikertelen újra végrehajtás');
        } finally {
            hide();
        }
    }, [history, currentIndex]);

    const canUndo = currentIndex >= 0;
    const canRedo = currentIndex < history.length - 1;

    return (
        <ActionHistoryContext.Provider value={{ canUndo, canRedo, undo, redo, addAction, history, currentIndex }}>
            {children}
        </ActionHistoryContext.Provider>
    );
};
