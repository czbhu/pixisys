import React, { useEffect, useRef, useState } from 'react';
import { InputNumber, Input } from 'antd';
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

// ---------------------------------------------------------------------------
// Formula support
// ---------------------------------------------------------------------------

/** Safely evaluate a math expression. Only allows digits and basic operators.
 *  Returns null if the expression is invalid or unsafe. */
function evalFormula(expr: string): number | null {
  const s = String(expr || '').replace(/\s+/g, '').replace(/,/g, '.');
  if (!s) return null;
  if (!/^[0-9.()\-+*/%]+$/.test(s)) return null;
  // Convert trailing % to /100 (e.g. "10%" → "(10/100)")
  const processed = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${processed})`)();
    return typeof result === 'number' && isFinite(result)
      ? Math.round(result * 1e8) / 1e8
      : null;
  } catch {
    return null;
  }
}

/** Returns true if the string looks like a math expression (not just a plain number). */
function isExpression(s: string): boolean {
  return /[+*/(]/.test(s) || s.indexOf('-', 1) > 0;
}

interface FormulaInputNumberProps extends Omit<InputNumberProps<number>, 'onChange' | 'value' | 'formatter' | 'parser' | 'step' | 'controls' | 'keyboard' | 'precision' | 'decimalSeparator'> {
  value?: number;
  onChange?: (value: number | undefined) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

const FormulaInputNumber: React.FC<FormulaInputNumberProps> = ({
  value,
  onChange,
  min,
  max,
  style,
  size,
  addonAfter,
  disabled,
  placeholder,
  onBlur: externalOnBlur,
}) => {
  const [text, setText] = useState<string>('');
  const [formula, setFormula] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const prevValueRef = useRef<number | undefined>(value);

  // If value changes externally (not from our own onChange), clear formula unless it still matches
  useEffect(() => {
    if (!focused) {
      const prev = prevValueRef.current;
      if (value !== prev) {
        prevValueRef.current = value;
        const evalResult = formula ? evalFormula(formula) : null;
        if (evalResult === null || Math.abs(evalResult - (value ?? 0)) > 0.0001) {
          setFormula(null);
        }
      }
    }
  }, [value, focused, formula]);

  const numToText = (n: number | undefined | null): string => {
    if (n === undefined || n === null) return '';
    return huFormatter(n);
  };

  const commit = (raw: string, e?: React.FocusEvent<HTMLInputElement>) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange?.(undefined);
      setFormula(null);
      if (externalOnBlur && e) externalOnBlur(e);
      return;
    }
    if (isExpression(trimmed)) {
      const result = evalFormula(trimmed);
      if (result !== null) {
        let clamped = result;
        if (min !== undefined) clamped = Math.max(clamped, min as number);
        if (max !== undefined) clamped = Math.min(clamped, max as number);
        setFormula(trimmed);
        prevValueRef.current = clamped;
        onChange?.(clamped);
      }
      // Invalid formula → keep old value
    } else {
      setFormula(null);
      const parsed = parseFloat(String(huParser(trimmed)));
      if (!isNaN(parsed)) {
        let clamped = parsed;
        if (min !== undefined) clamped = Math.max(clamped, min as number);
        if (max !== undefined) clamped = Math.min(clamped, max as number);
        prevValueRef.current = clamped;
        onChange?.(clamped);
      }
    }
    if (externalOnBlur && e) externalOnBlur(e);
  };

  const handleFocus: React.FocusEventHandler<HTMLInputElement> = () => {
    setFocused(true);
    setText(formula ?? numToText(value));
  };

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    setFocused(false);
    commit(text, e);
  };

  return (
    <Input
      value={focused ? text : numToText(value)}
      onChange={e => { setText(e.target.value); if (!focused) setFocused(true); }}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={style}
      size={size as any}
      addonAfter={addonAfter}
      disabled={disabled}
      placeholder={placeholder}
      title={formula && !focused ? `Képlet: ${formula}` : undefined}
    />
  );
};

// ---------------------------------------------------------------------------
// NumInput – existing component, now with optional `formula` prop
// ---------------------------------------------------------------------------

// Generic forwardRef wrapper that preserves antd's T = number default and ref support
function NumInputInner<T extends ValueType = number>(
  { formatter, parser, formula, ...rest }: InputNumberProps<T> & { formula?: boolean },
  ref: React.Ref<HTMLInputElement>
): React.ReactElement {
  if (formula) {
    // FormulaInputNumber handles locale internally; strip parser/formatter
    return <FormulaInputNumber {...(rest as any)} />;
  }
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
  props: InputNumberProps<T> & { ref?: React.Ref<HTMLInputElement>; formula?: boolean }
) => React.ReactElement;

export default NumInput;
