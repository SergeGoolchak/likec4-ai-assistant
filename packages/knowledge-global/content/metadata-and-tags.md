# Metadata и tags у элементов и связей

`metadata` — произвольные ключ-значение поля внутри тела элемента или связи, для данных, которые не входят в стандартные свойства LikeC4 (title/description/technology), но важны для конкретного проекта — например владелец сервиса, ссылка на runbook, SLA:

```
service orderService "Order Service" {
  metadata {
    owner "checkout-team"
    repository "https://git.example.com/checkout/order-service"
    sla "99.9%"
  }
}
```

Если Architecture Rules проекта требуют обязательные metadata-поля для определённого kind (например, `owner` для любого `service` — см. ФТ12), любой новый элемент этого kind должен их получить сразу при создании, а не оставаться без владельца "на потом".

`tags` (объявленные заранее в `specification` через `tag`) навешиваются через `#`:

```
service legacyBillingService "Legacy Billing" #deprecated #external
```

Теги используются для фильтрации во views (`include * where tag is #external`) и для группировки в Architecture Rules (`appliesToKinds`/применимость по тегу, а не только по kind).
