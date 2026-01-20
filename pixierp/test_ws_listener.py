import websocket
import _thread
import time
import json

def on_message(ws, message):
    print(f"RECEIVED: {message}")

def on_error(ws, error):
    print(f"ERROR: {error}")

def on_close(ws, close_status_code, close_msg):
    print("### closed ###")

def on_open(ws):
    print("### opened ###")

# Connect cleanly to local daphne
ws_url = "ws://127.0.0.1:8003/ws/attendance/"

if __name__ == "__main__":
    websocket.enableTrace(True)
    ws = websocket.WebSocketApp(ws_url,
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)

    ws.run_forever()
