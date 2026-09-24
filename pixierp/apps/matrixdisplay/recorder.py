"""HDPlayer forgalom-rögzítő: transzparens TCP proxy.

A felhasználáról: a HDPlayer-t a szerver IP-jére irányítjuk (a kártya helyett),
a proxy minden bájtot továbbít a valódi kártyának ÉS naplóz. A rögzített
forgalomból később a teljes HDPlayer protokoll kinyerhető és beépíthető.
"""
import os
import socket
import threading
import time

from django.conf import settings

# futó rögzítők: display_id -> {'thread', 'server', 'stop', 'log_path'}
RECORDERS = {}


def _log(log_path, text):
    with open(log_path, 'ab') as f:
        f.write(text if isinstance(text, bytes) else text.encode('utf-8', 'replace'))


def _hexdump(data):
    return data.hex()


def _pipe(src, dst, label, log_path, lock, counters):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            counters['packets'] += 1
            counters['bytes'] += len(data)
            with lock:
                _log(log_path, f'\n[{time.strftime("%H:%M:%S")}] {label} ({len(data)} bájt):\n'.encode())
                _log(log_path, _hexdump(data).encode() + b'\n')
            try:
                dst.sendall(data)
            except Exception:
                break
    except Exception:
        pass
    finally:
        try:
            src.close()
        except Exception:
            pass


def _handle_session(client_sock, target_addr, log_path, lock, counters):
    try:
        card_sock = socket.create_connection(target_addr, timeout=6)
    except Exception as exc:
        with lock:
            _log(log_path, f'\n[NEM SIKERULT A KARTYAHOZ KAPCSOLODNI: {exc}]\n'.encode())
        try:
            client_sock.close()
        except Exception:
            pass
        return
    t1 = threading.Thread(target=_pipe, args=(client_sock, card_sock, 'HDPlayer -> kartya', log_path, lock, counters), daemon=True)
    t2 = threading.Thread(target=_pipe, args=(card_sock, client_sock, 'kartya -> HDPlayer', log_path, lock, counters), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    try:
        card_sock.close()
    except Exception:
        pass


def start_recorder(display_id, listen_port, target_host, target_port):
    """Elindítja a rögzítő proxyt. Visszaadja a log fájl útvonalát."""
    if display_id in RECORDERS:
        raise RuntimeError('A rögzítő már fut ehhez a kijelzőhöz')

    log_dir = os.path.join(settings.MEDIA_ROOT, 'matrixdisplay', 'captures')
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f'capture_{display_id}_{time.strftime("%Y%m%d_%H%M%S")}.log')
    _log(log_path, f'HDPlayer forgalom-rögzítés\nCél: {target_host}:{target_port}\n'
                   f'Figyelt port: {listen_port}\nIndítás: {time.strftime("%Y-%m-%d %H:%M:%S")}\n'
                   f'Irányítsd a HDPlayer-t a szerver IP-jére (192.168.5.196), port {listen_port}!\n')

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', listen_port))
    server.listen(4)
    server.settimeout(1.0)

    lock = threading.Lock()
    counters = {'packets': 0, 'bytes': 0}
    stop = threading.Event()

    def _serve():
        while not stop.is_set():
            try:
                client_sock, _ = server.accept()
            except socket.timeout:
                continue
            except Exception:
                break
            threading.Thread(
                target=_handle_session,
                args=(client_sock, (target_host, target_port), log_path, lock, counters),
                daemon=True,
            ).start()
        try:
            server.close()
        except Exception:
            pass
        with lock:
            _log(log_path, f'\n[Rögzítés leállítva: {counters["packets"]} csomag, {counters["bytes"]} bájt]\n'.encode())
        RECORDERS.pop(display_id, None)

    thread = threading.Thread(target=_serve, daemon=True)
    RECORDERS[display_id] = {'thread': thread, 'stop': stop, 'log_path': log_path, 'counters': counters}
    thread.start()
    return log_path


def stop_recorder(display_id):
    rec = RECORDERS.pop(display_id, None)
    if not rec:
        return None
    rec['stop'].set()
    return rec['log_path']


def recorder_status(display_id):
    rec = RECORDERS.get(display_id)
    if not rec:
        return None
    return {
        'log_path': rec['log_path'],
        'packets': rec['counters']['packets'],
        'bytes': rec['counters']['bytes'],
    }
