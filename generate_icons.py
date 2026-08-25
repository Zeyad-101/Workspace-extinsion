"""Generate placeholder PNG icons for the Workspace Launcher extension.

Creates valid 16x16, 48x48, and 128x128 PNGs using only the Python
standard library (struct + zlib). No Pillow required.

The icon design: a cobalt rounded square with a white "stack" of three
offset horizontal bars — a larger version of the brand mark in the popup.
"""
from __future__ import annotations

import os
import struct
import zlib

# Cobalt accent #1e4fd9
BG = (30, 79, 217, 255)
# Stack bar color
FG = (255, 255, 255, 255)
# Transparent
TP = (0, 0, 0, 0)

OUT_DIR = r'D:\AI projects\claude\workspace extinsion\workspace-launcher\icons'
SIZES = [16, 48, 128]


def in_rounded_rect(x: int, y: int, size: int, radius: int) -> bool:
    """Return True if (x, y) is inside a rounded square of `size` x `size`
    with corner radius `radius`."""
    if x < 0 or y < 0 or x >= size or y >= size:
        return False
    # corners
    if x < radius and y < radius:
        dx, dy = radius - x, radius - y
        return dx * dx + dy * dy <= radius * radius
    if x >= size - radius and y < radius:
        dx, dy = x - (size - radius - 1), radius - y
        return dx * dx + dy * dy <= radius * radius
    if x < radius and y >= size - radius:
        dx, dy = radius - x, y - (size - radius - 1)
        return dx * dx + dy * dy <= radius * radius
    if x >= size - radius and y >= size - radius:
        dx, dy = x - (size - radius - 1), y - (size - radius - 1)
        return dx * dx + dy * dy <= radius * radius
    return True


def in_bar(x: int, y: int, size: int, bar_index: int) -> bool:
    """Three horizontal bars, each shifted right slightly for the stack feel.

    bar_index: 0, 1, 2 (top, middle, bottom)
    Bar thickness and vertical position scale with `size`.
    """
    # Each bar: ~10% of size tall, gap ~20% of size between
    thickness = max(1, round(size * 0.10))
    gap = round(size * 0.18)
    bar_width = [
        round(size * 0.50),
        round(size * 0.65),
        round(size * 0.80),
    ][bar_index]
    # Vertical center positions, top-anchored
    top = [
        round(size * 0.18),
        round(size * 0.45),
        round(size * 0.72),
    ][bar_index]
    # Right offset (bars get progressively longer on the right)
    right_offset = [
        round(size * 0.10),
        round(size * 0.05),
        0,
    ][bar_index]
    left = size - bar_width - right_offset
    right = size - right_offset
    return left <= x < right and top <= y < top + thickness


def pixel_at(x: int, y: int, size: int) -> tuple[int, int, int, int]:
    if in_bar(x, y, size, 0) or in_bar(x, y, size, 1) or in_bar(x, y, size, 2):
        return FG
    if in_rounded_rect(x, y, size, max(2, round(size * 0.18))):
        return BG
    return TP


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    length = struct.pack('>I', len(data))
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return length + chunk_type + data + struct.pack('>I', crc)


def make_png(size: int) -> bytes:
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: None
        for x in range(size):
            r, g, b, a = pixel_at(x, y, size)
            raw.extend((r, g, b, a))
    idat = zlib.compress(bytes(raw), 9)
    return sig + png_chunk(b'IHDR', ihdr) + png_chunk(b'IDAT', idat) + png_chunk(b'IEND', b'')


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f'icon{size}.png')
        data = make_png(size)
        with open(path, 'wb') as fh:
            fh.write(data)
        print(f'wrote {path} ({len(data)} bytes, {size}x{size})')


if __name__ == '__main__':
    main()
