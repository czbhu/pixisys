from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import ProjectParticipation
from apps.core.services import send_notification

@receiver(post_save, sender=ProjectParticipation)
def notify_new_participation(sender, instance, created, **kwargs):
    if created:
        user = instance.employee.user
        project_name = instance.project.name
        role = instance.role
        
        send_notification(
            user=user,
            title="Új projekt meghívás",
            message=f"Hozzáadtak a(z) {project_name} projekthez mint {role}.",
            link=f"/manufacturing/projects/{instance.project.id}", # Assuming frontend route
            type="info"
        )
