/**
 * Lightweight Zero-Dependency ZIP Builder (STORE mode)
 * Creates valid .zip files directly in the browser without external libraries.
 */

export interface ZipFileEntry {
  filename: string; // e.g. "backend/main.py" or "frontend/src/App.tsx"
  content: string | Uint8Array;
}

// ── CRC-32 Implementation ───────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Binary Helper ────────────────────────────────────────────────

class BinaryWriter {
  private chunks: Uint8Array[] = [];

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
  }

  writeUint16(value: number): void {
    const buf = new Uint8Array(2);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    this.chunks.push(buf);
  }

  writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    buf[2] = (value >> 16) & 0xff;
    buf[3] = (value >> 24) & 0xff;
    this.chunks.push(buf);
  }

  toBlob(): Blob {
    return new Blob(this.chunks as BlobPart[], { type: 'application/zip' });
  }

  getTotalSize(): number {
    return this.chunks.reduce((acc, c) => acc + c.length, 0);
  }
}

// ── ZIP Generator ────────────────────────────────────────────────

/**
 * Generate a downloadable .zip Blob from an array of file entries.
 */
export function createZipBlob(files: ZipFileEntry[]): Blob {
  const writer = new BinaryWriter();
  const encoder = new TextEncoder();

  interface RecordMeta {
    filenameBytes: Uint8Array;
    crc32: number;
    size: number;
    offset: number;
  }

  const centralDirRecords: RecordMeta[] = [];

  // Write local file headers and file data
  for (const file of files) {
    const filenameBytes = encoder.encode(file.filename.replace(/\\/g, '/'));
    const contentBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = calculateCrc32(contentBytes);
    const offset = writer.getTotalSize();

    // Local file header signature (0x04034b50)
    writer.writeUint32(0x04034b50);
    writer.writeUint16(0x000a); // version needed (1.0)
    writer.writeUint16(0x0000); // general bit flag
    writer.writeUint16(0x0000); // compression method (STORE)
    writer.writeUint16(0x0000); // dos time
    writer.writeUint16(0x0000); // dos date
    writer.writeUint32(crc);    // crc-32
    writer.writeUint32(contentBytes.length); // compressed size
    writer.writeUint32(contentBytes.length); // uncompressed size
    writer.writeUint16(filenameBytes.length); // file name length
    writer.writeUint16(0x0000); // extra field length

    // File name & content
    writer.writeBytes(filenameBytes);
    writer.writeBytes(contentBytes);

    centralDirRecords.push({
      filenameBytes,
      crc32: crc,
      size: contentBytes.length,
      offset,
    });
  }

  const centralDirStartOffset = writer.getTotalSize();

  // Write central directory headers
  for (const record of centralDirRecords) {
    // Central directory header signature (0x02014b50)
    writer.writeUint32(0x02014b50);
    writer.writeUint16(0x0014); // version made by (2.0)
    writer.writeUint16(0x000a); // version needed
    writer.writeUint16(0x0000); // general bit flag
    writer.writeUint16(0x0000); // compression method (STORE)
    writer.writeUint16(0x0000); // dos time
    writer.writeUint16(0x0000); // dos date
    writer.writeUint32(record.crc32);
    writer.writeUint32(record.size); // compressed size
    writer.writeUint32(record.size); // uncompressed size
    writer.writeUint16(record.filenameBytes.length);
    writer.writeUint16(0x0000); // extra field length
    writer.writeUint16(0x0000); // file comment length
    writer.writeUint16(0x0000); // disk number start
    writer.writeUint16(0x0000); // internal file attributes
    writer.writeUint32(0x00000000); // external file attributes
    writer.writeUint32(record.offset); // relative offset of local header

    writer.writeBytes(record.filenameBytes);
  }

  const centralDirEndOffset = writer.getTotalSize();
  const centralDirSize = centralDirEndOffset - centralDirStartOffset;

  // End of central directory record (0x06054b50)
  writer.writeUint32(0x06054b50);
  writer.writeUint16(0x0000); // number of this disk
  writer.writeUint16(0x0000); // disk where central directory starts
  writer.writeUint16(centralDirRecords.length); // total entries on disk
  writer.writeUint16(centralDirRecords.length); // total entries
  writer.writeUint32(centralDirSize); // size of central directory
  writer.writeUint32(centralDirStartOffset); // offset of central directory
  writer.writeUint16(0x0000); // zip comment length

  return writer.toBlob();
}

/**
 * Trigger a browser file download for a generated .zip file.
 */
export function downloadZip(files: ZipFileEntry[], zipName: string = 'ekans-codebase.zip'): void {
  const blob = createZipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
