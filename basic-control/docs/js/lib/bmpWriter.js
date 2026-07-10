/**
 * bmpWriter.js — Pure BMP byte-stream writer
 * ==========================================
 * Zero DOM dependencies. Takes a 2D color matrix and returns an ArrayBuffer
 * containing a valid 24-bit BMP file.
 *
 * BMP format (little-endian throughout):
 *   - BITMAPFILEHEADER (14 bytes): signature, file size, reserved, pixel offset
 *   - BITMAPINFOHEADER (40 bytes): dimensions, 1 plane, 24 bpp, no compression
 *   - Pixel data: bottom-up, BGR byte order, each row padded to 4-byte boundary
 *
 * Usable in browser (Blob download) or server-side (Node.js Buffer / fs).
 *
 * @param {Array<Array<{r:number,g:number,b:number}>>} matrix — 2D array, matrix[row][col]
 * @param {number} width  — number of columns
 * @param {number} height — number of rows
 * @returns {ArrayBuffer}
 */
export function generateBmpBuffer(matrix, width, height) {
    const BYTES_PER_PIXEL = 3;                          // 24-bit RGB
    const HEADER_SIZE = 54;                             // 14 (file) + 40 (info)
    const unpaddedRowSize = width * BYTES_PER_PIXEL;
    const rowPadding = (4 - (unpaddedRowSize % 4)) % 4; // pad each row to 4-byte multiple
    const rowSize = unpaddedRowSize + rowPadding;
    const pixelArraySize = rowSize * height;
    const fileSize = HEADER_SIZE + pixelArraySize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    let off = 0;

    // ── BITMAPFILEHEADER (14 bytes) ──────────────────────────────────
    view.setUint8(off++, 0x42);  // 'B'
    view.setUint8(off++, 0x4D);  // 'M'
    view.setUint32(off, fileSize, true);  off += 4;
    view.setUint16(off, 0, true);         off += 2;  // bfReserved1
    view.setUint16(off, 0, true);         off += 2;  // bfReserved2
    view.setUint32(off, HEADER_SIZE, true); off += 4; // bfOffBits

    // ── BITMAPINFOHEADER (40 bytes) ──────────────────────────────────
    view.setUint32(off, 40, true);     off += 4;  // biSize
    view.setUint32(off, width, true);  off += 4;  // biWidth
    view.setUint32(off, height, true); off += 4;  // biHeight (positive = bottom-up)
    view.setUint16(off, 1, true);      off += 2;  // biPlanes
    view.setUint16(off, 24, true);     off += 2;  // biBitCount (24 bpp)
    view.setUint32(off, 0, true);      off += 4;  // biCompression (BI_RGB = none)
    view.setUint32(off, pixelArraySize, true); off += 4; // biSizeImage
    view.setUint32(off, 2835, true);   off += 4;  // biXPelsPerMeter (~72 DPI)
    view.setUint32(off, 2835, true);   off += 4;  // biYPelsPerMeter (~72 DPI)
    view.setUint32(off, 0, true);      off += 4;  // biClrUsed (0 = full palette)
    view.setUint32(off, 0, true);      off += 4;  // biClrImportant

    // ── Pixel data (bottom row first, BGR byte order) ────────────────
    // BMP stores rows bottom-to-top: matrix[0] is the bottom event row.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const color = matrix[y][x];
            view.setUint8(off++, color.b);  // Blue
            view.setUint8(off++, color.g);  // Green
            view.setUint8(off++, color.r);  // Red
        }
        // Row padding
        for (let p = 0; p < rowPadding; p++) {
            view.setUint8(off++, 0);
        }
    }

    return buffer;
}
