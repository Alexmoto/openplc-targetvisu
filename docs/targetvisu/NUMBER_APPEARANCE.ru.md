# Примитив Number — цвета, привязки и скругление

Функция добавлена в ветку `feature/number-dynamic-colors` проекта OpenPLC Editor.

## Свойства

В разделе **Element properties** у выделенного примитива `Number`:
- **Background Color** — постоянный цвет фона (`fill`);
- **Background color variable** — PLC-переменная, задающая цвет фона;
- **Border Color** / **Border color variable** — цвет и привязка цвета рамки;
- **Text Color** / **Text color variable** — цвет и привязка цвета текста;
- **Border width** — толщина рамки (0–20 px);
- **Border radius** — радиус закругления (0–100 px).

Когда в выпадающем списке указано **Unbound**, используется выбранный постоянный цвет. При привязке к переменной цвет берётся из неё. Цвета обновляются при получении очередного набора значений от PLC.

## Пример Structured Text

```iecst
VAR_GLOBAL
    Pressure : REAL;
    NumberBackground : DWORD := 16#0B3D91;
    NumberBorder : DWORD := 16#00FF00;
    NumberText : DWORD := 16#FFFFFF;
END_VAR
```

В свойствах `Number`: `Value variable = Pressure`, `Background color variable = NumberBackground`, `Border color variable = NumberBorder`, `Text color variable = NumberText`.

Формат цвета — `16#RRGGBB`, младшие 24 бита целочисленного значения. Например:
- `16#FF0000` красный;
- `16#FFFF00` жёлтый;
- `16#00FF00` зелёный;
- `16#FFFFFF` белый.

`BOOL`, `REAL` и `LREAL` не подходят для прямой привязки цвета. При отсутствии новой переменной в проекте компиляция обнаружит ошибку привязки. Перед загрузкой проекта обновите Runtime, иначе старая версия не будет динамически отрисовывать цвета.

## Установка

На Windows в каталоге `openplc-targetvisu`:
```powershell
git status --short
git fetch origin feature/number-dynamic-colors
git switch feature/number-dynamic-colors
git pull --ff-only origin feature/number-dynamic-colors
npm run package
```

Сборка создаст новый установочный пакет в `dist`, который нужно установить. Если зависимости не установлены, сначала выполните `npm ci` (Node.js 22/23).

Для Banana Pi используйте инструкции в репозитории Runtime: [TargetVisu Number Update](https://github.com/Alexmoto/openplc-runtime/blob/feature/number-dynamic-colors/updates/targetvisu-number-v0.6.0/README.ru.md).

Примечание: сохранены старые поля `fill`, `stroke`, `textColor` и `strokeWidth`. В старых проектах отсутствующее `borderRadius` читается как 0, новые привязки по умолчанию пустые. Файлы проекта переписывать вручную не требуется.
