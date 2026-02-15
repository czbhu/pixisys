# PixiFAM

Különálló FAM (felhőalapú e-pénztárgép) service, elkülönítve az ERP-től.

## Cél
- NAV/FAM kommunikációs réteg külön szolgáltatásban
- ERP csak UX és üzleti folyamat
- POS UI külön FAM API-n keresztül csatlakozik

## Local futtatás
```bash
cd pixifam
cp .env.example .env
./run.sh
```

Alap URL: `http://localhost:8010`

## Restart-biztos state
- A FAM állapot (`systems`, NAV config, queue, események, hibák) automatikusan mentésre kerül JSON fájlba.
- Alapértelmezett mentési útvonal: `pixifam/data/state.json`
- Felülírható env változóval: `FAM_STATE_FILE`

## Live connector (API kulcsos)
- `NAV konfiguráció` fülön töltsd ki:
	- `connector`: `cloud_fam` vagy `hepg`
	- `base_url` (pl. teszt környezet URL)
	- `api_key`
	- `live_submit_path` (alap: `/api/customers/submit_document/`)
	- `live_taxpayer_path` (alap: `/api/customers/lookup_taxpayer/`)
- Live módban a dokumentum queue ezekre a végpontokra küld.
- A `tech_user / tech_password / signing / exchange` mezők kompatibilitási célból megmaradtak.

### HePG (hardveres) mód
- `connector=hepg` esetén a dokumentum queue a HePG végpontra küld.
- Kötelező mezők live módban:
	- `hepg_base_url`
	- `hepg_submit_path` (alap: `/api/v1/receipt`)
- Opcionális:
	- `hepg_api_key`
	- `hepg_device_id` (ha üres, a `systemId` megy tovább)

### Live smoke script
```bash
cd pixifam
python3 scripts/fam_live_smoke.py \
	--connector cloud_fam \
	--nav-base-url "https://<teszt-kornyezet-url>" \
	--api-key "<API_KULCS>"
```

HePG például:
```bash
cd pixifam
python3 scripts/fam_live_smoke.py \
	--connector hepg \
	--hepg-base-url "http://<hepg-ip>:<port>" \
	--hepg-submit-path "/api/v1/receipt" \
	--hepg-api-key "<HEPG_API_KEY>" \
	--hepg-device-id "HEPG-01"
```

Hasznos opciók:
- `--system-id C00000001`
- `--connector cloud_fam|hepg`
- `--submit-path /api/customers/submit_document/`
- `--taxpayer-path /api/customers/lookup_taxpayer/`
- `--hepg-base-url http://<hepg-ip>:<port>`
- `--hepg-submit-path /api/v1/receipt`
- `--keep-live` (ne állítsa vissza a korábbi configot)
- `--allow-submit-failure` (kapcsolatpróbához)

## Fő endpointok
- `GET /health`
- `GET /api/v1/fam/system/status/{systemId}`
- `GET /api/v1/fam/system/state-check/{systemId}/{timestamp}`
- `POST /api/v1/fam/fiscal/open-day`
- `POST /api/v1/fam/fiscal/close-day`
- `POST /api/v1/fam/telemetry/hello`
- `POST /api/v1/fam/telemetry/query-taxpayer`
- `POST /api/v1/fam/telemetry/ecr-event`
- `GET|POST /api/v1/fam/currency/{systemId}`
- `GET|DELETE /api/v1/fam/currency/{systemId}/{currencyCode}`
- `GET /api/v1/fam/payment-method/predefined`
- `GET|POST /api/v1/fam/payment-method/{systemId}`
- `GET|DELETE /api/v1/fam/payment-method/{systemId}/{paymentMethodId}`

## Domain átállás
Amíg nincs `fam.pixisys.eu`, localhoston használható.
Később a POS UI-ban csak a `REACT_APP_FAM_API_URL` értékét kell átírni.
