# RFQ Workflow Dokumentáció

## Cél

Ez a dokumentum a teljes folyamatot írja le:

1. Új RFQ létrehozása
2. Tételkezelés
3. Korábbi tétel betöltés (history)
4. RFQ másolás (copy)
5. Megrendelés létrehozás (order_all / order_partial)
6. Szállítólevél létrehozás
7. Számlázás
8. Státuszpropagáció és naplózás
9. Kulcsváltozók és DB műveleti mátrix

A leírás a jelenlegi implementációt követi a backend (Django/DRF) és frontend (React/TypeScript) kódban.

---

## 1. Új RFQ létrehozása

### Frontend folyamat

A létrehozás fő állapotai és handlerei a RFQ lista oldalon vannak:

- RFQ form state-ek: createOpen, newItems, newCosts, validityDays, partialOrderAllowed
- mentési folyamat: createQuoteRequest -> updateQuoteRequestBasic -> opcionális item/cost/attachment mentés

### API hívások

#### RFQ alap létrehozás

```http
POST /sales/quote-requests/
Content-Type: application/json

{
  "title": "Prospektus gyártás",
  "description": "A4, 16 oldal, 4+4",
  "issue_date": "2026-06-20",
  "deadline": "2026-06-27",
  "validity_days": 30,
  "valid_until": "2026-07-20",
  "partial_order_allowed": true
}
```

Várható válasz (rövidítve):

```json
{
  "id": 812,
  "number": "2026062001",
  "request_number": "2026062001",
  "status": "new"
}
```

#### RFQ alapadat kiegészítés

```http
POST /sales/quote-requests/812/update_basic/
Content-Type: application/json

{
  "company_id": 45,
  "contact_ids": [201, 202],
  "project_id": 18,
  "currency_code": "HUF",
  "title": "Prospektus gyártás - nyári kampány"
}
```

### DB műveletek

- INSERT sales_quoterequest
- UPDATE sales_quoterequest (company, project, currency, stb.)
- UPDATE M2M kapcsolatok (contacts)
- INSERT sales_quotelog

---

## 2. Tételkezelés RFQ-ban

### Tipikus tétel hozzáadás (product)

```http
POST /sales/quote-requests/812/add_product_item/
Content-Type: application/json

{
  "product_id": 133,
  "item_name": "A4 prospektus",
  "quantity": 1000,
  "unit": "db",
  "net_unit_price": 95,
  "vat_rate": 27,
  "discount_percent": 5,
  "description": "Matt műnyomó 135g"
}
```

### DB műveletek

- INSERT sales_quoterequestitem
- opcionális INSERT attachment táblákba
- opcionális INSERT sales_quoterequestcost
- INSERT sales_quotelog

Megjegyzés: direct manufacturing flow esetén közvetlen cost item adatok is kerülhetnek mentésre a QuoteRequestItem-on.

---

## 3. Korábbi tételek betöltése (items_history)

### API

```http
GET /sales/quote-requests/items_history/?company_id=45
```

Alternatíva:

```http
GET /sales/quote-requests/items_history/?all_companies=1
```

### Mit ad vissza

- korábbi RFQ itemek
- kapcsolódó költségek (costs)
- számolt effective státusz (aktív CustomerOrderItem-ek alapján)

### DB műveletek

- csak SELECT jellegű műveletek (QuoteRequest, QuoteRequestItem, QuoteRequestCost, CustomerOrderItem)
- nincs közvetlen írás

---

## 4. RFQ másolás (copy)

### API

```http
POST /sales/quote-requests/812/copy/
Content-Type: application/json

{}
```

### Működés

A backend új RFQ-t hoz létre és másolja:

- RFQ alapadatokat (új szám, mai dátum, status=new)
- company + contacts kapcsolatokat
- RFQ csatolmányokat
- RFQ tételeket
- item-level attachmenteket
- direct cost attachmenteket
- RFQ költségsorokat
- naplóbejegyzést

### DB műveletek

- INSERT sales_quoterequest
- INSERT sales_quoterequestitem (több sor)
- INSERT sales_quoterequestcost (több sor)
- INSERT attachment rekordok
- INSERT sales_quotelog

---

## 5. Megrendelés létrehozás RFQ-ból

### 5.1 Teljes megrendelés (order_all)

```http
POST /sales/quote-requests/812/order_all/
Content-Type: application/json

{
  "deadline": "2026-07-05"
}
```

### 5.2 Részleges megrendelés (order_partial)

```http
POST /sales/quote-requests/812/order_partial/
Content-Type: application/json

{
  "item_ids": [3401, 3402],
  "deadline": "2026-07-05"
}
```

### Fő logika

- order_all idempotens: ha már van aktív (nem cancelled) rendelés, azt adja vissza
- order_number RFQ számból képződik, ütközés-védelemmel
- létrejön CustomerOrder + CustomerOrderItem rekordok
- RFQ státusz frissül (ordered vagy partially_ordered)
- napló írás történik

### DB műveletek

- SELECT meglévő order ellenőrzés
- INSERT sales_customerorder
- INSERT sales_customerorderitem
- UPDATE sales_quoterequest.status
- INSERT sales_quotelog

---

## 6. Szállítólevél létrehozás RFQ itemekből

### API

```http
POST /sales/delivery-notes/create_from_rfq_items/
Content-Type: application/json

{
  "rfq_item_ids": [3401, 3402],
  "delivery_type": "home",
  "delivery_date": "2026-07-06",
  "customer_id": 45,
  "notes": "Délelőtti kiszállítás"
}
```

### Fő logika

- RFQ itemekhez keres aktív CustomerOrderItem-et
- ha nincs, és RFQ szállítható státuszban van, automatikus order + order item létrejöhet
- maradék szállítható mennyiséget számol (DeliveryNoteItem aggregáció)
- létrehozza a DeliveryNote-ot és a DeliveryNoteItem sorokat

### DB műveletek

- SELECT RFQ item + order item kapcsolatok
- opcionális INSERT sales_customerorder
- opcionális INSERT sales_customerorderitem
- INSERT sales_deliverynote
- INSERT sales_deliverynoteitem
- opcionális INSERT sales_quotelog

---

## 7. Számlázás

A jelenlegi rendszerben két fő útvonal van.

### 7.1 Frontend alapú PixInvoice előtöltés

A frontend összeállít egy payloadot (customer, items, erp_order_ids), majd új lapon megnyitja:

```text
https://i.pixisys.eu/invoices/new?erp_data=<base64-encoded-json>
```

Ennél a flow-nál a helyi ERP oldalon általában nem azonnal jön létre Invoice rekord; a számlaszám visszaírás callback/szinkron után történik.

### 7.2 Backend create_invoices endpoint

```http
POST /sales/customer-orders/create_invoices/
Content-Type: application/json

{
  "order_ids": [901]
}
```

Fő logika:

- orderek csoportosítása company szerint
- PixInvoice customer + invoice API hívások
- siker esetén order.invoice_number frissítés

### DB műveletek

- UPDATE sales_customerorder.invoice_number
- külső rendszerben számla létrehozás

---

## 8. Státuszpropagáció és naplózás

### RFQ státusz váltás

```http
POST /sales/quote-requests/812/set_status/
Content-Type: application/json

{ "status": "quoted" }
```

A backend validálja a státuszt és naplózza a váltást.

### CustomerOrder státusz váltás

```http
POST /sales/customer-orders/901/update_status/
Content-Type: application/json

{ "status": "in_production" }
```

Fő mellékhatások:

- order timestamp mezők frissítése (pl. confirmed_at, ready_at)
- child CustomerOrderItem státuszok szinkronizálása
- gyártási cost item státuszok felfelé húzása
- delivered esetben kapcsolt szállítólevelek auto-confirmje

### Naplózás

A QuoteLog több ponton íródik:

- RFQ létrehozás/módosítás
- státuszváltás
- copy
- order létrehozás
- auto műveletek

---

## 9. Kulcsváltozók és DB write mátrix

## 9.1 Frontend kulcs state-ek (RFQs)

- createOpen, creating
- newItems, newCosts
- historyOpen, historyItems, historySelectedKeys, historyUseQty, historyAllCompanies
- bulkSelectedKeys
- deliveryType, selectedPickupLocationId, bulkDeliveryLoading
- bulkInvoiceLoading

## 9.2 Backend kulcsváltozók

- order: rfq_num, existing_count, order_number, deadline_val, set_status
- delivery: rfq_item_ids, DELIVERABLE_RFQ_STATUSES, items_data
- invoicing: order_ids, grouped_orders, invoice_items

## 9.3 Műveleti mátrix (rövid)

1. RFQ create:
- INSERT QuoteRequest
- INSERT QuoteLog

2. RFQ update_basic:
- UPDATE QuoteRequest
- UPDATE contacts M2M
- INSERT QuoteLog

3. items_history:
- SELECT only

4. copy:
- INSERT QuoteRequest
- INSERT Items/Costs/Attachments
- INSERT QuoteLog

5. order_all/order_partial:
- INSERT CustomerOrder
- INSERT CustomerOrderItem
- UPDATE QuoteRequest.status
- INSERT QuoteLog

6. create_from_rfq_items:
- INSERT DeliveryNote
- INSERT DeliveryNoteItem
- opcionális auto order/item INSERT

7. create_invoices:
- UPDATE CustomerOrder.invoice_number
- külső számla API hívás

---

## Melléklet: Rövid end-to-end példa

1. POST /sales/quote-requests/ -> RFQ létrejön (status=new)
2. POST /sales/quote-requests/{id}/update_basic/ -> cég/kapcsolattartó beállítva
3. GET /sales/quote-requests/items_history/ -> korábbi tételek betöltve
4. POST /sales/quote-requests/{id}/add_*_item/ -> új tétel(ek)
5. POST /sales/quote-requests/{id}/set_status/ -> quoted, majd accepted
6. POST /sales/quote-requests/{id}/order_all/ -> CustomerOrder létrejön
7. POST /sales/delivery-notes/create_from_rfq_items/ -> szállítólevél létrejön
8. Számlázás -> PixInvoice UI flow vagy create_invoices endpoint
9. Order invoice_number frissül
