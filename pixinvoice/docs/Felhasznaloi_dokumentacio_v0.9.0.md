# PixInvoice – Felhasználói dokumentáció (v0.9.0)

## 1. Áttekintés
- Cél: Számlázás, bejövő számlák és banki folyamatok kezelése, automatikus egyeztetés, csoportos utalás és teljes körű biztonsági mentés/visszaállítás.
- Fő modulok: Beállítások, Törzsadatok, Számlák, Díjbekérők (Proforma), Bankkivonatok, Bejövő számlák, Felhasználók, Backup/Restore.
- Verzió: 0.9.0

## 2. Rendszerkövetelmények és indítás
- Backend: Django REST (alapból a 4001-es porton fut).
- Frontend: React (alapból a 4000-es porton fut).
- Indítás (Linux, bash):
  - Backend: `./start_backend.sh`
  - Frontend: `./start_frontend.sh`
- Elérés: Böngészőben `http://localhost:4000`

## 3. Beállítások (Settings)
- Cégadatok: Név, adószám, cím, bankszámlák.
- NAV konfigurációk: Technikai felhasználó, kulcsok, környezet. Több konfiguráció/kapcsolat támogatott céghez.
- E-mail beállítások: SMTP host/port, feladó adatok, opcionális Thunderbird integrációs mezők.
- Számlatömbök: Prefix, sorszámozás, NAV konfig hozzárendelése.
- Mentés/Visszaállítás (Backup/Restore): Lásd 10. fejezet.

## 4. Törzsadatok
- Ügyfelek (Customers): Név, adószám, címek, bankszámlák. Import/export a biztonsági mentés részeként.
- ÁFA típusok (VAT Types): Kategória, százalék, név. Kezdeti értékek feltöltve migrációkkal.
- Bankszámlák: Céghez és ügyfélhez is rendelhetők, devizanem kezeléssel.

## 5. Kimenő számlák (Invoices)
- Új számla létrehozása: Ügyfél kiválasztás, tételek (nettó/bruttó, ÁFA típus, mennyiség, mértékegység, megjegyzés).
- Devizanem és átváltás: Egységesített megjelenítés, formázás a print nézetben.
- Nyomtatás: Egységesített print nézet (frontend `src/print.css`, backend HTML sablon).
- NAV riportálás: A NAV-hoz kapcsolódó adatok és válaszok tárolhatók (ha konfigurálva).

## 6. Díjbekérők (Proforma)
- Létrehozás és tételek kezelése azonos logikával, mint a számláknál.
- Később végszámlává alakítható manuális folyamatokkal.

## 7. Bankkivonatok
- Import: `.stm` vagy banki forrásból kinyert adatok (UI: Bank Statements oldal). Több tétel egy kivonatban.
- Fuzzy párosítás: Bejövő utalások és kimenő számlák összerendelése (összeg, közlemény, partner alapján).
- Bankkivonat tételek: Partner és számla hivatkozás mentése, részleges/fennmaradó összegek kezelése.

## 8. Csoportos utalás (Payment Batches)
- Csomag létrehozása és tételek felvétele (szállítói kifizetések).
- Export: SEPA/egyéb formátum generálása és letöltése (backend végpont: `/api/payment-batches/{id}/export/`).
- Végrehajtási dátum és bankszámla hozzárendelés csomagszinten.

## 9. Bejövő számlák (Incoming)
- Digest és Data modellek: OCR/robot forrásokból származó metaadatok és teljes adatok tárolása.
- UI: Bejövő számlák oldal listázás, szerkesztés, párosítás.
- Backup részeként exportálhatók/importálhatók.

## 10. Biztonsági mentés és visszaállítás (Backup/Restore)
- Export végpont: `POST /api/companies/{company_id}/backup_export/`
  - Kérés törzs: `{"scopes":["company","bank_accounts","email_settings","nav_configs","invoice_blocks","customers","invoices","proformas","bank_statements","payment_batches","incoming","vat_types","users"]}`
  - Fájl: `CompanyShort_backup_YYYYMMDD.json`
- Import végpont: `POST /api/companies/{company_id}/backup_import/`
  - Többrészes űrlap: `file` (JSON), opcionálisan `strategy=replace|merge`, `scopes`.
  - Viselkedés:
    - `replace`: céges adatokhoz tartozó objektumokat cserél, újra létrehozza.
    - `merge`: egyes tételeknél (pl. számla) számlaszám alapján deduplikál.
- Tartalom (meta + adatok):
  - `meta.version`, `meta.exported_at`, `meta.company_id`, `meta.company_name`, `meta.scopes`.
  - Cég, Bankszámlák, E-mail beállítások, NAV konfigok, Számlatömbök.
  - Felhasználók (`system_users`) céges M2M kapcsolatokkal.
  - Ügyfelek, Számlák + tételek, Díjbekérők + tételek, Bankkivonatok + tételek, Bejövő adatok, ÁFA típusok.
- Biztonság: A mentés tartalmazhat jelszó hash-eket és NAV titkokat – csak biztonságos helyen tárolja és titkos csatornán mozgassa.

## 11. Felhasználók (System Users)
- Kezelés: Lista, létrehozás, szerkesztés, törlés (UI: System Users).
- Cégekhez rendelés: M2M kapcsolat – több céghez kapcsolható felhasználó.
- Jelszó: UI-ból beállítható; backend akciók: `set_password`, `check_password`.

## 12. Nyomtatás és megjelenítés
- Egységesített print nézet: logók, fejléc, lábléc, pénznem, összegmezők.
- CSS: `frontend/src/print.css`.

## 13. Adminisztráció és migrációk
- Migrációk a `invoice_app/invoices/migrations` mappában (ÁFA típusok, bankkivonatok, proforma, részfizetések, bejövő számlák, e-mail beállítások, stb.).
- Az indító script gondoskodik a migrációk futtatásáról.

## 14. API – Gyors referencia (részlet)
- Backup export: `POST /api/companies/{id}/backup_export/`
- Backup import: `POST /api/companies/{id}/backup_import/`
- Payment batch export: `POST /api/payment-batches/{id}/export/`
- Számlák: `GET/POST /api/invoices/`, `GET/PUT/PATCH/DELETE /api/invoices/{id}/`
- Díjbekérők: `GET/POST /api/proformas/`
- Bankkivonatok: `GET/POST /api/bank-statements/`
- Bejövő számlák: `GET/POST /api/incoming/…`
- Felhasználók: `GET/POST /api/users/` + akciók `set_password`, `check_password`

## 15. Hibaelhárítás
- 500-as hiba importnál: Ellenőrizze a JSON formátumot és a `strategy`/`scopes` paramétereket; nézze a backend logot `invoice_app/logs/backend.log`.
- SEPA export 404: Az export végpont `export` (nem `export-file`).

## 16. Verzió és kiadás
- Alkalmazás verzió: 0.9.0 (frontend `package.json`).
- Git tag: `v0.9.0`.
- Kiadási ág: `CoPilot-version`.

---
Ez a dokumentum a 0.9.0 verzió funkcionalitását foglalja össze. Kérdések/javaslatok esetén jelezze a karbantartónak.
