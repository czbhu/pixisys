/**
 * ResponsiveCardList — renders Ant Design table column definitions as a card list.
 *
 * Given the same `columns` + `dataSource` props you'd pass to `<Table>`,
 * this component renders each row as a card with the column values laid out
 * in rows of 3 cells.
 *
 * Columns whose `key` is 'actions' are rendered at the bottom of the card.
 */

import React from 'react';
import { Pagination, Select, Spin } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import './ResponsiveCardList.css';

export interface ResponsiveCardListProps {
  columns: readonly {
    key?: React.Key;
    dataIndex?: string | string[];
    title?: React.ReactNode;
    render?: (value: any, record: any, index: number) => React.ReactNode;
    [k: string]: any;
  }[];
  dataSource: readonly any[];
  rowKey: string | ((record: any) => string);
  loading?: boolean;
  /** Columns per card row. Defaults to auto (fits in ~2 rows, max 3 per row). */
  colsPerRow?: number;
  /** Current page (controlled) */
  currentPage?: number;
  /** Page size (controlled) */
  pageSize?: number;
  /** Callback on page change */
  onPageChange?: (page: number) => void;
  /** Callback on page size change */
  onPageSizeChange?: (size: number) => void;
  /** Column visibility map – if provided, cells with false are hidden */
  colVisibility?: Record<string, boolean>;
  /** Optional function to compute extra CSS class(es) per row card – mirrors Ant Design rowClassName */
  rowClassName?: (record: any, index: number) => string;
}

function getKeyFromCol(col: any): string {
  return String(col.key ?? col.dataIndex ?? '');
}

function getNestedValue(record: any, dataIndex: string | string[] | undefined): any {
  // Ant Design behaviour: when there is no dataIndex the whole record is passed
  // as the render value (not undefined).
  if (!dataIndex) return record;
  if (typeof dataIndex === 'string') return record?.[dataIndex];
  let val = record;
  for (const part of dataIndex) {
    val = val?.[part];
  }
  return val;
}

function getRecordKey(record: any, rowKey: string | ((r: any) => string), idx: number): string {
  if (typeof rowKey === 'function') return rowKey(record);
  return record?.[rowKey] ?? String(idx);
}

const ResponsiveCardList: React.FC<ResponsiveCardListProps> = ({
  columns,
  dataSource,
  rowKey,
  loading = false,
  colsPerRow,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  colVisibility,
  rowClassName,
}) => {
  const page = currentPage ?? 1;
  const size = pageSize ?? 20;
  // Filter out any undefined/null entries that could cause render crashes
  const validData = dataSource.filter((r) => r != null);
  const total = validData.length;
  const paginatedData = validData.slice((page - 1) * size, page * size);

  // Separate action columns from data columns
  const visibleCols = columns.filter((col) => {
    if ((col as any).hidden === true) return false;
    const key = getKeyFromCol(col);
    if (colVisibility && colVisibility[key] === false) return false;
    return true;
  });
  const dataCols = visibleCols.filter((c) => getKeyFromCol(c) !== 'actions');
  const actionCol = visibleCols.find((c) => getKeyFromCol(c) === 'actions');

  // Auto-calculate columns per row: fit in ~2 rows, max 3 per row
  const effectiveColsPerRow = colsPerRow !== undefined
    ? colsPerRow
    : dataCols.length <= 2
      ? Math.max(1, dataCols.length)
      : Math.min(3, Math.ceil(dataCols.length / 2));

  // Split data columns into rows
  const colRows: typeof dataCols[] = [];
  for (let i = 0; i < dataCols.length; i += effectiveColsPerRow) {
    colRows.push(dataCols.slice(i, i + effectiveColsPerRow));
  }

  const paginationTop = total > size && (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
      <Pagination
        current={page}
        pageSize={size}
        total={total}
        onChange={(p) => onPageChange?.(p)}
        showTotal={(t, range) => `${range[0]}-${range[1]} / ${t}`}
        size="small"
      />
    </div>
  );

  const paginationBottom = total > size && (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 0' }}>
      <Pagination
        current={page}
        pageSize={size}
        total={total}
        onChange={(p) => onPageChange?.(p)}
        showTotal={(t, range) => `${range[0]}-${range[1]} / ${t}`}
        size="small"
      />
      {onPageSizeChange && (
        <Select
          value={size}
          onChange={(v) => onPageSizeChange(v)}
          size="small"
          variant="borderless"
          style={{ position: 'absolute', right: 0, width: 100, fontSize: 11, height: 24, lineHeight: '24px' }}
          popupMatchSelectWidth={false}
          options={[
            { value: 10, label: '10 / oldal' },
            { value: 20, label: '20 / oldal' },
            { value: 50, label: '50 / oldal' },
            { value: 100, label: '100 / oldal' },
          ]}
        />
      )}
    </div>
  );

  return (
    <div className="responsive-cards">
      {paginationTop}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <SyncOutlined spin style={{ fontSize: 24 }} />
        </div>
      ) : paginatedData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nincs találat</div>
      ) : (
        paginatedData.map((record, recIdx) => {
          if (record == null) return null;
          const key = getRecordKey(record, rowKey, recIdx);
          const extraClass = rowClassName ? rowClassName(record, recIdx) : '';
          return (
            <div key={key} className={`responsive-card${extraClass ? ` ${extraClass}` : ''}`}>
              {colRows.map((row, rowIdx) => (
                <div key={rowIdx} className="rc-row">
                  {row.map((col) => {
                    const colKey = getKeyFromCol(col);
                    const rawValue = getNestedValue(record, col.dataIndex);
                    let rendered: React.ReactNode;
                    try {
                      rendered = col.render
                        ? col.render(rawValue, record, recIdx)
                        : (rawValue ?? '-');
                    } catch {
                      rendered = '-';
                    }
                    const title = typeof col.title === 'string' ? col.title : colKey;
                    return (
                      <div key={colKey} className={`rc-cell rc-col-${colKey}`}>
                        <span className="rc-label">{title}</span>
                        <span className="rc-value">{rendered}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {actionCol && (() => {
                let actionRendered: React.ReactNode = null;
                try {
                  actionRendered = actionCol.render
                    ? actionCol.render(getNestedValue(record, actionCol.dataIndex), record, recIdx)
                    : null;
                } catch {
                  actionRendered = null;
                }
                return (
                  <div className="rc-row rc-row-bottom">
                    <div className="rc-cell" style={{ flex: 'none' }}>
                      {actionRendered}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })
      )}
      {paginationBottom}
    </div>
  );
};

export default ResponsiveCardList;
