#!/usr/bin/env python3
"""Download the Global master.mdb from the public game CDN.

Flow: resource version (uma.moe API) -> root manifest -> Windows manifest ->
master manifest -> master.mdb.lz4. Every resource is verified by size and
xxhash64 before it is decompressed.

Protocol notes were learned by reading the UmaTools project (GPL-3.0); this
file is an independent implementation and contains no code from it.

Usage: python fetch_master.py OUTPUT_PATH
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

import lz4.block
import lz4.frame
import xxhash

VERSION_API = "https://uma.moe/api/ver"
CDN_ROOT = "https://assets-umamusume-en.akamaized.net/dl/vertical"
LIMIT = 256 * 1024 * 1024
USER_AGENT = "lineageplanner-ingest (+https://github.com/SaltyGamedev)"


def http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as resp:
        body = resp.read(LIMIT + 1)
    if len(body) > LIMIT:
        raise RuntimeError(f"response too large: {url}")
    return body


def unpack(blob: bytes) -> bytes:
    """Manifests and assets are raw, LZ4 frames, or size-prefixed LZ4 blocks."""
    if blob[:4] == b"\x04\x22\x4d\x18":
        return lz4.frame.decompress(blob)
    if blob[:2] == b"\xbf\x11" or blob[:16] == b"SQLite format 3\0":
        return blob
    expected = int.from_bytes(blob[:4], "little")
    if not 0 < expected <= LIMIT:
        raise RuntimeError("bad lz4 block header")
    out = lz4.block.decompress(blob[4:], uncompressed_size=expected)
    if len(out) != expected:
        raise RuntimeError("lz4 block size mismatch")
    return out


class Reader:
    def __init__(self, data: bytes, pos: int = 0):
        self.data, self.pos = data, pos

    def read(self, n: int) -> bytes:
        if n < 0 or self.pos + n > len(self.data):
            raise RuntimeError("truncated manifest")
        chunk = self.data[self.pos : self.pos + n]
        self.pos += n
        return chunk

    def varint(self) -> int:
        value = 0
        for _ in range(10):
            b = self.read(1)[0]
            value = (value << 7) | (b & 0x7F)
            if b < 0x80:
                return value
        raise RuntimeError("varint too long")

    def cstring(self) -> str:
        end = self.data.index(b"\0", self.pos)
        text = self.data[self.pos : end].decode("utf-8")
        self.pos = end + 1
        return text


def parse_manifest(data: bytes) -> list[list]:
    if data[:2] != b"\xbf\x11":
        raise RuntimeError("not a BSV manifest")
    r = Reader(data, 4)
    row_count = r.varint()
    r.varint()  # max row size
    r.varint()  # schema version
    col_count = r.varint()
    if row_count > 2_000_000 or not 1 <= col_count <= 64:
        raise RuntimeError("implausible manifest dimensions")
    columns = []
    for _ in range(col_count):
        kind = r.read(1)[0]
        fixed = ((kind - 0x21) & 0xCF) == 0 and kind != 0x51
        columns.append((kind, r.varint() if fixed else None))
    rows = []
    for _ in range(row_count):
        row = []
        for kind, width in columns:
            family = kind & 0xF0
            if family == 0x40:
                row.append(r.cstring())
            elif family == 0x10:
                row.append(r.varint())
            elif width and 1 <= width <= 8:
                row.append(int.from_bytes(r.read(width), "big"))
            else:
                raise RuntimeError(f"unsupported column kind {kind:#x}")
        rows.append(row)
    return rows


def download_entry(rows: list[list], name: str, category: str) -> bytes:
    hits = [row for row in rows if row and row[0] == name]
    if len(hits) != 1:
        raise RuntimeError(f"manifest entry {name!r} not unique ({len(hits)})")
    row = hits[0]
    size, checksum = (row[4], row[5]) if len(row) >= 7 else (row[1], row[2])
    key = checksum.to_bytes(8, "big") + size.to_bytes(8, "big") + name.encode()
    digest = base64.b32encode(hashlib.sha1(key).digest()).decode().rstrip("=")
    blob = http_get(f"{CDN_ROOT}/resources/{category}/{digest[:2]}/{digest}")
    if len(blob) != size or xxhash.xxh64(blob).intdigest() != checksum:
        raise RuntimeError(f"verification failed for {name}")
    return unpack(blob)


def fetch_master(out: Path) -> dict:
    info = json.loads(http_get(VERSION_API))
    version = str(info["resource_version"])
    if not re.fullmatch(r"\d{1,20}", version):
        raise RuntimeError("unexpected resource version")
    root = parse_manifest(unpack(http_get(f"{CDN_ROOT}/{version}/manifests/manifestdat/root.manifest.bsv.lz4")))
    platform = parse_manifest(download_entry(root, "Windows", "Manifest"))
    master = parse_manifest(download_entry(platform, "master", "Manifest"))
    db = download_entry(master, "master.mdb.lz4", "Generic")
    if not db.startswith(b"SQLite format 3\0"):
        raise RuntimeError("payload is not SQLite")
    out.write_bytes(db)
    with sqlite3.connect(f"file:{out}?mode=ro", uri=True) as con:
        if con.execute("pragma quick_check").fetchone()[0] != "ok":
            raise RuntimeError("sqlite integrity check failed")
    return {"resource_version": version, "app_version": info.get("app_version"), "bytes": len(db)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: fetch_master.py OUTPUT_PATH")
    print(json.dumps(fetch_master(Path(sys.argv[1]))))
