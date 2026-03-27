import struct, zlib

def make_png(size, filename):
    def create_png(width, height):
        def png_chunk(chunk_type, data):
            c = chunk_type + data
            return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

        signature = b'\x89PNG\r\n\x1a\n'
        ihdr = png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))

        pixels = []
        bg = (13, 13, 20)
        accent = (255, 159, 28)

        for y in range(height):
            row = [0]
            for x in range(width):
                cx, cy = x - width//2, y - height//2
                r = min(width, height) * 0.35
                in_circle = (cx*cx + cy*cy) <= r*r
                if in_circle:
                    row += list(accent)
                else:
                    row += list(bg)
            pixels.append(bytes(row))

        compressed = zlib.compress(b''.join(pixels))
        idat = png_chunk(b'IDAT', compressed)
        iend = png_chunk(b'IEND', b'')
        return signature + ihdr + idat + iend

    with open(filename, 'wb') as f:
        f.write(create_png(size, size))

make_png(192, 'icon-192.png')
make_png(512, 'icon-512.png')
print('Iconos creados')
