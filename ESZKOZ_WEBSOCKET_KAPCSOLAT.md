# Beléptető Eszköz WebSocket Kapcsolat

## Csatlakozási információk

### WebSocket URL (nem SSL)
```
ws://te.pixisys.eu/ws/device/
```

**FONTOS:** 
- Az eszköz **saját** címe: `192.168.5.111:5005`
- Az ERP rendszer WebSocket címe: **`ws://te.pixisys.eu/ws/device/`** (nem SSL!)
- A DeviceBroker címe (csak teszteléshez): `ws://192.168.5.25:8001`

⚠️ **Figyelem:** A WebSocket cím **ws://** (nem wss://), azaz egyszerű HTTP-n keresztül megy, **nem SSL-lel**!

## Kapcsolódási folyamat

### 1. WebSocket kapcsolat létrehozása
Az eszköz csatlakozik a `ws://te.pixisys.eu/ws/device/` címhez (**nem SSL!**).

### 2. Welcome üzenet fogadása
A szerver egy welcome üzenetet küld:
```json
{
  "type": "connection_accepted",
  "message": "ERP rendszer WebSocket kapcsolat létrejött"
}
```

### 3. Eszköz regisztrációja
Az eszköz elküldi a regisztrációs üzenetet:
```json
{
  "type": "register",
  "device_id": "C202504083",
  "device_info": {
    "terminal_type": "EN-D815FTW",
    "product_name": "Access Control Terminal",
    "ip": "192.168.5.111",
    "port": 5005
  }
}
```

**Eszköz ID-k az adatbázisban:**
- Eszköz 1: `C202504081` (IP: 192.168.5.112:5005)
- Eszköz 2: `C202504083` (IP: 192.168.5.111:5005)

### 4. Regisztrációs válasz
Sikeres regisztráció esetén:
```json
{
  "type": "registration_success",
  "message": "Eszköz C202504083 sikeresen regisztrálva",
  "device_id": "C202504083"
}
```

Hiba esetén:
```json
{
  "type": "registration_error",
  "message": "Eszköz C202504083 nem található az adatbázisban"
}
```

### 5. Heartbeat (Ping/Pong)
Az eszköz rendszeres időközönként küldhet ping üzenetet:
```json
{
  "type": "ping",
  "timestamp": "2026-01-02 00:55:00"
}
```

A szerver válasza:
```json
{
  "type": "pong",
  "timestamp": "2026-01-02 00:55:00"
}
```

### 6. Belépési esemény küldése
Amikor valaki belép/kilép:
```json
{
  "type": "event",
  "event_type": "entry",
  "user_id": "12345",
  "timestamp": "2026-01-02 08:30:00",
  "device_id": "C202504083"
}
```

A szerver válasza:
```json
{
  "type": "event_acknowledged",
  "event_type": "entry",
  "user_id": "12345",
  "access_granted": true,
  "message": "Belépés engedélyezve"
}
```

## Üzenet típusok

### Eszköz → Szerver
- `register`: Eszköz regisztráció
- `ping`: Heartbeat
- `event`: Belépési/kilépési esemény

### Szerver → Eszköz
- `connection_accepted`: Kapcsolat elfogadva
- `registration_success`: Sikeres regisztráció
- `registration_error`: Regisztrációs hiba
- `pong`: Heartbeat válasz
- `event_acknowledged`: Esemény nyugtázva
- `error`: Hibaüzenet

## Hibaüzenetek

Ha ismeretlen üzenet típust küld az eszköz:
```json
{
  "type": "error",
  "message": "Ismeretlen üzenet típus: unknown_type"
}
```

JSON parse hiba esetén:
```json
{
  "type": "error",
  "message": "JSON parse hiba: ..."
}
```

## Kapcsolat lezárása

Az eszköz vagy a szerver bármikor lezárhatja a WebSocket kapcsolatot. A szerver naplózza a lecsatlakozást.

## Tesztelés

### Python tesztprogram
Eszköz viselkedésének szimulálására:
```python
import websocket
import json

# Csatlakozás (nem SSL!)
ws = websocket.create_connection('ws://te.pixisys.eu/ws/device/')

# Welcome
print(ws.recv())

# Regisztráció
ws.send(json.dumps({
    'type': 'register',
    'device_id': 'C202504083',
    'device_info': {'terminal_type': 'EN-D815FTW'}
}))
print(ws.recv())

# Ping
ws.send(json.dumps({'type': 'ping', 'timestamp': '2026-01-02'}))
print(ws.recv())

ws.close()
```

### Eszköz felfedezés
A fr WebSocket kapcsolat **ws://** (nem SSL), egyszerű HTTP-n keresztül
2. Az Apache proxy továbbítja a WebSocket kapcsolatokat a Daphne ASGI szerverre
3. A backend Django Channels-t használ WebSocket kezeléshez
4. A csatlakozott eszközök listája a `CONNECTED_DEVICES` globális változóban van tárolva
5. Az "Eszközök keresése" gomb a frontenden megjeleníti az élő eszközöket
- Eszköz információk (típus, stb.)

## Megjegyzések

1. Az SSL tanúsítvány Let's Encrypt
2. A WebSocket kapcsolat HTTPS-en keresztül megy (wss://)
3. Az Apache proxy továbbítja a WebSocket kapcsolatokat a Daphne ASGI szerverre
4. A backend Django Channels-t használ WebSocket kezeléshez
