#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SoftwareSerial.h>
#include <ArduinoJson.h>
#include <list>
#include "config.h"

// SoftwareSerial for QR Code Reader
SoftwareSerial qrSerial(PIN_QR_RX, PIN_QR_TX);

// Queue definition
struct ScannedToken {
    String token;
    unsigned long timestamp;
};
std::list<ScannedToken> tokenQueue;
const int MAX_QUEUE_SIZE = 5;

// Global debounce
String lastScannedToken = "";
unsigned long lastScanTime = 0;
const int DEBOUNCE_DELAY = 2000; // 2 seconds

void setupWiFi() {
    Serial.println();
    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected");
        Serial.print("IP address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\nWiFi connection failed. Will retry later.");
    }
}

void sendToken(String token) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi not connected. Queuing token.");
        if (tokenQueue.size() < MAX_QUEUE_SIZE) {
            tokenQueue.push_back({token, millis()});
        }
        // Try to reconnect
        setupWiFi(); 
        return;
    }

    WiFiClientSecure client;
    client.setInsecure(); // Skip certificate validation for simplicity/speed
    
    HTTPClient http;
    
    Serial.print("Sending token to: ");
    Serial.println(API_URL);

    if (http.begin(client, API_URL)) {
        http.addHeader("Content-Type", "application/json");

        JsonDocument doc;
        doc["token"] = token;
        doc["device_id"] = DEVICE_ID;
        
        String jsonString;
        serializeJson(doc, jsonString);

        int httpCode = http.POST(jsonString);

        if (httpCode > 0) {
            Serial.printf("HTTP Response code: %d\n", httpCode);
            String payload = http.getString();
            Serial.println(payload);
            
            if (httpCode == 200) {
                // Flash LED to indicate success
                digitalWrite(LED_BUILTIN, LOW); // LED is active LOW on NodeMCU
                delay(200);
                digitalWrite(LED_BUILTIN, HIGH);
                delay(200);
                digitalWrite(LED_BUILTIN, LOW);
                delay(200);
                digitalWrite(LED_BUILTIN, HIGH);
            } else {
                 Serial.println("Server returned error.");
            }
        } else {
            Serial.printf("HTTP POST failed, error: %s\n", http.errorToString(httpCode).c_str());
            // Queue on network failure
             if (tokenQueue.size() < MAX_QUEUE_SIZE) {
                tokenQueue.push_back({token, millis()});
            }
        }
        http.end();
    } else {
        Serial.println("Unable to connect to server");
    }
}

void setup() {
    Serial.begin(115200);
    qrSerial.begin(9600); // Try 9600 first (common default for QR modules)
    
    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, HIGH); // Off

    setupWiFi();
    
    Serial.println("Scanner Ready. Waiting for QR codes...");
}

void processQueue() {
    if (!tokenQueue.empty() && WiFi.status() == WL_CONNECTED) {
        ScannedToken item = tokenQueue.front();
        tokenQueue.pop_front();
        Serial.println("Processing queued item...");
        sendToken(item.token);
    }
}

void loop() {
    // Process Serial Input
    if (qrSerial.available()) {
        String token = qrSerial.readStringUntil('\n'); // Read until newline
        token.trim(); // Remove whitespace/CR/LF
        
        if (token.length() > 0) {
            unsigned long now = millis();
            
            // Check debounce
            if (token == lastScannedToken && (now - lastScanTime < DEBOUNCE_DELAY)) {
                Serial.println("Duplicate scan ignored (debounce).");
            } else {
                Serial.print("QR Scanned: ");
                Serial.println(token);
                
                lastScannedToken = token;
                lastScanTime = now;
                
                sendToken(token);
            }
        }
    }

    // Maintenance
    processQueue();
    
    // Check WiFi Connection periodically
    if (WiFi.status() != WL_CONNECTED) {
        // Simple reconnect logic handled in sendToken or specialized task
        // For simple loop, we can just blink nicely
    }
    
    delay(10); // Yield to system 
}
