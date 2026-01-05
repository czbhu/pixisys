# Changelog

## 0.9.0 (2025-09-13)

- Backup/Restore: teljes körű mentés és visszaállítás
  - Választható scope-ok: cég, bankszámlák, e-mail beállítások, NAV konfigok, számlatömbök, ügyfelek, számlák és tételeik, díjbekérők, bankkivonatok és tételeik, bejövő számlák (digest+data), ÁFA típusok, felhasználók (M2M céges kapcsolatokkal)
  - Fájlnév: cégnév rövid + dátum (JSON letöltés)
  - Import stratégia: replace/merge, számlák deduplikáció számlaszám alapján
- Bejövő számlák és banki folyamatok
  - `.stm`/ZIP import, előnézet és ellenőrzés
  - Fuzzy párosítás banki tételek és számlák között
  - Csoportos utalási csomagok, SEPA export
- Számlázás és nyomtatás
  - Devizanem megjelenítés harmonizálása
  - Egységesített print nézet
- Törzsadat bővítések
  - ÁFA típusok bővítése és migrációk
  - Ügyfél és bankszámla kezelések finomításai
- Felhasználók (SystemUser)
  - Létrehozás, szerkesztés, céges kapcsolat, jelszó beállítás/ellenőrzés
- Egyéb
  - Hibajavítások, stabilitás és naplózás finomítások

Megjegyzés: a mentés bizalmas adatokat tartalmazhat (jelszó hash, NAV titkok). Kezelésükhöz javasolt titkosított tárolás és átvitel.
