# Eszköz Csatlakozás Működése

## Architektúra

```
┌─────────────────┐         ┌──────────────────┐         ┌───────────────────┐
│  Beléptető      │  WS/XML │   DeviceBroker   │  HTTP   │  Django Backend   │
│  Eszköz         │────────>│   (Port 8001)    │────────>│   (Port 8003)     │
│  192.168.5.111  │         │  192.168.5.25    │  POST   │   localhost       │
└─────────────────┘         └──────────────────┘         └───────────────────┘
```

## Eszköz → DeviceBroker Kommunikáció

### 1. Az eszköz csatlakozása
**Cím:** `ws://192.168.5.25:8001`  
**Protokoll:** WebSocket  
**Formátum:** XML

**Log példa:**
```
INFO:packages.devicebroker.load_balancing:Assigned ID 0 to websocket connection ('192.168.5.111', 33910)
```

### 2. Login üzenet (XML)
Az eszköz elküldi a login üzenetet XML formátumban:
```xml
<?xml version="1.0"?>
<Message>
  <Request>Login</Request>
  <DeviceSerialNumber>C202504083</DeviceSerialNumber>
  <Token>...</Token>
</Message>
```

## DeviceBroker → Django Kommunikáció

### 1. Device Login Check
**Cím:** `http://localhost:8003/device/check_login`  
**Metódus:** POST  
**Body:** JSON formátumú device info

**Django view:**
```python
@csrf_exempt
def check_device_login(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        logger.info(f"[DEVICE_LOGIN] Device login request: {data}")
        return JsonResponse({'result': 'Success'})
```

**DeviceBroker log:**
```
DEBUG:urllib3.connectionpool:http://localhost:8003 "POST /device/check_login HTTP/1.1" 200 2
```

### 2. Log Upload
**Cím:** `http://localhost:8003/device/upload_log?type=AdminLog_v2`  
**Metódus:** POST  
**Body:** Log adatok

**Django view:**
```python
@csrf_exempt
def check_device_registration(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        device_info = data.get('device_info', {})
        device_id = device_info.get('DeviceId', 'UNKNOWN')
        return JsonResponse({
            'result': 'Success',
            'settings': {
                'WorkCode': True,
                'FaceDetection': True
            }
        })
```

**DeviceBroker log:**
```
DEBUG:urllib3.connectionpool:http://localhost:8003 "POST /device/upload_log?type=AdminLog_v2 HTTP/1.1" 200 2
```

## Fontos Felismerések

### 1. Az eszköz NEM közvetlenül a Django-hoz csatlakozik!
- ❌ **Rossz:** `ws://te.pixisys.eu/ws/device/` (Django Channels)
- ✅ **Helyes:** `ws://192.168.5.25:8001` (DeviceBroker)

### 2. Kétféle WebSocket endpoint van

#### A) Django Channels WebSocket (`ws://te.pixisys.eu/ws/device/`)
- **Cél:** Monitoring, admin felület, teszt célú szimuláció
- **Formátum:** JSON
- **Használat:** Frontend eszköz felfedezés, státusz monitoring

#### B) DeviceBroker WebSocket (`ws://192.168.5.25:8001`)
- **Cél:** Valódi eszközök csatlakozása
- **Formátum:** XML
- **Használat:** Fizikai beléptető eszközök

### 3. A DeviceBroker már működik!
A log szerint az eszköz (`C202504083` @ `192.168.5.111`) sikeresen csatlakozott és
folyamatosan küld AdminLog_v2 típusú logokat.

## Eszköz Konfiguráció

Az eszköz beállításainál:
- **WebSocket szerver cím:** `192.168.5.25` (vagy `te.pixisys.eu` ha forward van beállítva)
- **Port:** `8001`
- **Protokoll:** `ws://` (nem wss://)

## Django Backend Endpoints

Az alábbi endpoints-ok kezelik a DeviceBroker hívásokat:

1. **`/device/check_login`** - Eszköz bejelentkezés ellenőrzése
2. **`/device/check_registration`** - Eszköz regisztráció ellenőrzése  
3. **`/device/upload_log`** - Log feltöltés (pl. AdminLog_v2, AttendanceLog)

Ezek már implementálva vannak a `/wb2/pixisys/test/pixierp/apps/hr/views.py` fájlban.

## Tesztelés

### DeviceBroker státusz ellenőrzése
```bash
sudo lsof -i :8001
# Vagy
ps aux | grep devicebroker
```

### DeviceBroker log figyelése
```bash
tail -f /wb2/pixisys/accesscontrol/WebSocketSDK_Python/WebSocketSDK_Python/devicebroker.log
```

### Django backend log
```bash
sudo journalctl -u pixierp-test -f | grep DEVICE
```

## Gyakori Problémák

### Probléma: Eszköz nem csatlakozik
**Ok:** Rossz WebSocket cím (Django Channels-t próbál használni XML helyett JSON-nal)  
**Megoldás:** Eszköz konfigban: `ws://192.168.5.25:8001`

### Probléma: DeviceBroker nem fut
**Ellenőrzés:**
```bash
sudo lsof -i :8001
```
**Indítás:**
```bash
cd /wb2/pixisys/accesscontrol/WebSocketSDK_Python/WebSocketSDK_Python
python3 -m packages.devicebroker.client
```

### Probléma: Django endpoints nem válaszolnak
**Ellenőrzés:**
```bash
curl -X POST http://localhost:8003/device/check_login -d '{}'
```
**Válasz:** `{"result": "Success"}`

## Összefoglalás

✅ **Működik:**
- DeviceBroker fut a 8001-es porton
- Eszköz (`C202504083`) csatlakozott (`192.168.5.111`)
- Django endpoints (`/device/check_login`, `/device/upload_log`) működnek

⚠️ **Figyelendő:**
- A Django Channels WebSocket (`ws://te.pixisys.eu/ws/device/`) **NEM** az eszközök számára van!
- Ez csak monitoring/admin célú, JSON formátumú kommunikációhoz
- A valódi eszközök a DeviceBroker-hez csatlakoznak XML-lel
