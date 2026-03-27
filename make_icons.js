const zlib = require('zlib');
const fs = require('fs');

function makePng(size, filename) {
  const bg = [13, 13, 20];
  const accent = [255, 159, 28];
  const r = Math.min(size, size) * 0.35;
  const cx = size / 2, cy = size / 2;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const inCircle = dx * dx + dy * dy <= r * r;
      row.push(...(inCircle ? accent : bg));
    }
    rows.push(Buffer.from(row));
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);

  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const body = Buffer.concat([t, d]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  }

  function crc32(buf) {
    const table = makeCrcTable();
    let crc = 0xffffffff;
    for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
    return (crc ^ 0xffffffff);
  }

  function makeCrcTable() {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // signature
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);

  fs.writeFileSync(filename, png);
  console.log(`Creado: ${filename} (${size}x${size})`);
}

makePng(192, 'icon-192.png');
makePng(512, 'icon-512.png');
