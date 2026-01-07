# PixiSys Deployment & Frissítési Útmutató

## 🎯 Áttekintés

Ez az útmutató részletezi, hogyan lehet biztonságosan frissíteni az **éles (production)** PixiSys rendszert, miközben a **fejlesztői (development)** környezetben folyik a munka.

**Fontos alapelvek:**
- ✅ Az adatok az éles rendszerben **soha nem vesznek el** frissítés közben
- ✅ Automatikus backup készül minden frissítés előtt
- ✅ Django migrációk **csak a sémát** módosítják, az adatokat nem érintik
- ✅ Git verziókezelés biztosítja a biztonságos frissítést
- ✅ Rollback lehetőség ha valami nem stimmel

---

## 📋 Előfeltételek

### Környezetek szétválasztása

**Fejlesztői környezet** (pl. `/home/pixi/pixisys_dev/`):
- Itt fejlesztesz
- Teszt adatokkal dolgozol
- Gyakori változtatások, commitok

**Production környezet** (pl. `/var/www/pixisys/`):
- Éles adatok
- Systemd service-ekkel fut
- Nginx reverse proxy
- Csak tesztelt, stabil verziókat telepítesz

### Git workflow

```
Development környezet
    ↓ (git push)
GitHub repository (origin/main)
    ↓ (git pull)
Production környezet
```

---

## 🚀 Gyors Frissítés (Automatikus)

### 1. Egyszerű frissítés

Production szerveren:

```bash
cd /var/www/pixisys
./update.sh
```

Ez automatikusan:
- ✅ Backup-ol minden adatbázist
- ✅ Lehúzza az új verziót GitHub-ról
- ✅ Frissíti a függőségeket (ha változtak)
- ✅ Futtatja a migrációkat (csak séma, adat marad!)
- ✅ Build-eli a frontend-et (production mode)

### 2. Teljes automatizálás (root-ként)

```bash
cd /var/www/pixisys
sudo ./update.sh --auto-restart
```

Ez még újra is indítja a service-eket automatikusan.

### 3. Opciók

```bash
./update.sh --help

Opciók:
  --skip-backup      Backup kihagyása (NEM AJÁNLOTT!)
  --skip-frontend    Frontend build kihagyása
  --auto-restart     Automatikus service restart (root szükséges)
```

**Példák:**

```bash
# Csak backend frissítés, frontend unchanged
./update.sh --skip-frontend

# Teljes frissítés + auto restart
sudo ./update.sh --auto-restart

# Gyors frissítés backup nélkül (veszélyes!)
./update.sh --skip-backup
```

---

## 🔧 Manuális Frissítés (Részletes)

Ha te magad akarod kontrollálni minden lépést:

### 1. Előkészületek

```bash
# Csatlakozz a production szerverhez
ssh user@your-production-server.com

# Navigálj a PixiSys mappába
cd /var/www/pixisys
```

### 2. Backup (KÖTELEZŐ!)

#### Adatbázis backup

```bash
# PixiERP adatbázis
pg_dump -U pixierp_user pixierp_db > backups/erp_backup_$(date +%Y%m%d_%H%M%S).sql

# PixInvoice adatbázis
pg_dump -U pixinvoice_user pixinvoice_db > backups/invoice_backup_$(date +%Y%m%d_%H%M%S).sql
```

#### Fájlok backup (opcionális)

```bash
# Feltöltött fájlok, media
tar -czf backups/media_backup_$(date +%Y%m%d).tar.gz pixierp/media pixinvoice/invoice_app/media

# Komplett kód backup
tar -czf backups/code_backup_$(date +%Y%m%d).tar.gz --exclude=venv --exclude=node_modules .
```

### 3. Verzió ellenőrzése

```bash
# Jelenlegi verzió
git describe --tags
git log --oneline -5

# Új verzió előnézete
git fetch origin
git log HEAD..origin/main --oneline
```

### 4. Új verzió lehúzása

```bash
# Ellenőrizd hogy nincs uncommitted változás
git status

# Húzd le az új verziót
git pull origin main
```

### 5. Backend frissítés

#### PixiERP

```bash
cd pixierp

# Aktiváld a virtual environment-et
source venv/bin/activate

# Frissítsd a függőségeket (ha kell)
pip install -r requirements.txt

# FONTOS: Migrációk futtatása
# Ez csak a tábla struktúrát módosítja, az adatokat NEM érinti!
python manage.py migrate

# Static fájlok gyűjtése (production)
python manage.py collectstatic --no-input

deactivate
cd ..
```

#### PixInvoice

```bash
cd pixinvoice/invoice_app

# Aktiváld a virtual environment-et
source venv/bin/activate

# Frissítsd a függőségeket (ha kell)
pip install -r requirements.txt

# Migrációk futtatása
python manage.py migrate

# Static fájlok gyűjtése (production)
python manage.py collectstatic --no-input

deactivate
cd ../..
```

### 6. Frontend frissítés

#### PixiERP Frontend

```bash
cd pixierp/frontend

# Frissítsd a Node csomagokat (ha kell)
npm install

# Production build
npm run build

cd ../..
```

#### PixInvoice Frontend

```bash
cd pixinvoice/frontend

# Frissítsd a Node csomagokat (ha kell)
npm install

# Production build
npm run build

cd ../..
```

### 7. Service újraindítás

```bash
# PixiERP backend
sudo systemctl restart pixierp-backend

# PixInvoice backend
sudo systemctl restart pixinvoice-backend

# Nginx reload (konfig változás esetén)
sudo systemctl reload nginx
```

### 8. Ellenőrzés

```bash
# Service státusz
sudo systemctl status pixierp-backend
sudo systemctl status pixinvoice-backend
sudo systemctl status nginx

# Logok figyelése
journalctl -u pixierp-backend -f
journalctl -u pixinvoice-backend -f

# Web elérhetőség teszt
curl http://localhost:8003/api/
curl http://localhost:4001/api/
```

---

## 📦 Django Migrációk - Hogyan működnek?

### Alapfogalom

Django migrációk **NEM törlik az adatokat**! Csak a tábla struktúrát módosítják.

### Példa

**Fejlesztés során** (development):

```python
# Új mező hozzáadása a modellhez
class Invoice(models.Model):
    number = models.CharField(max_length=50)
    # ÚJ mező:
    notes = models.TextField(blank=True, null=True)
```

```bash
# Migráció generálása
python manage.py makemigrations

# Létrejön: invoices/migrations/0051_invoice_notes.py
```

**Production-ben** (éles):

```bash
# Migráció futtatása
python manage.py migrate

# Mit csinál?
# 1. Ellenőrzi melyik migrációk futottak már
# 2. Lefuttatja az újakat (pl. 0051_invoice_notes.py)
# 3. Hozzáadja a 'notes' oszlopot az 'invoices' táblához
# 4. A MEGLÉVŐ ADATOK ÉRINTETLENEK MARADNAK!
```

### Veszélyes migrációk

Néhány művelet lehet problémás production-ben:

❌ **Mező törlése** (adatvesztés!):
```python
# Előtte minden adatot át kell menteni vagy másik mezőbe másolni!
remove_field('Invoice', 'old_field')
```

✅ **Biztonságos alternatíva**:
1. Új mező hozzáadása
2. Adatok átmásolása (data migration)
3. Régi mező törlése (külön verzióban)

❌ **NOT NULL mező hozzáadása default nélkül**:
```python
# Hiba lesz ha már van adat!
new_field = models.CharField(max_length=50)
```

✅ **Helyes módszer**:
```python
# Default értékkel vagy null=True
new_field = models.CharField(max_length=50, default='', null=True)
```

### Migráció előnézete

```bash
# Megnézheted mit fog csinálni
python manage.py sqlmigrate invoices 0051

# Kimenet: SQL parancsok
ALTER TABLE invoices_invoice ADD COLUMN notes text NULL;
```

---

## 🔄 Rollback (Visszaállítás)

Ha valami elromlik a frissítés után:

### 1. Gyors rollback (Git)

```bash
# Előző verzióra visszaállás
git log --oneline -5
git reset --hard <előző-commit-hash>

# Service restart
sudo systemctl restart pixierp-backend
sudo systemctl restart pixinvoice-backend
```

### 2. Adatbázis visszaállítás

```bash
# Ha a migrációk okoztak problémát
# PixiERP
psql -U pixierp_user pixierp_db < backups/erp_backup_20260107_120000.sql

# PixInvoice
psql -U pixinvoice_user pixinvoice_db < backups/invoice_backup_20260107_120000.sql
```

### 3. Migráció visszavonás

```bash
# Egy konkrét migrációra visszaállás
cd pixierp
source venv/bin/activate

# Migráció lista
python manage.py showmigrations

# Visszaállás 0050-re (0051 nem fut le)
python manage.py migrate invoices 0050

deactivate
```

---

## 🔒 Biztonság és Best Practices

### ✅ MINDIG csináld

1. **Backup minden frissítés előtt**
   ```bash
   ./update.sh  # Automatikusan backup-ol
   ```

2. **Tesztelj fejlesztői környezetben először**
   ```bash
   # Development-ben
   git pull
   python manage.py migrate
   # Tesztelés...
   
   # Ha OK, akkor push GitHub-ra
   git push
   
   # Production-ben lehúzás
   ./update.sh
   ```

3. **Logok figyelése frissítés után**
   ```bash
   journalctl -u pixierp-backend -f
   ```

4. **Service health check**
   ```bash
   systemctl status pixierp-backend
   systemctl status pixinvoice-backend
   ```

### ❌ SOHA ne csináld

1. **Ne frissíts közvetlenül production-ben fejlesztés**
   - Előbb commitolj development-ben
   - Push GitHub-ra
   - Pull production-ben

2. **Ne futtass `makemigrations`-t production-ben**
   - Migrációkat mindig fejlesztői gépen generálj
   - Commitold őket
   - Production-ben csak `migrate` parancs

3. **Ne törlj mezőket migráció nélkül**
   - Mindig Django migrációkkal dolgozz

4. **Ne módosítsd a .env fájlt frissítés közben**
   - Külön kezeld a konfigurációt
   - Ne commitold a .env-et (benne van .gitignore-ban)

---

## 🎓 Tipikus Workflow Példa

### Development → Production teljes ciklus

#### 1. Fejlesztés (lokális gép)

```bash
# Új feature fejlesztése
cd /home/pixi/pixisys_dev/pixisys/pixinvoice/invoice_app

# Model módosítás
vim invoices/models.py  # Új mező hozzáadása

# Migráció generálása
source venv/bin/activate
python manage.py makemigrations
python manage.py migrate

# Tesztelés
python manage.py runserver

# Frontend frissítés
cd ../frontend
vim src/pages/Invoices.js  # UI módosítás
npm start

# Ha minden OK, commit
cd /home/pixi/pixisys_dev/pixisys
git add .
git commit -m "v0.43 - Új mező hozzáadása számlákhoz"
git tag v0.43
git push origin main
git push origin v0.43
```

#### 2. Production frissítés

```bash
# Csatlakozás production szerverhez
ssh admin@production-server.com

# Frissítés
cd /var/www/pixisys
./update.sh --auto-restart

# Ellenőrzés
curl http://localhost:4001/api/invoices/
journalctl -u pixinvoice-backend -n 50
```

#### 3. Ha hiba történt (rollback)

```bash
# Git rollback
git log --oneline -3
git reset --hard v0.42  # Előző verzió

# Service restart
sudo systemctl restart pixierp-backend pixinvoice-backend
```

---

## 📊 Monitoring és Ellenőrzés

### Logok figyelése

```bash
# Real-time log stream
journalctl -u pixierp-backend -f
journalctl -u pixinvoice-backend -f

# Utolsó 100 sor
journalctl -u pixierp-backend -n 100

# Mai logok
journalctl -u pixierp-backend --since today

# Hibák szűrése
journalctl -u pixierp-backend -p err
```

### Adatbázis ellenőrzés

```bash
# Csatlakozás adatbázishoz
psql -U pixierp_user pixierp_db

# Táblák listája
\dt

# Migráció státusz
SELECT * FROM django_migrations ORDER BY applied DESC LIMIT 10;

# Kilépés
\q
```

### Service állapot

```bash
# Státusz
systemctl status pixierp-backend
systemctl status pixinvoice-backend
systemctl status nginx
systemctl status postgresql
systemctl status redis

# Memória/CPU használat
top -p $(pgrep -f "pixierp")
```

---

## 🛠️ Automatizálás (Opcionális)

### Cron job automatikus frissítéshez

**NEM AJÁNLOTT production-re**, de development szerverre OK:

```bash
# Crontab szerkesztése
crontab -e

# Minden éjjel 2-kor frissítés
0 2 * * * cd /var/www/pixisys && ./update.sh --skip-frontend > /var/log/pixisys-update.log 2>&1
```

### Webhook alapú deployment (GitHub Actions)

**.github/workflows/deploy.yml** (repository-ban):

```yaml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.PRODUCTION_HOST }}
          username: ${{ secrets.PRODUCTION_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/pixisys
            ./update.sh --auto-restart
```

---

## 📞 Hibaelhárítás

### Gyakori problémák

#### 1. "Migration conflict" hiba

**Hiba:**
```
CommandError: Conflicting migrations detected
```

**Megoldás:**
```bash
# Nézd meg mi a konfliktus
python manage.py showmigrations

# Merge migrations
python manage.py makemigrations --merge
python manage.py migrate
```

#### 2. Service nem indul újra

**Hiba:**
```
systemctl restart pixierp-backend
Job for pixierp-backend.service failed
```

**Megoldás:**
```bash
# Részletes hiba
journalctl -u pixierp-backend -n 50

# Gyakori okok:
# - Port már használatban
# - Python hiba (syntax error)
# - Függőség hiányzik
# - .env fájl hibás
```

#### 3. "No module named X" hiba

**Hiba:**
```
ModuleNotFoundError: No module named 'some_package'
```

**Megoldás:**
```bash
cd pixierp  # vagy pixinvoice/invoice_app
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

#### 4. Frontend nem frissül

**Probléma:** Régi verzió látszik böngészőben

**Megoldás:**
```bash
# Hard refresh (Ctrl+Shift+R)
# Vagy clear cache

# Nginx cache clear
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx
```

#### 5. Adatbázis kapcsolat hiba

**Hiba:**
```
django.db.utils.OperationalError: FATAL: password authentication failed
```

**Megoldás:**
```bash
# Ellenőrizd .env fájlt
cat pixierp/.env | grep DB_

# PostgreSQL user jelszó reset
sudo -u postgres psql
ALTER USER pixierp_user WITH PASSWORD 'új_jelszó';
\q

# Frissítsd .env-ben is
vim pixierp/.env
```

---

## 📚 További Információk

- [INSTALL.md](INSTALL.md) - Teljes telepítési útmutató
- [QUICKSTART.md](QUICKSTART.md) - Gyors kezdés
- [README.md](README.md) - Projekt áttekintés
- [Django Migrations Docs](https://docs.djangoproject.com/en/4.2/topics/migrations/)

---

## ✅ Checklist - Frissítés előtt

```
□ Backup készült? (automatikus: update.sh)
□ Fejlesztői környezetben tesztelve?
□ Commitok push-olva GitHub-ra?
□ Production .env fájl OK?
□ Felhasználók értesítve a leállásról? (ha szükséges)
□ Logok figyelése készen áll?
```

## ✅ Checklist - Frissítés után

```
□ Service-ek futnak? (systemctl status)
□ Web elérhetőség OK? (curl teszt)
□ Logokban nincs hiba? (journalctl)
□ Frontend betölt? (böngésző teszt)
□ Adatbázis OK? (psql kapcsolat)
□ Új funkciók működnek?
```

---

**Készítve ❤️-vel - Biztonságos deployment PixiSys-hez**

**Utolsó frissítés:** 2026. január 7.
