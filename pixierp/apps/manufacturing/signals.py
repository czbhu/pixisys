from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Project
from apps.core.services import send_notification

@receiver(post_save, sender=Project)
def notify_project_update(sender, instance, created, **kwargs):
    if not created:
        # Avoid circular imports if possible, use strings if needed but imports are better in signals usually
        from apps.hr.models import ProjectParticipation
        
        # Notify Project Manager if exists
        if instance.project_manager:
            # Maybe not needed if PM made the change, but let's send it for now or check request user?
            # We don't have access to request user easily in signals.
            pass

        # Notify Participants
        participations = ProjectParticipation.objects.filter(project=instance, is_active=True)
        for part in participations:
            user = part.employee.user
            
            # Don't notify if the user is the one who made the change? 
            # We can't easily know who made the change in post_save without middleware or custom save methods.
            # For now, we notify everyone relevant.
            
            send_notification(
                user=user,
                title="Projekt változás",
                message=f"változás történt a(z) {instance.name} projektben.",
                link=f"/manufacturing/projects/{instance.id}",
                type="info"
            )
