"""Shared utility: archive an outgoing email into the IMAP "Sent" folder.

This mirrors the proven append-logic that already exists in apps/sales/views.py
and apps/core/views.py, packaged as a single re-usable function so every place
that sends mail can also keep a copy on the IMAP server.

Both EmailServerConfig (apps.core) field names (imap_username/imap_password)
and CompanyEmailSettings-style (imap_user/imap_password) are supported.
"""
from __future__ import annotations

import imaplib
import logging
import re as _re
import ssl
from datetime import datetime

logger = logging.getLogger(__name__)


def _cfg_get(cfg, *names, default=None):
    for n in names:
        v = getattr(cfg, n, None)
        if v not in (None, ''):
            return v
    return default


def _to_bytes(message_or_bytes) -> bytes | None:
    """Accept Django EmailMessage, stdlib email.message.Message, or raw bytes."""
    if message_or_bytes is None:
        return None
    if isinstance(message_or_bytes, (bytes, bytearray)):
        return bytes(message_or_bytes)
    # Django EmailMessage
    if hasattr(message_or_bytes, 'message') and callable(message_or_bytes.message):
        try:
            return message_or_bytes.message().as_bytes()
        except Exception:
            pass
    # stdlib email.message.Message / EmailMessage
    if hasattr(message_or_bytes, 'as_bytes'):
        try:
            return message_or_bytes.as_bytes()
        except Exception:
            pass
    return None


def archive_to_imap_sent(cfg, message_or_bytes) -> bool:
    """Append a sent message to the configured IMAP Sent folder.

    Never raises. Returns True on success, False otherwise.
    """
    if cfg is None:
        return False
    imap_host = _cfg_get(cfg, 'imap_host')
    imap_user = _cfg_get(cfg, 'imap_username', 'imap_user')
    imap_pwd = _cfg_get(cfg, 'imap_password')
    if not (imap_host and imap_user and imap_pwd):
        return False
    imap_port = int(_cfg_get(cfg, 'imap_port', default=993) or 993)
    sent_folder = _cfg_get(cfg, 'imap_sent_folder', default='Sent') or 'Sent'

    mime_bytes = _to_bytes(message_or_bytes)
    if not mime_bytes:
        return False

    M = None
    try:
        try:
            if imap_port == 993:
                M = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ssl.create_default_context())
            else:
                M = imaplib.IMAP4(imap_host, imap_port)
                try:
                    M.starttls(ssl_context=ssl.create_default_context())
                except Exception:
                    pass
        except Exception:
            try:
                M = imaplib.IMAP4_SSL(imap_host)
            except Exception:
                M = imaplib.IMAP4(imap_host)

        if M is None:
            return False

        M.login(imap_user, imap_pwd)

        used_folder = sent_folder
        ok = False
        try:
            typ_chk, _ = M.select(used_folder, readonly=True)
            ok = (typ_chk == 'OK')
        except Exception:
            ok = False

        if not ok:
            # Try to discover a Sent folder via LIST
            try:
                typ_list, boxes = M.list()
                candidates = []
                if typ_list == 'OK' and boxes:
                    for rawline in boxes:
                        s = rawline.decode(errors='ignore') if isinstance(rawline, (bytes, bytearray)) else str(rawline)
                        m_flags = _re.search(r"\(([^)]*)\)", s)
                        flags_txt = m_flags.group(1) if m_flags else ''
                        m_q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                        name = m_q[-1] if m_q else (s.split()[-1] if s.split() else '')
                        try:
                            decoded = imaplib.IMAP4._decode_utf7(name.encode())
                            if decoded:
                                name = decoded
                        except Exception:
                            pass
                        if name in ('.', '', 'NIL'):
                            continue
                        if 'Noselect' in (flags_txt or '') or '\\Noselect' in (flags_txt or ''):
                            continue
                        candidates.append({'name': name, 'flags': flags_txt})
                cand = None
                for mb in candidates:
                    if '\\Sent' in (mb['flags'] or ''):
                        cand = mb['name']
                        break
                if not cand:
                    common = [
                        'Sent', 'Sent Items', 'Sent Mail', 'Sent Messages',
                        '[Gmail]/Sent Mail', 'INBOX/Sent', 'INBOX.Sent',
                        'Elküldött', 'Elküldött levelek', 'Elküldött üzenetek',
                        'Küldött elemek',
                    ]
                    lower = {mb['name'].lower(): mb['name'] for mb in candidates}
                    for cn in common:
                        if cn.lower() in lower:
                            cand = lower[cn.lower()]
                            break
                if cand:
                    used_folder = cand
            except Exception:
                pass

        flags = '(\\Seen)'
        date_time = imaplib.Time2Internaldate(datetime.now().timestamp())

        def _detect_delim(imap):
            try:
                typ0, boxes0 = imap.list('', '')
                if typ0 == 'OK' and boxes0:
                    s = boxes0[0].decode(errors='ignore') if isinstance(boxes0[0], (bytes, bytearray)) else str(boxes0[0])
                    q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                    if len(q) >= 2:
                        return q[-2]
            except Exception:
                pass
            return None

        def _try_create_and_append(imap, mailbox):
            try:
                typ_app, _ = imap.append(mailbox, flags, date_time, mime_bytes)
                if typ_app == 'OK':
                    return True
            except Exception:
                pass
            try:
                try:
                    imap.create(mailbox)
                except Exception:
                    pass
                try:
                    imap.subscribe(mailbox)
                except Exception:
                    pass
                typ_app2, _ = imap.append(mailbox, flags, date_time, mime_bytes)
                return typ_app2 == 'OK'
            except Exception:
                return False

        if _try_create_and_append(M, used_folder):
            return True
        delim = _detect_delim(M) or '.'
        variants = []
        if delim not in (None, '', 'NIL'):
            variants.extend([
                f'INBOX{delim}{used_folder}',
                f'Sent{delim}{used_folder}',
                f'Inbox{delim}{used_folder}',
            ])
        for v in variants:
            if _try_create_and_append(M, v):
                return True
        return False
    except Exception as e:
        logger.warning("archive_to_imap_sent failed: %s", e)
        return False
    finally:
        try:
            if M is not None:
                M.logout()
        except Exception:
            pass
