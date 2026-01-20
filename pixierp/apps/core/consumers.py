import json
from channels.generic.websocket import AsyncWebsocketConsumer

class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        
        if self.user.is_authenticated:
            self.room_group_name = f"user_{self.user.id}"
            
            # Join room group
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            
            await self.accept()
        else:
            await self.close()

    async def disconnect(self, close_code):
        if self.user.is_authenticated:
            # Leave room group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    # Receive message from room group
    async def notification_message(self, event):
        message = event['message']
        title = event.get('title', 'Értesítés')
        link = event.get('link', None)
        type = event.get('type', 'info')

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'title': title,
            'message': message,
            'link': link,
            'level': type
        }))
