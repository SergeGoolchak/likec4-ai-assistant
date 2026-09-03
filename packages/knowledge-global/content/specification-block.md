# Блок specification: пользовательские типы элементов и связей

Прежде чем использовать `kind` элемента или связи в `model`, его нужно объявить в `specification`:

```
specification {
  element system
  element service {
    style {
      shape rectangle
      color blue
    }
  }
  element database
  element queue

  relationship async {
    line dashed
  }

  tag external
  tag deprecated
}
```

Каждый `element <kind>` — это объявление нового допустимого типа элемента для проекта (не встроенный тип LikeC4, а конвенция конкретного проекта — например `service`, `database`, `queue`, `external-system`). У проекта могут быть свои устоявшиеся kind'ы — их список нужно уважать при добавлении новых элементов, а не изобретать похожие по смыслу новые (`service` и `microservice` в одном проекте почти всегда означают, что кто-то не нашёл существующий kind).

`relationship <kind>` аналогично объявляет пользовательские типы связей (например, `async` для событийного взаимодействия против `sync` для прямых вызовов) — полезно для последующей фильтрации во views.

`tag` объявляет тег, который потом можно навешивать на элементы (`tag external` → `#external`) и использовать в предикатах views (`include * where tag is #external`).
