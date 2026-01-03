# PixiERP Automatikus Backup Rendszer

## Áttekintés

Az automatikus backup rendszer lehetővé teszi az adatbázis rendszeres mentését különböző gyakoriságokkal (napi, heti, havi). A rendszer automatikusan kezeli a régi backup-ok törlését a megadott megőrzési idő alapján.

## Backup Konfigurációk

### Alapértelmezett Konfigurációk

A rendszer telepítésekor két alapértelmezett konfiguráció jön létre:

1. **Napi automatikus mentés**
   - Gyakoriság: Napi
   - Megőrzés: 14 nap (2 hét)
   - Állapot: Aktív

2. **Heti automatikus mentés**
   - Gyakoriság: Heti
   - Megőrzés: 60 nap (2 hónap)
   - Állapot: Aktív

### Új Konfiguráció Létrehozása

A webes felületen (Beállítások > Backup) új konfigurációkat hozhat létre:
- Konfiguráció neve
- Mentési gyakoriság (napi/heti/havi)
- Megőrzési idő napokban
- Aktív/inaktív állapot

## Management Command

### Használat

```bash
# Összes aktív konfiguráció futtatása
python manage.py create_backup

# Csak egy adott intervallum futtatása
python manage.py create_backup --interval=daily
python manage.py create_backup --interval=weekly
python manage.py create_backup --interval=monthly
```

### Működés

1. Ellenőrzi az aktív konfigurációkat
2. Minden konfiguráció esetén ellenőrzi, hogy szükséges-e új backup (az utolsó backup ideje alapján)
3. Létrehozza a backup fájlt (másolja az SQLite adatbázist)
4. Rögzíti a backup információkat az adatbázisban
5. Automatikusan törli a megőrzési időn túli régi backup-okat

## Cron Job Beállítása

### Napi Backup (minden nap hajnali 2-kor)

```bash
0 2 * * * cd /wb2/pixisys/test/pixierp && source venv/bin/activate && python manage.py create_backup --interval=daily >> /wb2/pixisys/logs/backup-daily.log 2>&1
```

### Heti Backup (minden hétfőn hajnali 3-kor)

```bash
0 3 * * 1 cd /wb2/pixisys/test/pixierp && source venv/bin/activate && python manage.py create_backup --interval=weekly >> /wb2/pixisys/logs/backup-weekly.log 2>&1
```

### Havi Backup (minden hónap 1-jén hajnali 4-kor)

```bash
0 4 1 * * cd /wb2/pixisys/test/pixierp && source venv/bin/activate && python manage.py create_backup --interval=monthly >> /wb2/pixisys/logs/backup-monthly.log 2>&1
```

### Crontab Szerkesztése

```bash
crontab -e
```

Illessze be a fenti sorokat a crontab fájlba.

## Webes Kezelőfelület

### Funkciók

1. **Backup Konfigurációk Kezelése**
   - Új konfiguráció létrehozása
   - Meglévők szerkesztése
   - Konfiguráció aktiválása/deaktiválása
   - Utolsó backup idejének megjelenítése

2. **Backup Fájlok Kezelése**
   - Összes backup listázása
   - Fájl név, méret, létrehozási idő megjelenítése
   - Típus szerinti szűrés (manuális/automatikus)
   - Létrehozó felhasználó megjelenítése

3. **Műveletek**
   - **Új manuális backup**: Azonnal létrehoz egy backup-ot
   - **Letöltés**: Letölti a backup fájlt
   - **Visszaállítás**: Visszaállítja az adatbázist a kiválasztott backup-ból
   - **Törlés**: Törli a backup fájlt
   - **Régi backup-ok törlése**: Manuálisan futtatja a cleanup műveletet

## Backup Fájlok Elnevezése

- **Napi backup**: `daily_backup_YYYYMMDD_HHMMSS.sqlite3`
- **Heti backup**: `weekly_backup_YYYYMMDD_HHMMSS.sqlite3`
- **Havi backup**: `monthly_backup_YYYYMMDD_HHMMSS.sqlite3`
- **Manuális backup**: `manual_backup_YYYYMMDD_HHMMSS.sqlite3`

## Backup Fájlok Helye

```
/wb2/pixisys/test/pixierp/backups/
```

## Visszaállítás

### Webes Felületről

1. Navigáljon a **Beállítások > Backup** menüponthoz
2. Válassza ki a kívánt backup fájlt a listából
3. Kattintson a **Visszaállítás** gombra
4. Erősítse meg a műveletet

**Figyelem**: A visszaállítás előtt automatikusan készül egy mentés a jelenlegi adatbázisról.

### Manuális Visszaállítás

```bash
# 1. Állítsa le a szolgáltatást
sudo systemctl stop pixierp-test.service

# 2. Készítsen mentést a jelenlegi adatbázisról
cp /wb2/pixisys/test/pixierp/db.sqlite3 /wb2/pixisys/test/pixierp/db.sqlite3.backup

# 3. Másolja a backup fájlt az eredeti helyre
cp /wb2/pixisys/test/pixierp/backups/daily_backup_20260103_001609.sqlite3 /wb2/pixisys/test/pixierp/db.sqlite3

# 4. Indítsa el a szolgáltatást
sudo systemctl start pixierp-test.service
```

## Biztonsági Mentés

### Ajánlások

1. **Offsite Backup**: Rendszeresen másolja a backup fájlokat egy távoli helyre (pl. cloud storage)
2. **Teszt Visszaállítás**: Havonta tesztelje a backup visszaállítását
3. **Figyelés**: Ellenőrizze rendszeresen a backup log fájlokat
4. **Tárhely**: Tartson elegendő szabad tárhelyet a backup-okhoz

### Backup Méret Becslése

- **Kezdeti méret**: ~1-2 MB (üres adatbázis)
- **Növekedés**: Függ a használattól, átlagosan 10-50 MB havonta
- **14 napos napi backup**: ~150-700 MB
- **60 napos heti backup**: ~80-400 MB

## Hibaelhárítás

### A backup nem jön létre

1. Ellenőrizze a cron job futását: `grep CRON /var/log/syslog`
2. Ellenőrizze a backup log fájlokat: `/wb2/pixisys/logs/backup-*.log`
3. Ellenőrizze a tárhelyet: `df -h /wb2/pixisys/test/pixierp/backups/`
4. Ellenőrizze a jogosultságokat: `ls -la /wb2/pixisys/test/pixierp/backups/`

### A régi backup-ok nem törlődnek

1. Ellenőrizze a konfiguráció megőrzési idejét
2. Futtassa manuálisan a cleanup műveletet a webes felületen
3. Ellenőrizze, hogy a konfiguráció aktív-e

### Visszaállítás után bejelentkezési hiba

Ez normális, mivel a session adatok megváltoztak. Egyszerűen jelentkezzen be újra.

## API Végpontok

```
GET    /api/v1/backup-configs/          # Lista konfigurációk
POST   /api/v1/backup-configs/          # Új konfiguráció
PUT    /api/v1/backup-configs/{id}/     # Konfiguráció frissítése
DELETE /api/v1/backup-configs/{id}/     # Konfiguráció törlése

GET    /api/v1/backup-files/            # Lista backup fájlok
POST   /api/v1/backup-files/create_backup/  # Új manuális backup
GET    /api/v1/backup-files/{id}/download/  # Backup letöltése
POST   /api/v1/backup-files/{id}/restore/   # Visszaállítás
DELETE /api/v1/backup-files/{id}/        # Backup törlése
POST   /api/v1/backup-files/cleanup_old_backups/  # Régi backup-ok törlése
```
