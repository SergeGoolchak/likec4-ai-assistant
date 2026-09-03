# Блок model: элементы, вложенность, связи

Элемент объявляется как `<kind> <id> "<title>"`, с необязательным телом `{ ... }` для вложенных элементов, описания, тегов, metadata и технологии:

```
model {
  system paymentsPlatform "Payments Platform" {
    service orderService "Order Service" {
      description "Handles order lifecycle"
      technology "Node.js"
    }
    service paymentService "Payment Service"
    database orderDb "Order DB" {
      technology "PostgreSQL"
    }
  }

  orderService -> paymentService "charges" {
    technology "gRPC"
  }
  orderService -> orderDb "reads/writes"
}
```

Связь между элементами — `sourceId -> targetId "title"`, может стоять как внутри `model`, так и рядом с объявлением элемента. Связи можно объявлять между элементами на любом уровне вложенности, LikeC4 разрешает `fqn` относительно текущей области видимости — внутри `paymentsPlatform` можно писать просто `orderService`, а снаружи потребуется полный путь `paymentsPlatform.orderService`.

Важно для инкрементальных изменений: если элемент с нужным `id` уже существует в модели (в любом файле проекта), не нужно объявлять его заново — новая связь или дополнительное свойство добавляются через `extend`:

```
extend service orderService {
  -> notificationService "sends order confirmation"
}
```

`extend` позволяет дополнять уже существующий элемент (новыми связями, тегами, metadata) из другого файла, не трогая исходное объявление — именно этот механизм стоит использовать при дополнении существующей модели, а не копирование блока с тем же id в другой файл (что привело бы к конфликту дублирующихся идентификаторов).
