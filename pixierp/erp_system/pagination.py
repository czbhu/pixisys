from rest_framework.pagination import PageNumberPagination


class LargeResultsSetPagination(PageNumberPagination):
    """
    Alapértelmezett lapozó, ami megengedi a page_size query paramétert.
    Maximum 1000 elem per lap, alapértelmezett 20.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000
