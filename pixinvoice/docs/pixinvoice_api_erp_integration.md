# PixInvoice API integráció ERP rendszerekhez

## 1. Áttekintés

 A PixInvoice REST API lehetővé teszi, hogy ERP rendszerek külsőleg elérjék a NAV Online Számla szolgáltatásait, ügyfél- és kapcsolattartó szinkronizálást, valamint számlák beküldését.

 Fontos változások:
 - API‑kulcsos hitelesítés (X-Api-Key) kötelező.
 - A cég azonosító (`company_id`) megadása nem kötelező; az API‑kulcs alapján automatikusan azonosítjuk a céget. Ha mégis megadod, egyeznie kell a kulcshoz rendelt céggel.
 - Több külön API‑kulcs kezelése egy céghez (külön integrációkhoz) támogatott; kulcsonként szabályozható hozzáférés.
 - Cég- és számlatömb szintű jogosultságok a “Beállítások > API hozzáférés” oldalon kezelhetők.

## 2. Elérhető API végpontok

Alap URL (fejlesztéskor): `http://localhost:4001/api/`

Minden hívásnál add meg:
- Fejléc: `X-Api-Key: <API-KEY>`
- Opcionális: `company_id=<cég UUID>` (query vagy body). Ha megadod, egyezzen az API‑kulcshoz tartozó céggel — eltérés esetén 400/403 hibát adunk.

### 2.1 NAV céglekérdezés

- **Endpoint:**  
  `POST /api/customers/lookup_taxpayer/`
- **Leírás:**  
  Adott adószámhoz lekéri a NAV-tól a cég adatait.
- **Auth & paramok:**  
  Fejléc: `X-Api-Key` • Opcionális: `company_id` (body vagy query; egyezés kötelező)
- **Request példa:**
  ```json
  {
    "tax_number": "12345678"
  }
  ```
- **Response példa:**
  ```json
  {
    "success": true,
    "data": "<NAV XML válasz vagy feldolgozott adatok>",
    "message": "Adószám lekérdezés sikeres"
  }
  ```
- **Hibák:**
  - Jogosultság hiánya: 403/400
  - NAV API hiba: 500

### 2.2 Ügyfél szinkronizálás

- **Endpoint:**  
  `POST /api/customers/`  
- **Leírás:**  
  Új ügyfél létrehozása vagy meglévő frissítése.
- **Auth & paramok:**  
  Fejléc: `X-Api-Key` • Opcionális: `company_id` (body vagy query; egyezés kötelező)
- **Request példa:**
  ```json
  {
    "name": "Teszt Kft.",
    "tax_number": "12345678",
    "email": "teszt@ceg.hu",
    "address": "1111 Budapest, Teszt utca 1."
  }
  ```
- **Response:**  
  Létrehozott/frissített ügyfél adatai.

### 2.3 Kapcsolattartó szinkronizálás

- **Endpoint:**  
  `POST /api/contacts/`  
- **Leírás:**  
  Új kapcsolattartó létrehozása vagy meglévő frissítése.
- **Auth & paramok:**  
  Fejléc: `X-Api-Key` • Opcionális: `company_id` (body vagy query; egyezés kötelező)
- **Request példa:**
  ```json
  {
    "customer": "<ügyfél UUID>",
    "first_name": "János",
    "last_name": "Teszt",
    "email": "janos.teszt@ceg.hu",
    "phone": "+36201234567"
  }
  ```
- **Response:**  
  Létrehozott/frissített kapcsolattartó adatai.

### 2.4 Számla küldés NAV-hoz

- **Endpoint:**  
  `POST /api/invoices/<invoice_id>/submit_to_nav/`
- **Leírás:**  
  Egy adott számlát beküld a NAV Online Számla rendszerébe.
- **Request:**  
  Nincs szükség extra body-ra, csak az invoice_id-t kell megadni az URL-ben.
- **Auth & paramok:**  
  Fejléc: `X-Api-Key` • Opcionális: `company_id` (query vagy body; egyezés kötelező)
- **Response példa:**
  ```json
  {
    "success": true,
    "transaction_id": "NAV-TRANSACTION-ID",
    "message": "Számla beküldve"
  }
  ```
### 2.5 E-mail beállítások tesztelése

- **SMTP teszt:**  
  `POST /api/company-email-settings/test_smtp/`
  - Auth: `X-Api-Key` • `company_id` opcionális (kulcs alapján azonosítjuk a céget)
  - Body (opcionális, ha már el van mentve a céghez):
  ```json
  {
    "smtp_host": "smtp.example.com",
    "smtp_port": 587,
    "smtp_user": "user@example.com",
    "smtp_password": "secret",
    "smtp_use_tls": true,
    "smtp_from": "no-reply@example.com",
    "to": "me@example.com"
  }
  ```
  - Viselkedés: Kapcsolódás és bejelentkezés teszt. Ha `to` meg van adva, küld egy teszt e-mailt is.
  - Válasz példa:
  ```json
  { "success": true, "message": "SMTP kapcsolat rendben", "details": {"host":"smtp.example.com","port":587,"tls":true} }
  ```

- **IMAP teszt:**  
  `POST /api/company-email-settings/test_imap/`
  - Auth: `X-Api-Key` • `company_id` opcionális
  - Body (opcionális, ha már el van mentve a céghez):
  ```json
  {
    "imap_host": "imap.example.com",
    "imap_user": "user@example.com",
    "imap_password": "secret",
    "imap_port": 993,
    "imap_sent_folder": "Sent",
    "write_test_message": true
  }
  ```
  - Viselkedés: SSL/STARTTLS kapcsolódás, bejelentkezés, `INBOX` kiválasztása (üzenetszám visszaadása), valamint opcionálisan egy teszt üzenet APPEND-elése a `imap_sent_folder` mappába. Ha a mappa nem létezik, a rendszer megkísérli létrehozni.
  - Válasz példa:
  ```json
  {
    "success": true,
    "message": "IMAP kapcsolat rendben",
    "details": {
      "host": "imap.example.com",
      "inbox_messages": 42,
      "sent_folder": "Sent",
      "appended_test": true,
      "append_resp": "OK"
    }
  }
  ```

- **Hibák:**
  - Jogosultság hiánya: 403/400
  - NAV API hiba: 500

## 3. Jogosultságok

Az API végpontok csak akkor használhatók, ha a PixInvoice adminban a “Beállítások > API hozzáférés” menüpontban engedélyezve vannak az adott cégre vagy számlatömbre.

- NAV céglekérdezés: `nav.companyQuery`
- Ügyfél szinkron: `customer.sync`
- Kapcsolattartó szinkron: `contact.sync`
- Számla küldés: `invoice.send`

## 4. Hitelesítés

Az API kulcs alapú. Minden kérésnél add meg a kulcsot. A cég azonosítója automatikusan feloldásra kerül az API‑kulcs alapján.

- Fejléc: `X-Api-Key: <API-KEY>`
- Opcionális: `company_id: <cég UUID>` (query paraméterként vagy a JSON body-ban). Ha megadod, egyeznie kell a kulcshoz rendelt céggel; eltérés esetén 400/403 hibát kapsz.

API‑kulcs típusok:
- Cégszintű kulcs: a cég beállításainál generált kulcs, a cég összes engedélyezett API-jára érvényes.
- Egyedi „API kapcsolat” kulcs: több kulcs is létrehozható cégenként (pl. webshop, ERP, BI). Minden kulcs külön aktiválható/tiltható és külön szabályokkal (scope-okkal) látható el.

Kulcsok és jogok kezelése: PixInvoice admin → Beállítások → API hozzáférés.

Tipp: a `company_id` értéke a cégek listájából kérdezhető le: `GET /api/companies/`.
Megjegyzés: a legtöbb integrációnál nem szükséges a `company_id` megadása, mert a rendszer az API‑kulcsból egyértelműen be tudja azonosítani a céget.

## 5. Példa Python kód ERP integrációhoz

```python
import requests

BASE_URL = "http://localhost:4001/api"  # vagy a telepített szerver URL-je (/api végződéssel)
API_KEY = "<API-KEY>"  # Beállítások > API hozzáférés

HEADERS = {"X-Api-Key": API_KEY}

def nav_company_query(tax_number):
    resp = requests.post(
        f"{BASE_URL}/customers/lookup_taxpayer/",
        json={"tax_number": tax_number},
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()

def sync_customer(data):
    resp = requests.post(f"{BASE_URL}/customers/", json=data, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()

def sync_contact(data):
    resp = requests.post(f"{BASE_URL}/contacts/", json=data, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()

def submit_invoice_to_nav(invoice_id):
    resp = requests.post(
        f"{BASE_URL}/invoices/{invoice_id}/submit_to_nav/",
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()

# Példa hívás
if __name__ == '__main__':
    # NAV céglekérdezés
    print(nav_company_query("12345678"))

    # Ügyfél szinkron
    customer = sync_customer({
        "name": "Teszt Kft.",
        "tax_number": "12345678",
        "email": "teszt@ceg.hu",
        "address": "1111 Budapest, Teszt utca 1."
    })
    print(customer)

    # Kapcsolattartó szinkron
    contact = sync_contact({
        "customer": customer["id"],
        "first_name": "János",
        "last_name": "Teszt",
        "email": "janos.teszt@ceg.hu",
        "phone": "+36201234567"
    })
    print(contact)

    # Számla NAV beküldés
  invoice_id = "<számla UUID>"
  print(submit_invoice_to_nav(invoice_id))
```

## 6. Gyors cURL példák

Számlák listája (GET):

```bash
curl -H "X-Api-Key: <API-KEY>" \
  "http://localhost:4001/api/invoices/"
```

NAV céglekérdezés (POST):

```bash
curl -H "Content-Type: application/json" \
     -H "X-Api-Key: <API-KEY>" \
     -X POST \
  -d '{"tax_number":"12345678"}' \
     http://localhost:4001/api/customers/lookup_taxpayer/
```

## 7. Hibaelhárítás

- **403 / 400 jogosultság hiba:**  
  - Érvénytelen vagy hiányzó `X-Api-Key`
  - (Opcionálisan megadott) `company_id` nem egyezik az API‑kulcshoz rendelt céggel
  - Az adott scope nincs engedélyezve cég vagy kulcs szinten
- **NAV API hiba:**  
  A válaszban részletes hibaüzenet található, NAV XML válasz is visszakapod.
- **Kapcsolat hiba:**  
  Ellenőrizd, hogy a PixInvoice backend fut-e, és az ERP rendszer eléri-e a megadott URL-t.

## 8. További információ

- Swagger/OpenAPI leírás: [Kérésre generálható]
- Támogatott formátumok: JSON
- Verzió: 2025.09.14 (API‑kulcsos hitelesítéssel frissítve)

---

## ERP rendszer beállítások

- **Backend URL:** Állítsd be a PixInvoice backend elérési útját (pl. `http://localhost:4001/api/`).
- **API‑kulcs:** Kötelező. A PixInvoice adminban generálható (céges kulcs vagy több egyedi „API kapcsolat” kulcs).
- **Cég azonosító:** Opcionális. A rendszer az API‑kulcs alapján automatikusan azonosítja a céget. Ha megadod, egyeznie kell a kulcshoz rendelt céggel. A cégek listája: `GET /api/companies/`.
- **Jogosultság:** A “Beállítások > API hozzáférés” menüben kezeld a scope‑okat cég és (opcionálisan) számlatömb szinten, illetve kulcsonként.
