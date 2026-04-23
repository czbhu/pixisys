import React from 'react';
import { InputNumber } from 'antd';
import type { InputNumberProps } from 'antd';

type ValueType = string | number;

/**
 * Magyar lokalizációjú numerikus beviteli mező:
 * - Tizedes elválasztó: vessző (,) — a pontot (.) is elfogadja
 * - Ezres elválasztó: nem törő szóköz
 */
const huFormatter = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return '';
  const str = String(value);
  const [intPart, decPart] = str.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return decPart !== undefined ? `${intFormatted},${decPart}` : intFormatted;
};

const huParser = (value: string | undefined): string => {
  if (!value) return '';
  let v = value.replace(/[\s\u00a0]/g, '');
  const lastDot = v.lastIndexOf('.');
  const lastComma = v.lastIndexOf(',');
  if (lastComma > lastDot) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    v = v.replace(/,/g, '');
  } else {
    v = v.replace(/,/g, '.');
  }
  return v;
};

// Generic forwardRef wrapper that preserves antd's T = number default and ref support
function NumInputInner<T extends ValueType = number>(
  { formatter, parser, ...rest }: InputNumberProps<T>,
  ref: React.Ref<HTMLInputElement>
): React.ReactElement {
  return (
    <InputNumber<T>
      ref={ref}
      formatter={formatter ?? (huFormatter as any)}
      parser={parser ?? (huParser as any)}
      {...rest}
    />
  );
}

export const NumInput = React.forwardRef(NumInputInner) as <T extends ValueType = number>(
  props: InputNumberProps<T> & { ref?: React.Ref<HTMLInputElement> }
) => React.ReactElement;

export default NumInput;
