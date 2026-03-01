import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface UnifiedQuickSearchHeaderProps {
  title: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  actions?: React.ReactNode;
}

const UnifiedQuickSearchHeader: React.FC<UnifiedQuickSearchHeaderProps> = ({
  title,
  searchValue,
  onSearchChange,
  placeholder = 'Gyorskereső...',
  actions,
}) => {
  return (
    <div className="pixi-unified-card-header">
      <div className="pixi-unified-card-title">{title}</div>
      {onSearchChange && (
        <Input
          allowClear
          className="pixi-unified-card-search"
          prefix={<SearchOutlined />}
          placeholder={placeholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      )}
      {actions ? <div className="pixi-unified-card-actions">{actions}</div> : null}
    </div>
  );
};

export default UnifiedQuickSearchHeader;
