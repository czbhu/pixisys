from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Notification

def send_notification(user, title, message, link=None, type='info'):
    """
    Sends a push notification to the user via WebSocket and saves it to the database.
    
    Args:
        user: The User object to send the notification to.
        title: The title of the notification.
        message: The body of the notification.
        link: Optional URL to redirect to when clicked.
        type: 'info', 'success', 'warning', 'error'
    """
    if not user:
        return

    # 1. Save to Database
    Notification.objects.create(
        user=user,
        title=title,
        message=message,
        link=link,
        type=type
    )
    
    # 2. Send via WebSocket
    channel_layer = get_channel_layer()
    group_name = f"user_{user.id}"
    
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": "notification.message",
            "title": title,
            "message": message,
            "link": link,
            "type": type
        }
    )
