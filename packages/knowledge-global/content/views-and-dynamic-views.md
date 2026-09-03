# Views и dynamic views (sequence-диаграммы)

Обычный view строится предикатами `include`/`exclude` над моделью:

```
views {
  view index {
    title "System Landscape"
    include *
  }

  view orderServiceContext of orderService {
    include orderService
    include orderService.*
    include orderService -> *
  }
}
```

`view <id> of <elementId>` — view в контексте конкретного элемента (аналог container/component view). `include *` — включить все элементы верхнего уровня; `include orderService.*` — все дочерние элементы; `include orderService -> *` — все связи, исходящие из элемента.

Dynamic view описывает последовательность взаимодействий (аналог sequence-диаграммы) явным списком шагов:

```
dynamic view checkoutFlow {
  title "Checkout Flow"

  orderService -> paymentService "1. charge card"
  paymentService -> orderService "2. confirm charge"
  orderService -> orderDb "3. persist order"
  orderService -> notificationService "4. send confirmation" async
}
```

Каждая строка — шаг с порядковым номером в title (по конвенции, не обязательное требование LikeC4, но принятая практика для читаемости). Модификатор `async` в конце шага помечает его как асинхронное взаимодействие (используется, если в specification объявлен relationship kind `async`). Dynamic view — то представление, которое нужно использовать для алгоритмов и интеграционных сценариев (ФТ10), а не обычный `view`.
