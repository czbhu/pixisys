"""PTS-2 forecourt controller jsonPTS protokoll kliens.

A Technotrade PTS-2 kútkontroller HTTP(S) web-szerverén keresztül, POST /jsonPTS
végpontra küldött JSON üzenetekkel kommunikál (jsonPTS communication protocol
specification, R140). Az autentikáció digest vagy basic lehet (a vezérlő
DIP-2 kapcsolójától függően). HTTPS esetén a vezérlő önaláírt tanúsítványt
használ, ezért a tanúsítvány-ellenőrzés ki van kapcsolva.
"""
import requests
from requests.auth import HTTPBasicAuth, HTTPDigestAuth


class PTSError(Exception):
    """jsonPTS hiba-válasz vagy kommunikációs hiba."""

    def __init__(self, message, code=None, data=None):
        self.message = message
        self.code = code
        self.data = data or {}
        super().__init__(message)


class PTS2Client:
    """Közvetlen jsonPTS kliens egy PTS-2 vezérlőhöz.

    A kliens állapotmentes: minden hívás egy önálló HTTP kérés.
    """

    def __init__(self, base_url, auth_type='digest', username='admin', password='admin', timeout=5):
        self.base_url = (base_url or '').rstrip('/')
        self.timeout = timeout
        if auth_type == 'basic':
            self.auth = HTTPBasicAuth(username or '', password or '')
        else:
            self.auth = HTTPDigestAuth(username or '', password or '')
        self._packet_id = 0

    # ------------------------------------------------------------------ core

    def _next_id(self):
        self._packet_id = (self._packet_id % 2147483646) + 1
        return self._packet_id

    def build_packet(self, packet_type, data=None):
        packet = {'Id': self._next_id(), 'Type': packet_type}
        if data is not None:
            packet['Data'] = data
        return packet

    def send(self, packets):
        """Küld egy (vagy több) csomagot, visszaadja a válasz csomagok listáját.

        Ha bármely válasz csomag hibát tartalmaz, PTSError-t dob (az első hibásra).
        """
        responses = self.send_raw(packets)
        for packet in responses:
            if packet.get('Error'):
                raise PTSError(
                    packet.get('Message') or 'jsonPTS hiba',
                    code=packet.get('Code'),
                    data=packet.get('Data') or {},
                )
        return responses

    def send_raw(self, packets):
        """Küldi a csomagokat és nyers válaszlistát ad (hiba-válaszcsomagokkal együtt)."""
        if isinstance(packets, dict):
            packets = [packets]
        payload = {
            'Protocol': 'jsonPTS',
            'Packets': packets,
        }
        url = self.base_url + '/jsonPTS'
        try:
            resp = requests.post(
                url,
                json=payload,
                auth=self.auth,
                timeout=self.timeout,
                verify=False,
                headers={'Content-Type': 'application/json; charset=utf-8'},
            )
        except requests.exceptions.Timeout as exc:
            raise PTSError(f'Időtúllépés a PTS-2 vezérlő elérése közben ({url})') from exc
        except requests.exceptions.ConnectionError as exc:
            raise PTSError(f'Nem sikerült kapcsolódni a PTS-2 vezérlőhöz ({url})') from exc
        except requests.exceptions.RequestException as exc:
            raise PTSError(f'PTS-2 kommunikációs hiba: {exc}') from exc

        if resp.status_code == 401:
            raise PTSError('Autentikációs hiba: érvénytelen felhasználónév/jelszó (HTTP 401)', code=401)
        if resp.status_code == 403:
            raise PTSError('A felhasználónak nincs jogosultsága a kéréshez (HTTP 403)', code=403)
        if resp.status_code != 200:
            raise PTSError(f'Váratlan HTTP válasz a vezérlőtől: {resp.status_code}', code=resp.status_code)

        try:
            body = resp.json()
        except ValueError as exc:
            raise PTSError('Érvénytelen (nem JSON) válasz a PTS-2 vezérlőtől') from exc
        return body.get('Packets') or []

    def request(self, packet_type, data=None):
        """Egyetlen kérés-kérés válasz Data részét adja vissza."""
        responses = self.send(self.build_packet(packet_type, data))
        if not responses:
            raise PTSError('Üres válasz a PTS-2 vezérlőtől')
        return responses[0].get('Data') or {}

    def request_confirmation(self, packet_type, data=None):
        """Setter típusú kérés: confirmation ('OK') vagy PTSError."""
        self.request(packet_type, data)
        return True

    # ------------------------------------------------------- általános info

    def get_controller_type(self):
        return self.request('GetControllerType')

    def get_firmware_information(self):
        return self.request('GetFirmwareInformation')

    def get_unique_identifier(self):
        return self.request('GetUniqueIdentifier')

    def get_date_time(self):
        return self.request('GetDateTime')

    def get_controller_info(self):
        """Diagnosztikai csomag: vezérlő típus, firmware, egyedi azonosító, idő."""
        packets = [
            self.build_packet('GetControllerType'),
            self.build_packet('GetFirmwareInformation'),
            self.build_packet('GetUniqueIdentifier'),
            self.build_packet('GetDateTime'),
        ]
        responses = self.send(packets)
        result = {}
        for packet in responses:
            result[packet.get('Type')] = packet.get('Data') or {}
        return result

    # ------------------------------------------------- konfiguráció ki/_be

    def get_pumps_configuration(self):
        return self.request('GetPumpsConfiguration')

    def get_fuel_grades_configuration(self):
        return self.request('GetFuelGradesConfiguration')

    def get_fuel_grades_prices(self):
        return self.request('GetFuelGradesPrices')

    def set_fuel_grades_prices(self, prices):
        """prices: [{'FuelGradeId': 1, 'Price': 595.90}, ...]"""
        return self.request_confirmation('SetFuelGradesPrices', {'FuelGradesPrices': prices})

    def get_pump_nozzles_configuration(self):
        return self.request('GetPumpNozzlesConfiguration')

    def get_users_configuration(self):
        return self.request('GetUsersConfiguration')

    # ------------------------------------------------------------ kútvezerlés

    def get_status(self, pump):
        """PumpGetStatus – a válasz típusa az állapottól függ
        (PumpIdleStatus / PumpFillingStatus / PumpEndOfTransactionStatus /
        PumpOfflineStatus / PumpTotals / PumpPrices / PumpTag / PumpDisplayData)."""
        responses = self.send(self.build_packet('PumpGetStatus', {'Pump': int(pump)}))
        if not responses:
            raise PTSError('Üres válasz a PTS-2 vezérlőtől')
        packet = responses[0]
        return {'Type': packet.get('Type'), 'Data': packet.get('Data') or {}}

    def get_statuses(self, pump_numbers):
        """Több kút állapota egyetlen jsonPTS üzenetben (batch csomagok)."""
        if not pump_numbers:
            return []
        packets = [self.build_packet('PumpGetStatus', {'Pump': int(p)}) for p in pump_numbers]
        responses = self.send(packets)
        return [
            {'RequestedPump': packet_in.get('Data', {}).get('Pump'),
             'Type': packet.get('Type'),
             'Data': packet.get('Data') or {}}
            for packet_in, packet in zip(packets, responses)
        ]

    def authorize(self, pump, nozzle=None, fuel_grade_id=None, preset_type='FullTank',
                  dose=None, price=None, transaction=None, auto_close_transaction=None):
        """PumpAuthorize – preset és ár beállítása, töltés engedélyezése."""
        data = {'Pump': int(pump)}
        if nozzle is not None:
            data['Nozzle'] = int(nozzle)
        if fuel_grade_id is not None:
            data['FuelGradeId'] = int(fuel_grade_id)
        data['Type'] = preset_type  # 'Volume' | 'Amount' | 'FullTank'
        if dose is not None:
            data['Dose'] = dose
        if price is not None:
            data['Price'] = price
        if transaction is not None:
            data['Transaction'] = int(transaction)
        if auto_close_transaction is not None:
            data['AutoCloseTransaction'] = bool(auto_close_transaction)
        return self.request('PumpAuthorize', data)

    def stop(self, pump):
        return self.request_confirmation('PumpStop', {'Pump': int(pump)})

    def emergency_stop(self, pump):
        return self.request_confirmation('PumpEmergencyStop', {'Pump': int(pump)})

    def suspend(self, pump):
        return self.request_confirmation('PumpSuspend', {'Pump': int(pump)})

    def resume(self, pump):
        return self.request_confirmation('PumpResume', {'Pump': int(pump)})

    def close_transaction(self, pump, transaction):
        """PumpCloseTransaction – lezárja (nullázza) a kút nyitott tranzakcióját."""
        return self.request_confirmation('PumpCloseTransaction', {
            'Pump': int(pump), 'Transaction': int(transaction),
        })

    def get_transaction_information(self, pump, transaction=0):
        return self.request('PumpGetTransactionInformation', {
            'Pump': int(pump), 'Transaction': int(transaction or 0),
        })

    # ----------------------------------------------------------------- órák

    def request_totals(self, pump, nozzle):
        """PumpGetTotals – kérés; az óraérték később, PumpGetStatus polledése közben
        érkezik meg PumpTotals válaszként (a vezérlőnek idő kell a kiolvasásra)."""
        return self.request_confirmation('PumpGetTotals', {'Pump': int(pump), 'Nozzle': int(nozzle)})

    def get_last_saved_totals(self, pump):
        """PumpGetLastSavedTotals – a vezérlő memóriájában tárolt utolsó óraállások."""
        return self.request('PumpGetLastSavedTotals', {'Pump': int(pump)})

    # ---------------------------------------------------------------- naplók

    def report_pump_transactions(self, date_from=None, date_to=None, pump=0, transaction=None, is_paid=None):
        """ReportGetPumpTransactions – kút tranzakció napló kiolvasása időintervallumból."""
        data = {'Pump': int(pump or 0)}
        if date_from:
            data['DateTimeStart'] = str(date_from)
        if date_to:
            data['DateTimeEnd'] = str(date_to)
        if transaction:
            data['Transaction'] = int(transaction)
        if is_paid is not None:
            data['IsPaid'] = bool(is_paid)
        return self.request('ReportGetPumpTransactions', data)
