import qrcode from 'qrcode-generator';

/**
 * A QR code as one SVG path: `size` squares a side, each dark one drawn as
 * a unit square. Medium error correction, so a scuffed or slightly folded
 * print still scans. Draw it in a viewBox with a four-square margin.
 */
export function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
  }
  return { size, d };
}
