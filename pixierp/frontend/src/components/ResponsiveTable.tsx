/**
 * ResponsiveTable – wraps Ant Design <Table> with automatic card layout
 * fallback when the container is too narrow for the visible columns.
 *
 * Drop-in replacement: just change `<Table ...>` → `<ResponsiveTable ...>`.
 */

import React, { useState } from 'react';
import { Table, Pagination, Select } from 'antd';
import type { TableProps } from 'antd';
import { useResponsiveTable } from '../hooks/useResponsiveTable';
import ResponsiveCardList from './ResponsiveCardList';

export interface ResponsiveTableProps<T = any> extends TableProps<T> {
  /** If true, never switch to card layout */
  disableCardLayout?: boolean;
  /** Explicit container-width threshold (px) at which to switch to card layout */
  cardBreakpoint?: number;
}

function ResponsiveTable<T extends object = any>({
  disableCardLayout = false,
  cardBreakpoint,
  columns = [],
  ...props
}: ResponsiveTableProps<T>) {
  const { containerRef, useCardLayout } = useResponsiveTable(columns as any[], undefined, cardBreakpoint);
  const pag = props.pagination;
  const origPageSize = (pag && typeof pag === 'object') ? ((pag as any).pageSize ?? 20) : 20;
  const origCurrent = (pag && typeof pag === 'object') ? (pag as any).current : undefined;
  const origOnChange = (pag && typeof pag === 'object') ? (pag as any).onChange : undefined;
  const dataLen = (props.dataSource ?? []).length;

  const [intPage, setIntPage] = useState(1);
  const [intPageSize, setIntPageSize] = useState(origPageSize);
  const page = origCurrent ?? intPage;
  const size = intPageSize;
  const handlePageChange = (p: number) => { setIntPage(p); origOnChange?.(p, size); };
  const handleSizeChange = (s: number) => { setIntPageSize(s); setIntPage(1); origOnChange?.(1, s); };

  const topPag = pag !== false ? {
    ...(typeof pag === 'object' ? pag : {}),
    pageSize: size,
    current: page,
    onChange: handlePageChange,
    showSizeChanger: false,
    position: ['topCenter'] as any,
  } : false;

  const footerFn = pag !== false && dataLen > size ? () => (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <Pagination current={page} pageSize={size} total={dataLen} onChange={handlePageChange} showTotal={(t: number, r: [number, number]) => `${r[0]}-${r[1]} / ${t}`} size="small" />
      <Select value={size} onChange={handleSizeChange} size="small" variant="borderless" style={{ position: 'absolute', right: 0, width: 100, fontSize: 11, height: 24, lineHeight: '24px' }} popupMatchSelectWidth={false} options={[{ value: 10, label: '10 / oldal' }, { value: 20, label: '20 / oldal' }, { value: 50, label: '50 / oldal' }, { value: 100, label: '100 / oldal' }]} />
    </div>
  ) : undefined;

  return (
    <div ref={containerRef}>
      {!disableCardLayout && useCardLayout ? (
        <ResponsiveCardList
          columns={columns as any[]}
          dataSource={(props.dataSource ?? []) as any[]}
          rowKey={(props.rowKey as any) ?? 'id'}
          loading={props.loading as boolean}
          currentPage={page}
          pageSize={size}
          onPageChange={handlePageChange}
          onPageSizeChange={handleSizeChange}
        />
      ) : (
        <Table<T> columns={columns} {...props} pagination={topPag} footer={footerFn} />
      )}
    </div>
  );
}

export default ResponsiveTable;
