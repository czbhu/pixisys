#ifndef CONFIG_H
#define CONFIG_H

// WiFi Credentials
const char* WIFI_SSID = "Nyomda";
const char* WIFI_PASS = "cezekft80;

// API Configuration
const char* API_URL = "https://erp.pixisys.eu/api/v1/hr/attendances/device_scan/";
const char* DEVICE_ID = "gate_1";

// Pin Definitions
#define PIN_QR_RX 13 // D7 (GPIO13) - Connect to QR Module TX
#define PIN_QR_TX 12 // D6 (GPIO12) - Connect to QR Module RX (Optional)

// NOTE on Hardware Connection:
// The ESP8266 GPIO pins are 3.3V tolerant.
// If your QR code reader outputs 5V TTL logic on its TX pin:
// Use a voltage divider on the GPIO13 input!
// QR_TX ---[ 10k ]---+--- GPIO13 (D7)
//                    |
//                  [ 20k ]
//                    |
//                   GND

#endif
