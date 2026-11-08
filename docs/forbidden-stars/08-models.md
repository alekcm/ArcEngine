# 3D-модели

Все модели — формат **`.obj`** (Wavefront), лежат в папках фракций. Всего 69 файлов, ~40 МБ.
Модели — фанатские/выложенные в сеть (в именах файлов видны исходные адреса: pastebin, dropbox,
steamusercontent — имена сохранены как есть, чтобы не терять связь с источником).

**Что это значит для движка ArcEngine:** `js/Model3D.js` читает бинарный **FBX** и GLB, `.obj`
он не читает. Значит, для игры модели надо сконвертировать в `.glb`/`.fbx` (Blender) либо
написать загрузчик OBJ (`BABYLON.SceneLoader` из `libs/babylonjs.loaders.min.js` умеет OBJ —
это отдельный плагин, его в наборе нет). Это отдельная задача, до неё модели в игре не появятся.

## Имперская гвардия (`Warhammer/Имперская гвардия/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `httpswwwdropboxcomsid3nfm1xvj9s2q3Imperial20Battleshipobjdl1.obj` | 783 КБ | линкор/крейсер Имперского флота |
| `ChaosValkyrie04.obj` | 503 КБ | «Валькирия» (летающий транспорт) |
| `httpcloud3steamusercontent…A782921CE77B7507EBA8D7ED2A3006C7B65.obj` | 161 КБ | ? |
| `httpcloud3steamusercontent…A6EE60C64DC360A66F170C11DA907C59DE3A1D.obj` | 205 КБ | ? |
| `httpcloud3steamusercontent…F753CAF7D6C1BF58A61A877D82D25C238B8E10F.obj` | 311 КБ | ? |
| `httppastebincomrawphpi5WJEx919.obj` | 3 КБ | заглушка/обломок (почти пустой) |

## Космодесант (`Warhammer/Космодесантники/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `SpaceScout02.obj` | 191 КБ | скауты |
| `SpaceMarine05.obj` | 266 КБ | космодесант |
| `SpaceLandRaider01.obj` | 403 КБ | ленд рейдер |
| `0E405721…_stormtalon_bolter.obj` | 809 КБ | «Штормовой коготь» (штурмовик) |
| `1CC0F9F6…TTS40KKnights40kKnightErrantobj.obj` | 880 КБ | рыцарь (Knight Errant) |
| `httpsdrivegooglecom…STUJuUXZRSF8yNWc.obj` | 703 КБ | ? (возможно, титан «Варлорд») |

## Орки (`Warhammer/Орки/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `OrkBoyz02.obj` | 254 КБ | бойзы |
| `OrkNobz06.obj` | 409 КБ | нобзы |
| `OrkBattlewagon02.obj` | 349 КБ | батлвагон |
| `OrkLanda.obj` | 616 КБ | «Ланда» (десантный корабль) |
| `571F92A5…_Dakkajet Wazbomm.obj` | 304 КБ | «Даккаджет» (самолёт), не отряд из планшета |
| `68658BD8…OrksEpicGreatGargantobj.obj` | 706 КБ | гаргант |

## Некроны (`Warhammer/Некроны/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `httpsmymixtapemoeibzatkobj.obj` | 261 КБ | ? |
| `httpsmymixtapemoejfekczobj.obj` | 734 КБ | ? |
| `httpsmymixtapemoejhrctrobj.obj` | 382 КБ | ? |
| `httpcloud3steamusercontent…F86B3562BBD25ED7.obj` | 376 КБ | ? |
| `6BF96780…_necron ship big2.obj` | 1322 КБ | большой корабль (корабль-гробница) |
| `4F00FB00…_necron ships long.obj` | 1322 КБ | длинный корабль (крейсер Жнец) |

## Хаос (`Warhammer/Хаос/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `ChaosCultist.obj` | 218 КБ | культисты |
| `ChaosMarine.obj` | 306 КБ | космодесант Хаоса |
| `ChaosHelbrute.obj` | 450 КБ | хелбрут |
| `ChaosTitan.obj` | 684 КБ | титан «Налётчик» |
| `httpsdrivegooglecom…SazZ1QzVUcTM5V3c.obj` | 780 КБ | ? (корабль) |
| `httpsdrivegooglecom…SekxxQWpZWVZ6NUk.obj` | 780 КБ | ? (корабль) |

## Эльдары (`Warhammer/Эльдары/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `Аспектные воины.obj` | 14 КБ | аспектные воины (почти пустой файл — битый?) |
| `EldarStalker02.obj` | 171 КБ | ? |
| `EldarWraithguard01.obj` | 199 КБ | призрачные стражи |
| `EldarFalcon02.obj` | 231 КБ | гравитанк «Сокол» |
| `EldarTitan.obj` | 626 КБ | титан «Варлок» |

## Тау (`Warhammer/Тау/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `httppastebincomrawphpi9HhMFJgb.obj` | 248 КБ | ? |
| `httpspasteeerj5tuE.obj` | 497 КБ | ? |
| `httpsmymixtapemoeqciqzoobj.obj` | 510 КБ | ? |
| `httpsmymixtapemoekfulghobj.obj` | 761 КБ | ? |
| `httpsmymixtapemoecxnotmobj.obj` | 872 КБ | ? |
| `httpsmymixtapemoekbloohobj.obj` | 1104 КБ | ? (крупный корабль) |

## Тираниды (`Warhammer/Тираниды/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `httpswwwdropboxcomsm74w1tnhkb63zobVoid20Fiend20Cruiserobjdl1.obj` | 180 КБ | «Пожиратель» (корабль) |
| `httpcloud3steamusercontent…E5DB04604335.obj` | 174 КБ | ? |
| `httpcloud3steamusercontent…F4050349D.obj` | 326 КБ | ? |
| `httpcloud3steamusercontent…E7A06A7743.obj` | 484 КБ | ? |
| `httpcloud3steamusercontent…411B025.obj` | 754 КБ | ? |

## Инквизиция (`Warhammer/Инквизиция/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `95B7BC40…_IT0.obj` | 244 КБ | ? |
| `9D8EE793…_IT2.obj` | 131 КБ | ? |
| `2D71889A…_HellblasterAssault.obj` | 407 КБ | штурмовики (Hellblaster) |
| `957DA5F5…_T3.obj` | 736 КБ | ? |
| `FFDD6945…_I_0.obj` | 850 КБ | ? |
| `6F3B44EA…_I_2.obj` | 1055 КБ | ? |

## Сестры битвы (`Warhammer/Сестры битвы/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `86471B86…_SoBT0.obj` | 187 КБ | сестра битвы |
| `675403A6…_BattleSister_model.obj` | 355 КБ | BattleSister |
| `DCAB1D65…_Exorcist_model.obj` | 791 КБ | танк «Экзорцист» |
| `28E7C22A…_AS_0.obj` | 1024 КБ | ? |
| `46F0CC7C…_AS_2.obj` | 1067 КБ | ? |
| `B4A4AC19…_Celestine8.obj` | 1279 КБ | Живая святая (Селестина) |

## Тёмные эльдары (`Warhammer/Тёмные эльдары/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `06B4FC4D…_Wych3kabal1.obj` | 421 КБ | ведьмы/каббалиты |
| `085F623B…_DET0.obj` | 295 КБ | ? |
| `8D528154…_DE_2.obj` | 226 КБ | ? |
| `E431D7EB…_DET2.obj` | 1681 КБ | крупная модель |
| `F14323A5…_BASE_105-70_2.obj` | 16 КБ | подставка (base) |

## Адептус Механикус (`Warhammer/Адептус механикус/`)

| Файл | Размер | Похоже на |
|---|---|---|
| `3BE5D3DB…_AM_0.obj` | 780 КБ | скитарии |
| `A96F7782…_AM_2.obj` | 1032 КБ | ? |
| `AFC42C23…_AMT1.obj` | 1393 КБ | ? |
| `C304DE08…_AMT2.obj` | 1130 КБ | ? |
| `D431C951…_T0.obj` | 821 КБ | ? |
| `994C1CD1…_warlord titan MARS model.obj` | 1830 КБ | тяжёлый титан |

## Что нужно сделать с моделями

1. Определить, какая модель — какой отряд (открыть в просмотрщике; по именам видно меньше
   половины).
2. Конвертировать `.obj` → `.glb` (Blender, `obj→gltf`) и положить в `assets/models/` — у моделей
   нет текстур и материалов, только геометрия (как и у FBX в наборе, `Model3D` красит их цветом).
3. Проверить масштаб: в наборе «1 см в файле = 1 px», у этих моделей масштаб произвольный —
   понадобится нормировка по габаритам.
4. Для отрядов без моделей (у большинства фракций их меньше, чем отрядов на планшете) — временные
   заглушки: призма/кубик с цветом фракции.
