"""Huidu LED vezérlő kártyákhoz Python kliens.

Két protokoll:
- HuiduSDK2Client: SDK 2.0 bináris TCP (alapport 10001) – teljes színes kártyák
  (HDPlayer ökoszisztéma). Kézfogás: 0x2001 verzió → GetIFVersion (GUID),
  majd XML parancsok 0x2003 keretben (max 8000 bájt töredezik).
- Gen6 (HD2020, egyszínű kártyák): 'HT' mágiajelles csomagok, bájtok összege
  ellenőrzőként, csomagonkénti ACK. (alapszik a nyilvános reverse-engineeringre)

A protokoll forrása a visszafejtett Huidu SDK 2.0 leírás.
"""
import hashlib
import re
import socket
import struct
import time
import uuid

TRANSPORT_VERSION = 0x1000005
SDK_VERSION = 0x1000000
MAX_XML_CHUNK = 8000


class HuiduError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


class HuiduSDK2Client:
    """SDK 2.0 TCP kliens (rövid életű kapcsolat: connect → parancsok → close)."""

    def __init__(self, host, port=10001, timeout=6.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.sock = None
        self.guid = '##GUID'
        self._buf = b''

    # ------------------------------------------------------------- alap

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), self.timeout)
        self.sock.settimeout(self.timeout)
        # 1) transport verzió egyeztetés
        self._send(struct.pack('<HHI', 8, 0x2001, TRANSPORT_VERSION))
        ln, cmd, payload = self._recv_packet()
        if cmd != 0x2002:
            raise HuiduError(f'Váratlan válasz a verzió kézfogásra: cmd=0x{cmd:04x}')
        # 2) SDK verzió + GUID
        reply = self.xml_command('GetIFVersion', f'<version value="{SDK_VERSION:x}"/>')
        m = re.search(r'guid="([^"]+)"', reply or '')
        if m and m.group(1) and m.group(1) != '##GUID':
            self.guid = m.group(1)
        return self

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def __enter__(self):
        return self.connect()

    def __exit__(self, *exc):
        self.close()

    def _send(self, data):
        self.sock.sendall(data)

    def _recv_packet(self):
        """Egy teljes [2B len][2B cmd][payload] csomag beolvasása."""
        while len(self._buf) < 4:
            d = self.sock.recv(8192)
            if not d:
                raise HuiduError('A kártya lezárta a kapcsolatot')
            self._buf += d
        ln, cmd = struct.unpack('<HH', self._buf[:4])
        while len(self._buf) < ln:
            d = self.sock.recv(65536)
            if not d:
                raise HuiduError('A válasz megszakadt')
            self._buf += d
        payload = self._buf[4:ln]
        self._buf = self._buf[ln:]
        if cmd == 0x2000 and len(payload) >= 2:
            code = struct.unpack('<H', payload[:2])[0]
            raise HuiduError(f'A kártya hibakódot adott: {code}', code=code)
        return ln, cmd, payload

    # ------------------------------------------------------------- XML

    def _build_xml(self, method, inner=''):
        parts = ['<?xml version="1.0" encoding="utf-8"?>\r\n',
                 f'<sdk guid="{self.guid}">\r\n  <in method="{method}">']
        if inner:
            parts.append(f'\r\n    {inner}\r\n  ')
        parts.append('</in>\r\n</sdk>')
        return ''.join(parts).encode('utf-8')

    def xml_command(self, method, inner='', wait=None):
        """XML parancs küldése (automatikus töredekeléssel), válasz XML szöveg."""
        xml = self._build_xml(method, inner)
        offset = 0
        total = len(xml)
        while offset < total:
            chunk = xml[offset:offset + MAX_XML_CHUNK]
            header = struct.pack('<HHII', 12 + len(chunk), 0x2003, total, offset)
            self._send(header + chunk)
            offset += len(chunk)
        deadline = time.time() + (wait if wait is not None else self.timeout)
        xml_out = b''
        while time.time() < deadline:
            ln, cmd, payload = self._recv_packet()
            if cmd in (0x2004, 0x2003):
                # [4B teljes hossz][4B offset] + xml töredék
                if len(payload) >= 8:
                    total_out, off = struct.unpack('<II', payload[:8])
                    xml_out = xml_out[:off] + payload[8:]
                    if len(xml_out) >= total_out:
                        break
                else:
                    xml_out += payload
                    break
        return xml_out.decode('utf-8', 'replace')

    # ------------------------------------------------------- kényelmi metódusok

    def ping(self):
        """Kapcsolat teszt – a connect() már elvégezte a verzió+kézfogást;
        ha a GUID megvan, a kártya elérhető és a protokoll él."""
        ok = self.guid and self.guid != '##GUID'
        return {'ok': bool(ok),
                'guid': self.guid,
                'reply': f'Kézfogás sikeres (GUID: {self.guid})' if ok else 'A GUID egyeztetés nem sikerült'}


# ═══════════════════════════════════════ Gen6 (HD2020, egyszínű)

def gen6_checksum(data: bytes) -> bytes:
    s = sum(data) & 0xFFFF
    return bytes([s >> 8, s & 0xFF])


def gen6_packet(cmd: int, sequence: int, payload: bytes = b'') -> bytes:
    """'HT' fejléces Gen6 csomag: [H T ? 0x1b][2B BE totalLen][cmd][...][seq@26]
    [payload@27][2B checksum sum][0xAA]"""
    total = 27 + len(payload) + 3
    pkt = bytearray(total)
    pkt[0] = ord('H')
    pkt[1] = ord('T')
    pkt[3] = 0x1B
    struct.pack_into('>H', pkt, 4, total)
    pkt[6] = cmd & 0xFF
    pkt[26] = sequence & 0xFF
    pkt[27:27 + len(payload)] = payload
    chk = gen6_checksum(bytes(pkt[:total - 3]))
    pkt[total - 3] = chk[0]
    pkt[total - 2] = chk[1]
    pkt[total - 1] = 0xAA
    return bytes(pkt)


def gen6_validate(pkt: bytes) -> bool:
    if len(pkt) < 30 or pkt[:2] != b'HT' or pkt[-1] != 0xAA:
        return False
    return gen6_checksum(pkt[:-3]) == pkt[-3:-1]


class HuiduGen6Client:
    """HD2020 Gen6 protokoll (egyszínű kártyák) – csomagküldés ACK-val."""

    def __init__(self, host, port=10001, timeout=4.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.sock = None
        self.seq = 0

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), self.timeout)
        self.sock.settimeout(self.timeout)
        return self

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def __enter__(self):
        return self.connect()

    def __exit__(self, *exc):
        self.close()

    def send_packet(self, pkt, expect_ack=True):
        self.sock.sendall(pkt)
        if expect_ack:
            ack = self._recv_exact(27)
            if not ack or ack[:2] != b'HT':
                raise HuiduError(f'Érvénytelen ACK: {ack[:16] if ack else b""!r}')
        self.seq = (self.seq + 1) & 0xFF

    def _recv_exact(self, n):
        buf = b''
        while len(buf) < n:
            d = self.sock.recv(n - len(buf))
            if not d:
                break
            buf += d
        return buf

    def ping(self):
        """Kapcsolat + protokoll teszt: heartbeat/ lekérdezés jellegű csomag."""
        pkt = gen6_packet(0x00, self.seq)
        self.sock.sendall(pkt)
        try:
            ack = self._recv_exact(27)
            return {'ok': bool(ack and ack[:2] == b'HT'), 'reply': ack.hex() if ack else ''}
        except Exception as exc:
            return {'ok': False, 'reply': str(exc)}


def file_md5(path_or_file):
    h = hashlib.md5()
    if hasattr(path_or_file, 'read'):
        for chunk in iter(lambda: path_or_file.read(1 << 16), b''):
            h.update(chunk)
    else:
        with open(path_or_file, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 16), b''):
                h.update(chunk)
    return h.hexdigest()
