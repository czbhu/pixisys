from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('displays', views.MatrixDisplayViewSet, basename='matrix-display')
router.register('media', views.MatrixMediaViewSet, basename='matrix-media')
router.register('programs', views.MatrixProgramViewSet, basename='matrix-program')
router.register('logs', views.MatrixSendLogViewSet, basename='matrix-log')

urlpatterns = router.urls
