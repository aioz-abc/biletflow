from django.urls import path

from . import views

urlpatterns = [
    path("tickets/verify", views.VerifyTicket.as_view()),
    path("tickets/check-in", views.CheckIn.as_view()),
    path("events", views.EventList.as_view()),
    path("events/<int:pk>", views.EventDetail.as_view()),
    path("events/<int:pk>/publish", views.Publish.as_view()),
    path("events/<int:pk>/ticket-types", views.TicketTypeList.as_view()),
    path("events/<int:pk>/attendees", views.EventAttendees.as_view()),
    path("ticket-types/<int:pk>", views.TicketTypeDetail.as_view()),
    path("orders", views.OrderCreate.as_view()),
    path("orders/<int:pk>", views.OrderDetail.as_view()),
    path("orders/<int:pk>/checkout", views.Checkout.as_view()),
    path("orders/<int:pk>/cancel", views.CancelOrder.as_view()),
    path("tickets/<int:pk>", views.TicketDetail.as_view()),
    path("tickets/<int:pk>/qr", views.TicketQR.as_view()),
    path("tickets/<int:pk>/verify", views.VerifyTicket.as_view()),
    path("tickets/<int:pk>/check-in", views.CheckIn.as_view()),
    path("me/events", views.MyEvents.as_view()),
    path("me/orders", views.MyOrders.as_view()),
    path("me/tickets", views.MyTickets.as_view()),
]
