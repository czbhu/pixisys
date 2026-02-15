#!/usr/bin/env python3
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def http_json(method: str, url: str, payload=None, timeout: int = 20):
    body = None
    headers = {'Accept': 'application/json'}
    if payload is not None:
        body = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    req = Request(url=url, method=method.upper(), data=body, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode('utf-8') if exc.fp else ''
        parsed = {'raw': raw}
        try:
            parsed = json.loads(raw)
        except Exception:
            pass
        return exc.code, parsed
    except URLError as exc:
        raise RuntimeError(f'Network hiba: {exc}') from exc


def now_suffix() -> str:
    return datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')


def parse_args():
    parser = argparse.ArgumentParser(description='FAM live end-to-end smoke script')
    parser.add_argument('--fam-base', default='http://localhost:8010/api/v1/fam', help='FAM API base URL')
    parser.add_argument('--system-id', default='C00000001', help='FAM rendszer azonosító')
    parser.add_argument('--connector', choices=['cloud_fam', 'hepg'], default='cloud_fam', help='Live connector típus')
    parser.add_argument('--nav-base-url', default='', help='Live NAV/PixiInvoice base URL (cloud_fam)')
    parser.add_argument('--api-key', default='', help='Live API kulcs (cloud_fam)')
    parser.add_argument('--submit-path', default='/api/customers/submit_document/', help='Live submit endpoint path')
    parser.add_argument('--taxpayer-path', default='/api/customers/lookup_taxpayer/', help='Live taxpayer endpoint path')
    parser.add_argument('--hepg-base-url', default='', help='HePG base URL (hepg)')
    parser.add_argument('--hepg-submit-path', default='/api/v1/receipt', help='HePG submit endpoint path')
    parser.add_argument('--hepg-api-key', default='', help='HePG API kulcs (opcionális)')
    parser.add_argument('--hepg-device-id', default='', help='HePG eszköz azonosító (opcionális)')
    parser.add_argument('--document-type', choices=['receipt', 'invoice'], default='receipt')
    parser.add_argument('--total-gross', type=float, default=1234.0)
    parser.add_argument('--timeout', type=int, default=20)
    parser.add_argument('--keep-live', action='store_true', help='Ne állítsa vissza a korábbi NAV configot')
    parser.add_argument('--allow-submit-failure', action='store_true', help='Ne adjon hibakódot, ha a live submit sikertelen')
    return parser.parse_args()


def main():
    args = parse_args()
    if args.connector == 'cloud_fam':
        if not args.nav_base_url.strip():
            print('HIBA: --nav-base-url kötelező cloud_fam connector esetén')
            return 2
        if not args.api_key.strip():
            print('HIBA: --api-key kötelező cloud_fam connector esetén')
            return 2
    if args.connector == 'hepg' and not args.hepg_base_url.strip():
        print('HIBA: --hepg-base-url kötelező hepg connector esetén')
        return 2

    fam_base = args.fam_base.rstrip('/')
    cfg_url = f'{fam_base}/config/nav/{args.system_id}'
    readiness_url = f'{fam_base}/readiness/{args.system_id}'
    submit_url = f'{fam_base}/documents/submit'

    print('1) Jelenlegi config lekérése...')
    status, current_cfg_res = http_json('GET', cfg_url, timeout=args.timeout)
    if status != 200 or 'config' not in current_cfg_res:
        print(f'HIBA: config lekérés sikertelen ({status}) -> {current_cfg_res}')
        return 2

    previous_cfg = current_cfg_res['config']

    live_cfg = {
        **previous_cfg,
        'mode': 'live',
        'env': previous_cfg.get('env') or 'sandbox',
        'connector': args.connector,
        'base_url': args.nav_base_url,
        'api_key': args.api_key,
        'live_submit_path': args.submit_path,
        'live_taxpayer_path': args.taxpayer_path,
        'hepg_base_url': args.hepg_base_url,
        'hepg_submit_path': args.hepg_submit_path,
        'hepg_api_key': args.hepg_api_key,
        'hepg_device_id': args.hepg_device_id,
        'invoice_enabled': True,
        'ereceipt_enabled': True,
        'timeout_sec': max(int(args.timeout), 3),
    }

    print('2) Live config beállítása...')
    status, put_res = http_json('PUT', cfg_url, payload=live_cfg, timeout=args.timeout)
    if status != 200:
        print(f'HIBA: live config mentés sikertelen ({status}) -> {put_res}')
        return 3

    print('3) Readiness ellenőrzés...')
    status, readiness = http_json('GET', readiness_url, timeout=args.timeout)
    if status == 200:
        print(json.dumps(readiness, ensure_ascii=False, indent=2))
    else:
        print(f'FIGYELEM: readiness hiba ({status}) -> {readiness}')

    external_id = f'LIVE-SMOKE-{now_suffix()}'
    payload = {
        'systemId': args.system_id,
        'documentType': args.document_type,
        'source': 'manual',
        'externalId': external_id,
        'payload': {
            'totalGross': args.total_gross,
            'note': 'FAM live smoke test',
        },
    }

    print(f'4) Dokumentum submit ({external_id})...')
    status, submit_res = http_json('POST', submit_url, payload=payload, timeout=args.timeout)
    print(json.dumps(submit_res, ensure_ascii=False, indent=2))

    doc_status = (submit_res.get('document') or {}).get('status') if isinstance(submit_res, dict) else None
    ok = status == 200 and doc_status == 'sent'

    if not args.keep_live:
        print('5) Eredeti config visszaállítása...')
        restore_status, restore_res = http_json('PUT', cfg_url, payload=previous_cfg, timeout=args.timeout)
        if restore_status != 200:
            print(f'FIGYELEM: visszaállítás sikertelen ({restore_status}) -> {restore_res}')

    if ok:
        print('OK: live submit sikeres.')
        return 0

    if args.allow_submit_failure:
        print('FIGYELEM: live submit sikertelen, de --allow-submit-failure miatt 0-val kilépünk.')
        return 0

    print('HIBA: live submit nem lett sent státuszú.')
    return 4


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\nMegszakítva.')
        sys.exit(130)
    except Exception as exc:
        print(f'HIBA: {exc}')
        sys.exit(1)
