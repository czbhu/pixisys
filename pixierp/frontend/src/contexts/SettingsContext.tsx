import React, { createContext, useContext, useState, useEffect } from 'react';

interface Settings {
    tablePageSize: number;
    tableSorting: { [tableName: string]: { [key: string]: 'ascend' | 'descend' | null } };
    showInactiveEmployees: boolean;
}

interface SettingsContextType {
    settings: Settings;
    updateSettings: (newSettings: Partial<Settings>) => void;
    getTablePageSize: (tableName: string) => number;
    setTablePageSize: (tableName: string, pageSize: number) => void;
    getTableSorting: (tableName: string) => { [key: string]: 'ascend' | 'descend' | null };
    setTableSorting: (tableName: string, sorting: { [key: string]: 'ascend' | 'descend' | null }) => void;
}

const defaultSettings: Settings = {
    tablePageSize: 10,
    tableSorting: {},
    showInactiveEmployees: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<Settings>(() => {
        const savedNew = localStorage.getItem('pixierp-settings');
        const savedOld = localStorage.getItem('erp-settings');
        const saved = savedNew || savedOld;
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    });

    useEffect(() => {
        localStorage.setItem('pixierp-settings', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const getTablePageSize = (tableName: string): number => {
        return settings.tablePageSize;
    };

    const setTablePageSize = (tableName: string, pageSize: number) => {
        updateSettings({ tablePageSize: pageSize });
    };

    const getTableSorting = (tableName: string): { [key: string]: 'ascend' | 'descend' | null } => {
        const tableSorting = settings.tableSorting[tableName];
        return tableSorting || {};
    };

    const setTableSorting = (tableName: string, sorting: { [key: string]: 'ascend' | 'descend' | null }) => {
        const newTableSorting = { ...settings.tableSorting };
        newTableSorting[tableName] = sorting;
        updateSettings({
            tableSorting: newTableSorting
        });
    };

    return (
        <SettingsContext.Provider value={{
            settings,
            updateSettings,
            getTablePageSize,
            setTablePageSize,
            getTableSorting,
            setTableSorting
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
