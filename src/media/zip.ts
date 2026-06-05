export type StoredZipEntry = {
  name: string;
  data: Blob | Uint8Array | string;
  modifiedAt?: Date;
};

const textEncoder = new TextEncoder();

export async function createStoredZip(entries: StoredZipEntry[]): Promise<Blob> {
  const prepared = await Promise.all(
    entries.map(async (entry) => ({
      nameBytes: textEncoder.encode(normalizeZipEntryName(entry.name)),
      data: await zipEntryData(entry.data),
      modifiedAt: entry.modifiedAt || new Date(),
    })),
  );
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of prepared) {
    const crc = crc32(entry.data);
    const dosTimeDate = dosDateTime(entry.modifiedAt);
    const localHeader = createLocalFileHeader(entry.nameBytes, entry.data.length, crc, dosTimeDate);
    chunks.push(localHeader, entry.data);
    centralDirectory.push(createCentralDirectoryHeader(entry.nameBytes, entry.data.length, crc, dosTimeDate, offset));
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  for (const header of centralDirectory) {
    chunks.push(header);
    offset += header.length;
  }
  chunks.push(createEndOfCentralDirectory(prepared.length, offset - centralDirectoryOffset, centralDirectoryOffset));

  const archive = concatUint8Arrays(chunks);
  const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  return new Blob([archiveBuffer], { type: "application/zip" });
}

async function zipEntryData(data: Blob | Uint8Array | string): Promise<Uint8Array> {
  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

function normalizeZipEntryName(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "") || "entry";
}

function createLocalFileHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  dosTimeDate: { time: number; date: number },
): Uint8Array {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTimeDate.time, true);
  view.setUint16(12, dosTimeDate.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(nameBytes, 30);
  return header;
}

function createCentralDirectoryHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  dosTimeDate: { time: number; date: number },
  localHeaderOffset: number,
): Uint8Array {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTimeDate.time, true);
  view.setUint16(14, dosTimeDate.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  header.set(nameBytes, 46);
  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return header;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
}
