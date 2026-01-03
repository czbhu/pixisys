import React from 'react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/hu';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// Magyar lokalizáció beállítása
dayjs.locale('hu');
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

interface HungarianDatePickerProps {
    value?: any;
    onChange?: (date: any, dateString: string | string[]) => void;
    placeholder?: string;
    style?: React.CSSProperties;
    disabled?: boolean;
    [key: string]: any;
}

const HungarianDatePicker: React.FC<HungarianDatePickerProps> = ({
    value,
    onChange,
    placeholder = "Dátum",
    style,
    disabled = false,
    ...props
}) => {
    const handleChange = (date: any, dateString: string | string[]) => {
        if (onChange) {
            onChange(date, dateString);
        }
    };

    // Input változás kezelése a 19801231 formátumhoz
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        // Ha 8 számjegy van beírva (YYYYMMDD formátum)
        if (inputValue.length === 8 && /^\d{8}$/.test(inputValue)) {
            const year = inputValue.substring(0, 4);
            const month = inputValue.substring(4, 6);
            const day = inputValue.substring(6, 8);
            const formattedDate = `${year}.${month}.${day}`;
            const parsedDate = dayjs(formattedDate, 'YYYY.MM.DD');
            if (parsedDate.isValid()) {
                handleChange(parsedDate, formattedDate);
            }
        }
    };

    // Biztosítjuk, hogy a value dayjs objektum legyen
    const dayjsValue = value ? (dayjs.isDayjs(value) ? value : dayjs(value)) : null;

    // Ha a dayjsValue nem érvényes, akkor null-t adunk vissza
    if (dayjsValue && !dayjsValue.isValid()) {
        return (
            <DatePicker
                value={null}
                onChange={handleChange}
                placeholder={placeholder}
                style={style}
                disabled={disabled}
                format="YYYY.MM.DD"
                locale={{
                    lang: {
                        locale: 'hu',
                        placeholder: 'Válasszon dátumot',
                        rangePlaceholder: ['Kezdő dátum', 'Záró dátum'],
                        today: 'Ma',
                        now: 'Most',
                        backToToday: 'Vissza a mai napra',
                        ok: 'OK',
                        clear: 'Törlés',
                        month: 'Hónap',
                        year: 'Év',
                        week: 'Hét',
                        timeSelect: 'Időpont kiválasztása',
                        dateSelect: 'Dátum kiválasztása',
                        monthSelect: 'Hónap kiválasztása',
                        yearSelect: 'Év kiválasztása',
                        decadeSelect: 'Évtized kiválasztása',
                        yearFormat: 'YYYY',
                        dateFormat: 'YYYY.MM.DD',
                        dayFormat: 'D',
                        dateTimeFormat: 'YYYY.MM.DD HH:mm:ss',
                        monthFormat: 'MMMM',
                        monthBeforeYear: true,
                        previousMonth: 'Előző hónap (PageUp)',
                        nextMonth: 'Következő hónap (PageDown)',
                        previousYear: 'Előző év (Control + left)',
                        nextYear: 'Következő év (Control + right)',
                        previousDecade: 'Előző évtized',
                        nextDecade: 'Következő évtized',
                        previousCentury: 'Előző század',
                        nextCentury: 'Következő század',
                    },
                    timePickerLocale: {
                        placeholder: 'Válasszon időpontot',
                    },
                }}
                {...props}
            />
        );
    }


    return (
        <DatePicker
            value={dayjsValue}
            onChange={handleChange}
            placeholder={placeholder}
            style={style}
            disabled={disabled}
            format="YYYY.MM.DD"
            locale={{
                lang: {
                    locale: 'hu',
                    placeholder: 'Válasszon dátumot',
                    rangePlaceholder: ['Kezdő dátum', 'Záró dátum'],
                    today: 'Ma',
                    now: 'Most',
                    backToToday: 'Vissza a mai napra',
                    ok: 'OK',
                    clear: 'Törlés',
                    month: 'Hónap',
                    year: 'Év',
                    week: 'Hét',
                    timeSelect: 'Időpont kiválasztása',
                    dateSelect: 'Dátum kiválasztása',
                    monthSelect: 'Hónap kiválasztása',
                    yearSelect: 'Év kiválasztása',
                    decadeSelect: 'Évtized kiválasztása',
                    yearFormat: 'YYYY',
                    dateFormat: 'YYYY.MM.DD',
                    dayFormat: 'D',
                    dateTimeFormat: 'YYYY.MM.DD HH:mm:ss',
                    monthFormat: 'MMMM',
                    monthBeforeYear: true,
                    previousMonth: 'Előző hónap (PageUp)',
                    nextMonth: 'Következő hónap (PageDown)',
                    previousYear: 'Előző év (Control + left)',
                    nextYear: 'Következő év (Control + right)',
                    previousDecade: 'Előző évtized',
                    nextDecade: 'Következő évtized',
                    previousCentury: 'Előző század',
                    nextCentury: 'Következő század',
                },
                timePickerLocale: {
                    placeholder: 'Válasszon időpontot',
                },
            }}
            {...props}
        />
    );
};

export default HungarianDatePicker;
