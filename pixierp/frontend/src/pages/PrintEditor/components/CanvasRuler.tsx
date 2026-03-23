/**
 * CanvasRuler — mm-alapú vonalzó a canvas szélén.
 * Props:
 *   direction: 'h' (vízszintes, x-tengely) | 'v' (függőleges, y-tengely)
 *   totalMm: a teljes dokumentum mérete mm-ben
 *   scale: canvas px / mm arány (displayW / width_mm)
 *   offset: px eltolás a canvas-tól a wrapper-en belül (ruler saját szélességére)
 *   size: a vonalzó vastagsága px-ben (default 20)
 *   cursorMm: egér pozíciója mm-ben (mutat egy apró vonalat) — null ha nincs
 */
import React, { useEffect, useRef } from 'react';

const RULER_BG = '#f7f7f7';
const RULER_BORDER = '#d9d9d9';
const TICK_COLOR = '#888';
const LABEL_COLOR = '#666';
const CURSOR_COLOR = '#1890ff';

interface Props {
  direction: 'h' | 'v';
  totalMm: number;
  scale: number;        // px per mm on-screen
  size?: number;        // ruler thickness, default 20
  cursorMm: number | null;
  offsetMm?: number;    // mm offset for labels (e.g. -3 to start from bleed)
  reverse?: boolean;    // if true, labels count down (for Y axis with 0 at bottom)
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  dir: 'h' | 'v',
  totalMm: number,
  scale: number,        // display px per mm
  rulerSize: number,
  canvasLen: number,
  cursorMm: number | null,
  dpr: number,
  offsetMm: number,
  reverse: boolean,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // background
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // border line
  ctx.strokeStyle = RULER_BORDER;
  ctx.lineWidth = dpr;
  if (dir === 'h') {
    ctx.beginPath(); ctx.moveTo(0, rulerSize * dpr - dpr); ctx.lineTo(ctx.canvas.width, rulerSize * dpr - dpr); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(rulerSize * dpr - dpr, 0); ctx.lineTo(rulerSize * dpr - dpr, ctx.canvas.height); ctx.stroke();
  }

  // decide tick intervals based on scale (px/mm)
  // at least 4px between smallest ticks
  let minorMm = 1;
  if (scale < 1) minorMm = 5;
  if (scale < 0.5) minorMm = 10;
  const majorMm = minorMm * 5;

  ctx.font = `${9 * dpr}px sans-serif`;
  ctx.fillStyle = LABEL_COLOR;
  ctx.textBaseline = 'top';

  for (let mm = 0; mm <= totalMm + 0.001; mm += minorMm) {
    const px = mm * scale * dpr;
    const isMajor = Math.abs(mm % majorMm) < 0.001;
    const tickLen = isMajor ? rulerSize * 0.55 : rulerSize * 0.3;

    ctx.strokeStyle = TICK_COLOR;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    if (dir === 'h') {
      ctx.moveTo(px, (rulerSize - tickLen) * dpr);
      ctx.lineTo(px, rulerSize * dpr);
    } else {
      ctx.moveTo((rulerSize - tickLen) * dpr, px);
      ctx.lineTo(rulerSize * dpr, px);
    }
    ctx.stroke();

    if (isMajor) {
      ctx.save();
      const labelMm = reverse
        ? Math.round(totalMm + offsetMm - mm)   // reversed: 0 at bottom
        : Math.round(mm + offsetMm);              // normal: 0 at left/top
      const isOrigin = labelMm === 0;
      ctx.fillStyle = isOrigin ? CURSOR_COLOR : LABEL_COLOR;
      const label = String(labelMm);
      if (dir === 'h') {
        if (!isOrigin || canvasLen > 8) {
          ctx.fillText(label, px + 2 * dpr, 2 * dpr);
        }
      } else {
        if (!isOrigin) {
          ctx.translate(px, (rulerSize * 0.1) * dpr);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, -9 * dpr * label.length * 0.55, 0);
        } else if (canvasLen > 8) {
          ctx.fillText('0', 2 * dpr, px + 2 * dpr);
        }
      }
      ctx.restore();
      ctx.fillStyle = LABEL_COLOR;  // reset
    }
  }

  // cursor indicator (cursorMm is in user-facing coordinate system)
  if (cursorMm !== null) {
    const cursorRulerMm = reverse
      ? totalMm + offsetMm - cursorMm     // reverse: user 0=bottom → ruler mm
      : cursorMm - offsetMm;              // normal: user 0=left/cut edge → ruler mm
    if (cursorRulerMm >= 0 && cursorRulerMm <= totalMm) {
      const px = cursorRulerMm * scale * dpr;
      ctx.strokeStyle = CURSOR_COLOR;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      if (dir === 'h') {
        ctx.moveTo(px, 0);
        ctx.lineTo(px, rulerSize * dpr);
      } else {
        ctx.moveTo(0, px);
        ctx.lineTo(rulerSize * dpr, px);
      }
      ctx.stroke();
    }
  }
}

const CanvasRuler: React.FC<Props> = ({ direction, totalMm, scale, size = 20, cursorMm, offsetMm = 0, reverse = false }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = window.devicePixelRatio || 1;

  // The logical pixel length of the ruler along its main axis
  const displayLen = Math.round(totalMm * scale);

  const w = direction === 'h' ? displayLen : size;
  const h = direction === 'h' ? size : displayLen;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawRuler(ctx, direction, totalMm, scale, size, displayLen, cursorMm, dpr, offsetMm, reverse);
  }, [direction, totalMm, scale, size, displayLen, cursorMm, dpr, offsetMm, reverse]);

  return (
    <canvas
      ref={ref}
      width={w * dpr}
      height={h * dpr}
      style={{
        width: w,
        height: h,
        display: 'block',
        cursor: direction === 'h' ? 'ew-resize' : 'ns-resize',
        flexShrink: 0,
      }}
    />
  );
};

export default CanvasRuler;
