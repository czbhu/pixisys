import React, { useState, useRef, useEffect } from 'react';
import { Modal, Input } from 'antd';

interface ClockPickerProps {
    visible: boolean;
    initialHour?: number;
    initialMinute?: number;
    onOk: (hour: number, minute: number) => void;
    onCancel: () => void;
}

const ClockPicker: React.FC<ClockPickerProps> = ({
    visible,
    initialHour = 0,
    initialMinute = 0,
    onOk,
    onCancel,
}) => {
    const [mode, setMode] = useState<'hour' | 'minute'>('hour');
    const [hour, setHour] = useState(initialHour);
    const [minute, setMinute] = useState(initialMinute);
    const [hourInput, setHourInput] = useState(String(initialHour).padStart(2, '0'));
    const [minuteInput, setMinuteInput] = useState(String(initialMinute).padStart(2, '0'));
    const clockRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (visible) {
            setHour(initialHour);
            setMinute(initialMinute);
            setHourInput(String(initialHour).padStart(2, '0'));
            setMinuteInput(String(initialMinute).padStart(2, '0'));
            setMode('hour');
        }
    }, [visible, initialHour, initialMinute]);

    const handleClockClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!clockRef.current) return;

        const rect = clockRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = e.clientX - rect.left - centerX;
        const y = e.clientY - rect.top - centerY;

        const distance = Math.sqrt(x * x + y * y);
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        angle = (angle + 90 + 360) % 360;

        if (mode === 'hour') {
            // Külső kör: 1-12, Belső kör: 13-24 (0)
            const isOuterCircle = distance > 65;
            let selectedHour = Math.round(angle / 30) % 12;
            if (selectedHour === 0) selectedHour = 12;
            
            if (!isOuterCircle) {
                selectedHour = selectedHour === 12 ? 0 : selectedHour + 12;
            }
            
            setHour(selectedHour);
            setHourInput(String(selectedHour).padStart(2, '0'));
            setMode('minute');
        } else {
            const selectedMinute = Math.round(angle / 6) % 60;
            setMinute(selectedMinute);
            setMinuteInput(String(selectedMinute).padStart(2, '0'));
        }
    };

    const handleHourInputChange = (value: string) => {
        setHourInput(value);
        const numValue = parseInt(value);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= 23) {
            setHour(numValue);
        }
    };

    const handleMinuteInputChange = (value: string) => {
        setMinuteInput(value);
        const numValue = parseInt(value);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= 59) {
            setMinute(numValue);
        }
    };

    const handleOk = () => {
        onOk(hour, minute);
        setMode('hour');
    };

    const handleCancel = () => {
        onCancel();
        setMode('hour');
    };

    const renderClockNumbers = () => {
        const elements = [];

        if (mode === 'hour') {
            // Külső kör: 1-12
            for (let i = 1; i <= 12; i++) {
                const angle = (i * 30) - 90;
                const radius = 90;
                const x = radius * Math.cos(angle * Math.PI / 180);
                const y = radius * Math.sin(angle * Math.PI / 180);
                const isSelected = hour === i || (hour === 0 && i === 12);

                elements.push(
                    <div
                        key={`outer-${i}`}
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}px)`,
                            top: `calc(50% + ${y}px)`,
                            transform: 'translate(-50%, -50%)',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontWeight: isSelected ? 'bold' : 'normal',
                            backgroundColor: isSelected ? '#1890ff' : 'transparent',
                            color: isSelected ? '#fff' : '#000',
                            fontSize: '14px',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setHour(i === 12 && hour >= 12 ? 0 : i);
                            setHourInput(String(i === 12 && hour >= 12 ? 0 : i).padStart(2, '0'));
                            setMode('minute');
                        }}
                    >
                        {i}
                    </div>
                );
            }

            // Belső kör: 13-24 (0)
            for (let i = 0; i < 12; i++) {
                const displayValue = i === 0 ? 0 : i + 12;
                const angle = ((i === 0 ? 12 : i) * 30) - 90;
                const radius = 55;
                const x = radius * Math.cos(angle * Math.PI / 180);
                const y = radius * Math.sin(angle * Math.PI / 180);
                const isSelected = hour === displayValue;

                elements.push(
                    <div
                        key={`inner-${i}`}
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}px)`,
                            top: `calc(50% + ${y}px)`,
                            transform: 'translate(-50%, -50%)',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontWeight: isSelected ? 'bold' : 'normal',
                            backgroundColor: isSelected ? '#1890ff' : 'transparent',
                            color: isSelected ? '#fff' : '#666',
                            fontSize: '12px',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setHour(displayValue);
                            setHourInput(String(displayValue).padStart(2, '0'));
                            setMode('minute');
                        }}
                    >
                        {displayValue}
                    </div>
                );
            }
        } else {
            // Perc: 0, 5, 10, ..., 55
            for (let i = 0; i < 12; i++) {
                const value = i * 5;
                const angle = (value * 6) - 90;
                const radius = 90;
                const x = radius * Math.cos(angle * Math.PI / 180);
                const y = radius * Math.sin(angle * Math.PI / 180);
                const isSelected = minute === value;

                elements.push(
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}px)`,
                            top: `calc(50% + ${y}px)`,
                            transform: 'translate(-50%, -50%)',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontWeight: isSelected ? 'bold' : 'normal',
                            backgroundColor: isSelected ? '#1890ff' : 'transparent',
                            color: isSelected ? '#fff' : '#000',
                            fontSize: '12px',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setMinute(value);
                            setMinuteInput(String(value).padStart(2, '0'));
                        }}
                    >
                        {String(value).padStart(2, '0')}
                    </div>
                );
            }
        }
        return elements;
    };

    const renderHand = () => {
        // Nincs jelölő - csak a számok látszanak
        return null;
    };

    return (
        <Modal
            title="Időpont kiválasztása"
            open={visible}
            onOk={handleOk}
            onCancel={handleCancel}
            okText="OK"
            cancelText="Mégse"
            width={400}
        >
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <Input
                        value={hourInput}
                        onChange={(e) => handleHourInputChange(e.target.value)}
                        onFocus={() => setMode('hour')}
                        style={{
                            width: '60px',
                            fontSize: '32px',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            color: mode === 'hour' ? '#1890ff' : '#000',
                        }}
                        maxLength={2}
                    />
                    <span style={{ fontSize: '32px', fontWeight: 'bold' }}>:</span>
                    <Input
                        value={minuteInput}
                        onChange={(e) => handleMinuteInputChange(e.target.value)}
                        onFocus={() => setMode('minute')}
                        style={{
                            width: '60px',
                            fontSize: '32px',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            color: mode === 'minute' ? '#1890ff' : '#000',
                        }}
                        maxLength={2}
                    />
                </div>
                <div style={{ fontSize: '16px', marginBottom: '20px', color: '#666' }}>
                    {mode === 'hour' ? 'Válassza ki az órát' : 'Válassza ki a percet'}
                </div>
                <div
                    ref={clockRef}
                    onClick={handleClockClick}
                    style={{
                        width: '260px',
                        height: '260px',
                        borderRadius: '50%',
                        border: '2px solid #e8e8e8',
                        position: 'relative',
                        margin: '0 auto',
                        cursor: 'pointer',
                        backgroundColor: '#fafafa',
                    }}
                >
                    {renderClockNumbers()}
                    {renderHand()}
                </div>
            </div>
        </Modal>
    );
};

export default ClockPicker;
