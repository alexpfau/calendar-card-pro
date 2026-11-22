/**
 * The editor's termbase.
 *
 * One decided form per language for each UI term the editor uses, plus the forms that
 * were considered and rejected. `scripts/check-i18n.mjs` enforces both: a translation
 * whose value contains a rejected form is an error, and a translation whose key's English
 * *is* one of these terms must use the decided form.
 *
 * Two kinds of entry, and they enforce differently:
 *
 * - `decided` is compared against the translation of a key whose English is exactly the
 *   term. Around half the terms have such a key; for the rest the decision is recorded
 *   here but nothing checks it, which is why a rejected form is the stronger statement.
 * - `rejected` matches at a word start, case-insensitively, anywhere in the value, so it
 *   catches compounds — the way to enforce a term that has no key of its own.
 *
 * `NOUN_CAPS_LANGUAGES` are the languages whose own orthography capitalizes nouns, and
 * `CASELESS_LANGUAGES` those whose script has no case; both are exempt from the sentence-case
 * check on multi-word labels.
 *
 * Held here rather than in a document because a checked artifact that only prose defines
 * is one the checker cannot be trusted to still be reading: this file is imported, so a
 * rename or a shape change is a load error rather than a silently empty termbase.
 */

/** Languages whose orthography capitalizes nouns, exempt from the sentence-case check. */
export const NOUN_CAPS_LANGUAGES = ['de'];

/**
 * Languages written in a script without letter case, exempt from the sentence-case check too:
 * every capital in their labels is a Latin name such as Home Assistant.
 */
export const CASELESS_LANGUAGES = ['ja'];

/**
 * Every decided term, with the forms rejected for it.
 *
 * @type {ReadonlyArray<{ name: string, decided: Record<string, string>, rejected: Record<string, string[]> }>}
 */
export const GLOSSARY_TERMS = [
  {
    // Added after German drifted between two nouns for one thing inside a single helper --
    // labeled `Ganztags-Badge`, described as `eine abgerundete Pille`, then back to `das
    // Badge` in the next string. `Pille` is a medicine tablet in German and carries none of
    // English "pill"'s UI sense, so the helper read as "highlights all-day events with a
    // rounded tablet". Nothing could catch it: this file had no entry for the term, and
    // `check:i18n` scores coverage, not meaning -- German was at full coverage throughout.
    //
    // Every language that translates the editor already had ONE settled noun; they are
    // recorded here so the next one does not have to re-decide, and so a second spelling
    // inside one language fails instead of shipping.
    name: 'badge',
    sense: 'the rounded pill drawn around an all-day event label or title',
    decided: {
      de: 'Badge',
      et: 'märk',
      it: 'badge',
      ja: 'バッジ',
      ko: '배지',
      lt: 'ženklelis',
      lv: 'nozīmīte',
      nb: 'merke',
      pl: 'odznaka',
      sk: 'odznak',
      sv: 'märke',
    },
    // A rejected form matches at a word start, so this catches `Pille`, `Pillen` and
    // `Titel-Pille` alike.
    rejected: { de: ['Pille'] },
  },
  {
    name: 'time',
    sense: 'the clock time printed on an event row',
    decided: {
      de: 'Uhrzeit',
      et: 'Kellaaeg',
      it: 'Orario',
      ja: '時刻',
      ko: '시간',
      lt: 'Laikas',
      lv: 'Laiks',
      nb: 'Tid',
      pl: 'Czas',
      sk: 'Čas',
      sv: 'Tid',
    },
    rejected: {},
  },
  {
    name: 'start date',
    sense: "the day the card's window begins",
    decided: {
      de: 'Startdatum',
      et: 'Alguskuupäev',
      it: 'Data di inizio',
      ja: '開始日',
      ko: '시작일',
      lt: 'Pradžios data',
      lv: 'Sākuma datums',
      nb: 'Startdato',
      pl: 'Data początkowa',
      sk: 'Počiatočný dátum',
      sv: 'Startdatum',
    },
    rejected: {},
  },
  {
    name: 'event',
    sense: 'a calendar entry with a start and an end',
    decided: {
      de: 'Termin',
      et: 'sündmus',
      it: 'evento',
      ja: '予定',
      ko: '이벤트',
      lt: 'įvykis',
      lv: 'notikums',
      nb: 'hendelse',
      pl: 'wydarzenie',
      sk: 'udalosť',
      sv: 'händelse',
    },
    rejected: {
      de: ['Ereignis'],
      pl: ['Zdarzenia'],
    },
  },
  {
    name: 'calendar',
    sense: 'a calendar entity supplying events',
    decided: {
      de: 'Kalender',
      et: 'Kalender',
      it: 'Calendario',
      ja: 'カレンダー',
      ko: '캘린더',
      lt: 'Kalendorius',
      lv: 'Kalendārs',
      nb: 'Kalender',
      pl: 'Kalendarz',
      sk: 'Kalendár',
      sv: 'Kalender',
    },
    rejected: {},
  },
  {
    name: 'entity',
    sense: 'a Home Assistant entity',
    decided: {
      de: 'Entität',
      et: 'Olem',
      it: 'Entità',
      ja: 'エンティティ',
      ko: '엔티티',
      lt: 'Subjektas',
      lv: 'Vienība',
      nb: 'Entitet',
      pl: 'Encja',
      sk: 'Entita',
      sv: 'Entitet',
    },
    rejected: {
      ko: ['구성요소'],
      nb: ['Værenhet'],
    },
  },
  {
    name: 'weather',
    sense: 'the weather integration and its forecast',
    decided: {
      de: 'Wetter',
      et: 'Ilm',
      it: 'Meteo',
      ja: '天気',
      ko: '날씨',
      lt: 'Orai',
      lv: 'Laikapstākļi',
      nb: 'Vær',
      pl: 'Pogoda',
      sk: 'Počasie',
      sv: 'Väder',
    },
    rejected: {},
  },
  {
    name: 'location',
    sense: 'the place an event happens',
    decided: {
      de: 'Ort',
      et: 'Asukoht',
      it: 'Luogo',
      ja: '場所',
      ko: '장소',
      lt: 'Vieta',
      lv: 'Atrašanās vieta',
      nb: 'Sted',
      pl: 'Lokalizacja',
      sk: 'Miesto',
      sv: 'Plats',
    },
    rejected: {
      it: ['Posizione'],
    },
  },
  {
    name: 'description',
    sense: "an event's description text",
    decided: {
      de: 'Beschreibung',
      et: 'Kirjeldus',
      it: 'Descrizione',
      ja: '説明',
      ko: '설명',
      lt: 'Aprašymas',
      lv: 'Apraksts',
      nb: 'Beskrivelse',
      pl: 'Opis',
      sk: 'Popis',
      sv: 'Beskrivning',
    },
    rejected: {},
  },
  {
    name: 'label',
    sense: 'the small text tag drawn beside an event',
    decided: {
      de: 'Label',
      et: 'Silt',
      it: 'Etichetta',
      ja: 'ラベル',
      ko: '레이블',
      lt: 'Etiketė',
      lv: 'Etiķete',
      nb: 'Etikett',
      pl: 'Etykieta',
      sk: 'Štítok',
      sv: 'Etikett',
    },
    rejected: {
      ko: ['라벨'],
      sk: ['Menovka'],
    },
  },
  {
    name: 'all day',
    sense: 'an event with no clock time',
    decided: {
      de: 'Ganztägig',
      et: 'Terve päev',
      it: 'Tutto il giorno',
      ja: '終日',
      ko: '종일',
      lt: 'Visą dieną',
      lv: 'Visu dienu',
      nb: 'Hele dagen',
      pl: 'Cały dzień',
      sk: 'Celý deň',
      sv: 'Heldag',
    },
    rejected: {},
  },
  {
    name: 'multi-day',
    sense: 'an event spanning more than one day',
    decided: {
      de: 'Mehrtägig',
      et: 'Mitmepäevane',
      it: 'Su più giorni',
      ja: '複数日',
      ko: '여러 날에 걸친',
      lt: 'Kelių dienų',
      lv: 'Vairāku dienu',
      nb: 'Flerdags',
      pl: 'Wielodniowe',
      sk: 'Viacdňové',
      sv: 'Flerdags',
    },
    // Both of these were in the tree and both were turned down, so neither is a guess. The
    // heading and the option beneath it are the two strings this term governs that a user
    // reads *stacked*, which is what made the drift visible: Slovak had `Viacdňové
    // udalosti` captioning `Rozdeliť niekoľkodňové udalosti`, and Italian `Eventi su più
    // giorni` captioning `Dividi eventi multi‑giorno`. Two words for one concept, one line
    // apart, in a section whose whole job is to name that concept.
    //
    // The Italian form carried a non-breaking hyphen (U+2011); the plain-hyphen and
    // unhyphenated spellings are listed too, because the next person to reach for the
    // calque will not reach for that character.
    rejected: {
      it: ['Multi\u2011giorno', 'Multi-giorno', 'Multigiorno'],
      ko: ['다중 일자'],
      sk: ['Niekoľkodňov'],
    },
  },
  {
    name: 'today',
    sense: 'the current day',
    decided: {
      de: 'Heute',
      et: 'Täna',
      it: 'Oggi',
      ja: '今日',
      ko: '오늘',
      lt: 'Šiandien',
      lv: 'Šodien',
      nb: 'I dag',
      pl: 'Dzisiaj',
      sk: 'Dnes',
      sv: 'I dag',
    },
    rejected: {},
  },
  {
    name: 'layout',
    sense: 'list layout versus column layout',
    decided: {
      de: 'Layout',
      et: 'Paigutus',
      it: 'Layout',
      ja: 'レイアウト',
      ko: '레이아웃',
      lt: 'Išdėstymas',
      lv: 'Izkārtojums',
      nb: 'Layout',
      pl: 'Układ',
      sk: 'Rozloženie',
      sv: 'Layout',
    },
    rejected: {
      nb: ['oppsett'],
    },
  },
  {
    name: 'columns',
    sense: 'the vertical divisions of the column layout',
    decided: {
      de: 'Spalten',
      et: 'Veerud',
      it: 'Colonne',
      ja: '列',
      ko: '열',
      lt: 'Stulpeliai',
      lv: 'Kolonnas',
      nb: 'Kolonner',
      pl: 'Kolumny',
      sk: 'Stĺpce',
      sv: 'Kolumner',
    },
    rejected: {},
  },
  {
    name: 'list',
    sense: 'the list layout',
    decided: {
      de: 'Liste',
      et: 'Loetelu',
      it: 'Lista',
      ja: 'リスト',
      ko: '목록',
      lt: 'Sąrašas',
      lv: 'Saraksts',
      nb: 'Liste',
      pl: 'Lista',
      sk: 'Zoznam',
      sv: 'Lista',
    },
    rejected: {},
  },
  {
    name: 'compact',
    sense: 'compact mode',
    decided: {
      de: 'Kompaktmodus',
      et: 'Kompaktrežiim',
      it: 'Modalità compatta',
      ja: 'コンパクト',
      ko: '컴팩트 모드',
      lt: 'Suglaudintas režimas',
      lv: 'Kompaktais režīms',
      nb: 'Kompakt modus',
      pl: 'Tryb kompaktowy',
      sk: 'Kompaktný režim',
      sv: 'Kompakt läge',
    },
    // Each language's word for Month's narrow form, so the two senses stay apart (see 'narrow').
    rejected: {
      de: ['schmal'],
      et: ['kitsa'],
      it: ['strett'],
      ja: ['幅の狭い'],
      ko: ['좁은'],
      lt: ['siaur'],
      lv: ['šaur'],
      nb: ['smal'],
      pl: ['wąsk'],
      sk: ['úzk'],
      sv: ['smal'],
    },
  },
  {
    // Month's form on a card too narrow for titles in its days. It was named "compact" until
    // v6.0 shipped, which read as Compact Mode, where compact means short rather than narrow;
    // so each language's Compact Mode word is rejected here, and this term's word there.
    name: 'narrow',
    sense: "Month's narrow form, a capsule per day and the chosen day's list under the weeks",
    decided: {
      de: 'Schmal',
      et: 'kitsas',
      it: 'Stretto',
      ja: '幅の狭い表示',
      ko: '좁은 형식',
      lt: 'Siauras',
      lv: 'Šaurs',
      nb: 'Smal',
      pl: 'Wąski',
      sk: 'Úzky',
      sv: 'Smal',
    },
    rejected: {
      de: ['kompakt'],
      et: ['kompakt'],
      it: ['compatt'],
      ja: ['コンパクト'],
      ko: ['컴팩트', '좁은 월 보기'],
      lt: ['suglaud'],
      lv: ['kompakt'],
      nb: ['kompakt'],
      pl: ['kompakt'],
      sk: ['kompakt'],
      sv: ['kompakt'],
    },
  },
  {
    // Month's two forms and the two places it lists a day's events, named alike on every page,
    // heading, marker and helper of Month's (backlog item 400). Before, the same things were
    // "in Days", "Narrow Cards", "Narrow Day List & +N Panel" and "the panel", which read as if
    // the panel "+N more" opens were the narrow form's alone; it opens from both.
    name: 'wide month',
    sense: "Month's wide form: event lines and bars in its days",
    decided: {
      de: 'Breiter Monat',
      et: 'Lai kuu',
      it: 'Mese largo',
      ja: '幅の広い表示',
      ko: '넓은 월 형식',
      lt: 'Platus mėnuo',
      lv: 'Platais mēnesis',
      nb: 'Bred måned',
      pl: 'Szeroki miesiąc',
      sk: 'Široký mesiac',
      sv: 'Bred månad',
    },
    rejected: {},
  },
  {
    name: 'narrow month',
    sense: "Month's narrow form: a dot per event, and the Day List under its weeks",
    decided: {
      de: 'Schmaler Monat',
      et: 'Kitsas kuu',
      it: 'Mese stretto',
      ja: '幅の狭い表示',
      ko: '좁은 월 형식',
      lt: 'Siauras mėnuo',
      lv: 'Šaurais mēnesis',
      nb: 'Smal måned',
      pl: 'Wąski miesiąc',
      sk: 'Úzky mesiac',
      sv: 'Smal månad',
    },
    rejected: {},
  },
  {
    name: 'day list',
    sense: "the chosen day's events listed under the Narrow Month's weeks",
    decided: {
      de: 'Tagesliste',
      et: 'Päeva loend',
      it: 'Elenco del giorno',
      ja: '予定一覧',
      ko: '하루 목록',
      lt: 'Dienos sąrašas',
      lv: 'Dienas saraksts',
      nb: 'Dagsliste',
      pl: 'Lista dnia',
      sk: 'Zoznam dňa',
      sv: 'Dagslista',
    },
    rejected: {},
  },
  {
    name: 'day panel',
    sense: 'what "+N more" opens, in either of Month\'s forms: one day\'s events',
    decided: {
      de: 'Tagesfenster',
      et: 'Päeva paneel',
      it: 'Pannello del giorno',
      ja: '予定パネル',
      ko: '하루 패널',
      lt: 'Dienos skydelis',
      lv: 'Dienas panelis',
      nb: 'Dagspanel',
      pl: 'Okno dnia',
      sk: 'Okno dňa',
      sv: 'Dagspanel',
    },
    // The panel's old name, built on "+N", which read as the narrow form's own.
    rejected: {
      de: ['+N-Panel'],
      et: ['+N-paneel'],
      it: ['pannello +N'],
      ja: ['「他N件」パネル'],
      ko: ['+N 패널'],
      lt: ['+N skydel'],
      lv: ['+N panel'],
      nb: ['+N-panel'],
      pl: ['okno +N'],
      sk: ['okno +N'],
      sv: ['+N-panel'],
    },
  },
  {
    name: 'position',
    sense: 'where something sits on the card',
    decided: {
      de: 'Position',
      et: 'Asend',
      it: 'Posizione',
      ja: '位置',
      ko: '위치',
      lt: 'Padėtis',
      lv: 'Pozīcija',
      nb: 'Posisjon',
      pl: 'Pozycja',
      sk: 'Poloha',
      sv: 'Position',
    },
    rejected: {},
  },
  {
    name: 'separator',
    sense: 'the rule drawn between days or weeks',
    decided: {
      de: 'Trennlinie',
      et: 'Eraldaja',
      it: 'Divisore',
      ja: '区切り線',
      ko: '구분선',
      lt: 'Skirtukas',
      lv: 'Atdalītājs',
      nb: 'Deler',
      pl: 'Dzielnik',
      sk: 'Rozdeľovač',
      sv: 'Avdelare',
    },
    rejected: {},
  },
  {
    name: 'day header',
    sense: "the date row heading each day's events",
    decided: {
      de: 'Tagesüberschrift',
      et: 'Päevapäis',
      it: 'Intestazione del giorno',
      ja: '日付ヘッダー',
      ko: '일자 헤더',
      lt: 'Dienos antraštė',
      lv: 'Dienas galvene',
      nb: 'Dagoverskrift',
      pl: 'Nagłówek dnia',
      sk: 'Hlavička dňa',
      sv: 'Dagrubrik',
    },
    rejected: {},
  },
  {
    name: 'progress bar',
    sense: 'the bar showing how far through an event we are',
    decided: {
      de: 'Fortschrittsbalken',
      et: 'Edenemisriba',
      it: 'Barra di progresso',
      ja: 'プログレスバー',
      ko: '진행률 막대',
      lt: 'Progreso juosta',
      lv: 'Progresa josla',
      nb: 'Fremdriftslinje',
      pl: 'Pasek postępu',
      sk: 'Lišta priebehu',
      sv: 'Förloppsindikator',
    },
    rejected: {
      lt: ['eigos juost'],
    },
  },
  {
    name: 'countdown',
    sense: 'the time remaining until an event starts',
    decided: {
      de: 'Countdown',
      et: 'Loendur',
      it: 'Conto alla rovescia',
      ja: 'カウントダウン',
      ko: '카운트다운',
      lt: 'Atgalinis skaičiavimas',
      lv: 'Atpakaļskaitīšana',
      nb: 'Nedtelling',
      pl: 'Odliczanie',
      sk: 'Odpočítavanie',
      sv: 'Nedräkning',
    },
    rejected: {},
  },
  {
    name: 'week number',
    sense: 'the ISO week number',
    decided: {
      de: 'Wochennummer',
      et: 'Nädalanumber',
      it: 'Numero settimana',
      ja: '週番号',
      ko: '주차 번호',
      lt: 'Savaitės numeris',
      lv: 'Nedēļas numurs',
      nb: 'Ukenummer',
      pl: 'Numer tygodnia',
      sk: 'Číslo týždňa',
      sv: 'Veckonummer',
    },
    rejected: {},
  },
  {
    name: 'today indicator',
    sense: 'the marker showing the current day or time',
    decided: {
      de: 'Heute-Markierung',
      et: 'Tänase päeva indikaator',
      it: 'Indicatore oggi',
      ja: '今日の目印',
      ko: '오늘 표시기',
      lt: 'Šiandienos indikatorius',
      lv: 'Šodienas indikators',
      nb: 'I dag-markør',
      pl: 'Wskaźnik dzisiaj',
      sk: 'Indikátor dneška',
      sv: 'Idag-indikator',
    },
    // Slovak first decided `Identifikátor dneška`, but `identifikátor` is an identifier, an ID,
    // which is all Home Assistant's own Slovak uses it for; `indikátor` is the indicator, as the
    // same file already wrote for the Now indicator.
    rejected: { sk: ['identifikátor'] },
  },
  {
    name: 'color',
    sense: 'any colour setting',
    decided: {
      de: 'Farbe',
      et: 'Värv',
      it: 'Colore',
      ja: '色',
      ko: '색상',
      lt: 'Spalva',
      lv: 'Krāsa',
      nb: 'Farge',
      pl: 'Kolor',
      sk: 'Farba',
      sv: 'Färg',
    },
    rejected: {},
  },
  {
    name: 'icon',
    sense: 'an MDI icon',
    decided: {
      de: 'Symbol',
      et: 'Ikoon',
      it: 'Icona',
      ja: 'アイコン',
      ko: '아이콘',
      lt: 'Piktograma',
      lv: 'Ikona',
      nb: 'Ikon',
      pl: 'Ikona',
      sk: 'Ikona',
      sv: 'Ikon',
    },
    rejected: {},
  },
  {
    name: 'background',
    sense: 'a background colour or fill',
    decided: {
      de: 'Hintergrund',
      et: 'Taust',
      it: 'Sfondo',
      ja: '背景',
      ko: '배경',
      lt: 'Fonas',
      lv: 'Fons',
      nb: 'Bakgrunn',
      pl: 'Tło',
      sk: 'Pozadie',
      sv: 'Bakgrund',
    },
    rejected: {},
  },
  {
    name: 'title',
    sense: "the card's title, and an event's title",
    decided: {
      de: 'Titel',
      et: 'Pealkiri',
      it: 'Titolo',
      ja: 'タイトル',
      ko: '제목',
      lt: 'Pavadinimas',
      lv: 'Virsraksts',
      nb: 'Tittel',
      pl: 'Tytuł',
      sk: 'Názov',
      sv: 'Titel',
    },
    rejected: {},
  },
  {
    name: 'width',
    sense: 'a width in pixels',
    decided: {
      de: 'Breite',
      et: 'Laius',
      it: 'Larghezza',
      ja: '幅',
      ko: '너비',
      lt: 'Plotis',
      lv: 'Platums',
      nb: 'Bredde',
      pl: 'Szerokość',
      sk: 'Šírka',
      sv: 'Bredd',
    },
    rejected: {},
  },
  {
    name: 'height',
    sense: 'a height in pixels',
    decided: {
      de: 'Höhe',
      et: 'Kõrgus',
      it: 'Altezza',
      ja: '高さ',
      ko: '높이',
      lt: 'Aukštis',
      lv: 'Augstums',
      nb: 'Høyde',
      pl: 'Wysokość',
      sk: 'Výška',
      sv: 'Höjd',
    },
    rejected: {},
  },
  {
    name: 'size',
    sense: 'a font size or icon size',
    decided: {
      de: 'Größe',
      et: 'Suurus',
      it: 'Dimensione',
      ja: 'サイズ',
      ko: '크기',
      lt: 'Dydis',
      lv: 'Izmērs',
      nb: 'Størrelse',
      pl: 'Rozmiar',
      sk: 'Veľkosť',
      sv: 'Storlek',
    },
    rejected: {},
  },
  {
    name: 'accent',
    // The heading covers the bar, fill, and text treatment, not just its color selector.
    sense: 'visual emphasis from the event bar, background fill, and text',
    decided: {
      de: 'Akzent',
      et: 'Esiletõstmine',
      it: 'Accento',
      ja: 'アクセント',
      ko: '강조',
      lt: 'Akcentas',
      lv: 'Akcents',
      nb: 'Aksent',
      pl: 'Akcent',
      sk: 'Zvýraznenie',
      sv: 'Framhävning',
    },
    rejected: {
      et: ['rõhuvärv'],
    },
  },
  {
    name: 'font',
    sense: 'the typeface, as it appears in `Font Size`',
    decided: {
      de: 'Schrift',
      et: 'Font',
      it: 'Font',
      ja: '文字',
      ko: '글꼴',
      lt: 'Šriftas',
      lv: 'Fonts',
      nb: 'Skrift',
      pl: 'Czcionka',
      sk: 'Písmo',
      sv: 'Font',
    },
    rejected: {},
  },
  {
    name: 'spacing',
    sense: 'vertical gap between elements',
    decided: {
      de: 'Abstand',
      et: 'Vahe',
      it: 'Spaziatura',
      ja: '間隔',
      lt: 'Tarpas',
      lv: 'Atstarpe',
      nb: 'Avstand',
      pl: 'Odstęp',
      sk: 'Medzera',
      sv: 'Avstånd',
    },
    rejected: {},
  },
  {
    name: 'opacity',
    sense: 'the 0–100 opacity of a fill',
    decided: {
      de: 'Deckkraft',
      et: 'Katvus',
      it: 'Opacità',
      ja: '不透明度',
      ko: '불투명도',
      lt: 'Nepermatomumas',
      lv: 'Necaurspīdīgums',
      nb: 'Opasitet',
      pl: 'Krycie',
      sk: 'Nepriehľadnosť',
      sv: 'Opacitet',
    },
    rejected: {
      et: ['Läbipaistvus'],
      lt: ['Skaidrumas'],
      lv: ['Caurspīdīgums'],
    },
  },
  {
    name: 'show',
    sense: 'the verbs on every toggle',
    decided: {
      de: 'anzeigen',
      et: 'Näita',
      it: 'Mostra',
      ja: '表示',
      ko: '표시',
      lt: 'Rodyti',
      lv: 'Rādīt',
      nb: 'Vis',
      pl: 'Pokaż',
      sk: 'Zobraziť',
      sv: 'Visa',
    },
    rejected: {},
  },
  {
    name: 'hide',
    sense: 'the verbs on every toggle',
    decided: {
      de: 'ausblenden',
      et: 'Peida',
      it: 'Nascondi',
      ja: '非表示',
      ko: '숨기기',
      lt: 'Slėpti',
      lv: 'Paslēpt',
      nb: 'Skjul',
      pl: 'Ukryj',
      sk: 'Skryť',
      sv: 'Dölj',
    },
    rejected: {
      lv: ['Slēpt'],
    },
  },
  {
    name: 'none',
    sense: 'the "no such thing" option',
    decided: {
      de: 'Ohne',
      et: 'Puudub',
      ja: 'なし',
      ko: '없음',
      lt: 'Nėra',
      lv: 'Nav',
      nb: 'Ingen',
      pl: 'Brak',
      sv: 'Ingen',
    },
    rejected: {},
  },
  {
    name: 'default',
    sense: 'the "leave it alone" option',
    decided: {
      de: 'Standard',
      et: 'Vaikimisi',
      it: 'Predefinito',
      ja: 'デフォルト',
      ko: '기본값',
      lt: 'Numatytoji',
      lv: 'Noklusējums',
      nb: 'Standard',
      pl: 'Domyślny',
      sk: 'Predvolené',
      sv: 'Standard',
    },
    rejected: {},
  },
  {
    name: 'top',
    sense: 'vertical alignment options',
    decided: {
      de: 'Oben',
      et: 'Üleval',
      it: 'Alto',
      ja: '上部',
      ko: '상단',
      lt: 'Viršuje',
      lv: 'Augšā',
      nb: 'Topp',
      pl: 'Góra',
      sk: 'Hore',
      sv: 'Topp',
    },
    rejected: {},
  },
  {
    name: 'bottom',
    sense: 'vertical alignment options',
    decided: {
      de: 'Unten',
      et: 'All',
      it: 'Basso',
      ja: '下部',
      ko: '하단',
      lt: 'Apačioje',
      lv: 'Apakšā',
      nb: 'Bunn',
      pl: 'Dół',
      sk: 'Dole',
      sv: 'Botten',
    },
    rejected: {},
  },
  {
    name: 'date',
    sense: 'a calendar date',
    decided: {
      de: 'Datum',
      et: 'Kuupäev',
      it: 'Data',
      ja: '日付',
      ko: '날짜',
      lt: 'Data',
      lv: 'Datums',
      nb: 'Dato',
      pl: 'Data',
      sk: 'Dátum',
      sv: 'Datum',
    },
    rejected: {},
  },
  {
    name: 'week',
    sense: 'a calendar week',
    decided: {
      de: 'Woche',
      et: 'Nädal',
      it: 'Settimana',
      ja: '週',
      ko: '주',
      lt: 'Savaitė',
      lv: 'Nedēļa',
      nb: 'Uke',
      pl: 'Tydzień',
      sk: 'Týždeň',
      sv: 'Vecka',
    },
    rejected: {},
  },
  {
    name: 'weekday',
    sense: 'a day of the week, Monday to Sunday',
    decided: {
      de: 'Wochentag',
      et: 'Nädalapäev',
      it: 'Giorno della settimana',
      ja: '曜日',
      ko: '요일',
      lt: 'Savaitės diena',
      lv: 'Nedēļas diena',
      nb: 'Ukedag',
      pl: 'Dzień tygodnia',
      sk: 'Deň v týždni',
      sv: 'Veckodag',
    },
    // 🚨 These are **stems, not words**, wherever a stem is safe. The matcher anchors at a
    // word start and has no trailing boundary, so a rejected form catches inflections that
    // *append* to it and misses any that change a character inside the stem — `darbdiena`
    // never caught `darbdienās`, and `dzień powszedni` never caught `dni powszednie`. Of
    // the five languages this term rejects, only Swedish was actually protected.
    //
    // The stems stop short of the adjective on purpose. A bare `pracovn` would catch every
    // Slovak inflection and also `pracovný kalendár`, `pracovné stretnutie` and `pracovník`
    // — all legitimate — and a rejected form is a build **error**, so over-matching fails
    // CI on a correct translation. That is strictly worse than the gap it closes, which is
    // why Polish carries one entry per case rather than a bare `powszedn`.
    //
    // For the same reason Slovak carries `pracovných dní` in full rather than shortening
    // `pracovných dň` to `pracovných d`. The two Slovak plurals diverge before the stem
    // ends — genitive `dní` has a plain `n`, locative `dňoch` has `ň` — so one stem cannot
    // reach both, and the `d` that would has `pracovných dokumentov` behind it.
    rejected: {
      // Slovak declines both words, and the plural obliques diverge from each other:
      // `pracovných dní` is a plain `n` where `pracovných dňoch` is `ň`, so no single
      // stem reaches both. Exact phrases rather than a shorter stem, because `pracovn`
      // would also match `pracovný kalendár`, `pracovné stretnutie` and `pracovník` — all
      // legitimate, and a rejected form is a build error.
      sk: [
        'pracovný deň',
        'pracovného dňa',
        'pracovné dni',
        'pracovných dň',
        'pracovných dní',
        'pracovným dňom',
        'pracovnými dňami',
      ],
      it: ['giorno ferial', 'giorni ferial'],
      lv: ['darbdien'],
      sv: ['vardag'],
      pl: ['dzień powszedn', 'dnia powszedn', 'dniu powszedn', 'dni powszedn', 'dniach powszedn'],
    },
  },

  // --- The redesigned editor's own words --------------------------------------
  //
  // Decided when the pages, the calendar list and Split This Calendar were translated, taking Home
  // Assistant's own form where it has one (frontend 20261028.5: `ui.common.add`, `panel.states`,
  // `ui.components.entity.entity-name-picker.mode_custom`). Where Home Assistant's word was already
  // a different label in the same file, the language took another, so two settings stay apart: lt,
  // lv and et Overview (their Home Assistant word is Quick Setup's Review step). Settings For labels
  // the layout picker, whose value is a layout name in the nominative, so the languages that would
  // put it in another case after a preposition use a noun phrase instead ("the layout being
  // edited", "scope of settings").
  {
    name: 'add setting',
    sense: 'the row under a heading that puts a setting not yet shown on the page',
    decided: {
      de: 'Einstellung hinzufügen',
      et: 'Lisa seade',
      it: 'Aggiungi impostazione',
      lt: 'Pridėti nustatymą',
      lv: 'Pievienot iestatījumu',
      nb: 'Legg til innstilling',
      pl: 'Dodaj ustawienie',
      sk: 'Pridať nastavenie',
      sv: 'Lägg till inställning',
    },
    rejected: {},
  },
  {
    // Layouts in Switcher's value while it offers every layout (`summary.all_layouts`).
    name: 'all layouts',
    sense: 'every layout the card has, offered together',
    decided: {
      de: 'Alle Layouts',
      et: 'Kõik paigutused',
      it: 'Tutti i layout',
      ja: 'すべてのレイアウト',
      ko: '모든 레이아웃',
      lt: 'Visi išdėstymai',
      lv: 'Visi izkārtojumi',
      nb: 'Alle layouter',
      pl: 'Wszystkie układy',
      sk: 'Všetky rozloženia',
      sv: 'Alla layouter',
    },
    rejected: {},
  },
  {
    // `layouts.defaults`, which was All Layouts before every layout had a page.
    name: 'layout defaults',
    sense: 'the values every layout starts from, as against one layout’s own',
    decided: {
      de: 'Layout-Standards',
      et: 'Paigutuste vaikeväärtused',
      it: 'Predefiniti dei layout',
      ja: 'レイアウト共通設定',
      lt: 'Išdėstymų numatytosios reikšmės',
      lv: 'Izkārtojumu noklusējumi',
      nb: 'Standardverdier for layouter',
      pl: 'Ustawienia domyślne układów',
      sk: 'Predvolené hodnoty rozložení',
      sv: 'Standardvärden för layouter',
    },
    rejected: {},
  },
  {
    name: 'whole card',
    sense: 'a value stored for the card itself, every layout and calendar included',
    decided: {
      de: 'Ganze Karte',
      et: 'Kogu kaart',
      it: 'Intera scheda',
      ja: 'カード全体',
      ko: '카드 전체',
      lt: 'Visa kortelė',
      lv: 'Visa karte',
      nb: 'Hele kortet',
      pl: 'Cała karta',
      sk: 'Celá karta',
      sv: 'Hela kortet',
    },
    rejected: {},
  },
  {
    name: 'settings for',
    sense: 'the label of the control that picks which layout the pages edit',
    decided: {
      de: 'Einstellungen für',
      et: 'Muudetav paigutus',
      it: 'Impostazioni per',
      lt: 'Redaguojamas išdėstymas',
      lv: 'Iestatījumi izkārtojumam',
      nb: 'Innstillinger for',
      pl: 'Zakres ustawień',
      sk: 'Rozsah nastavení',
      sv: 'Inställningar för',
    },
    rejected: {},
  },
  {
    name: 'show every setting',
    sense: 'the preference that opens pages with every setting that applies as a control',
    decided: {
      de: 'Alle Einstellungen anzeigen',
      et: 'Näita kõiki seadeid',
      it: 'Mostra tutte le impostazioni',
      lt: 'Rodyti visus nustatymus',
      lv: 'Rādīt visus iestatījumus',
      nb: 'Vis alle innstillinger',
      pl: 'Pokaż wszystkie ustawienia',
      sk: 'Zobraziť všetky nastavenia',
      sv: 'Visa alla inställningar',
    },
    rejected: {},
  },
  {
    name: 'stored settings',
    sense: 'the page listing every value the card stores',
    decided: {
      de: 'Gespeicherte Einstellungen',
      et: 'Salvestatud seaded',
      it: 'Impostazioni memorizzate',
      ja: '保存された設定',
      ko: '저장된 설정',
      lt: 'Išsaugoti nustatymai',
      lv: 'Saglabātie iestatījumi',
      nb: 'Lagrede innstillinger',
      pl: 'Zapisane ustawienia',
      sk: 'Uložené nastavenia',
      sv: 'Sparade inställningar',
    },
    rejected: {},
  },
  {
    // Lithuanian splits multi-day events with "Skaidyti" already; this is a different action.
    name: 'split',
    sense: 'turning one calendar entry into two (Split This Calendar), as a verb on its button',
    decided: {
      de: 'Aufteilen',
      et: 'Jaga kaheks',
      it: 'Dividi',
      ja: '分割',
      ko: '분할',
      lt: 'Padalyti',
      lv: 'Sadalīt',
      nb: 'Del opp',
      pl: 'Podziel',
      sk: 'Rozdeliť',
      sv: 'Dela upp',
    },
    rejected: {},
  },
  {
    // Polish follows the word its file already used for a custom value ("Własny") rather than Home
    // Assistant's "Niestandardowy". German used "Eigene" until the v6 review: standing alone, as an
    // option label, the adjective has no noun to agree with, so it takes Home Assistant's
    // "Benutzerdefiniert"; "Eigene Farbe" and the other phrases with a noun keep "Eigene".
    name: 'custom',
    sense: 'a color or value the user types rather than picks',
    decided: {
      de: 'Benutzerdefiniert',
      et: 'Kohandatud',
      it: 'Personalizzato',
      ja: 'カスタム',
      ko: '사용자 지정',
      lt: 'Pasirinktinė',
      lv: 'Pielāgots',
      nb: 'Egendefinert',
      pl: 'Własny',
      sk: 'Vlastné',
      sv: 'Anpassad',
    },
    rejected: {},
  },
  {
    // The word each file already used in `entity.occurrence`, "Entry 1 of 2".
    name: 'entry',
    sense: 'one listing of a calendar on the card, with settings of its own (not an event)',
    decided: {
      de: 'Eintrag',
      et: 'kirje',
      it: 'voce',
      ja: 'エントリ',
      ko: '항목',
      lt: 'įrašas',
      lv: 'ieraksts',
      nb: 'oppføring',
      pl: 'wpis',
      sk: 'položka',
      sv: 'post',
    },
    rejected: {},
  },
  {
    name: 'set',
    sense: 'the state word for a setting that holds a stored value (configured), never the verb',
    decided: {
      de: 'Festgelegt',
      et: 'Määratud',
      it: 'Impostato',
      ja: '設定済み',
      ko: '설정됨',
      lt: 'Nustatyta',
      lv: 'Iestatīts',
      nb: 'Angitt',
      pl: 'Ustawione',
      sk: 'Nastavené',
      sv: 'Inställd',
    },
    rejected: {},
  },
  {
    name: 'overview',
    sense: "the editor's start page, which Back and search return to",
    decided: {
      de: 'Übersicht',
      et: 'Ülevaateleht',
      it: 'Panoramica',
      ja: '概要',
      ko: '개요',
      lt: 'Pradžia',
      lv: 'Kopskats',
      nb: 'Oversikt',
      pl: 'Przegląd',
      sk: 'Prehľad',
      sv: 'Översikt',
    },
    rejected: {},
  },
  {
    // Decided in the v6 review, where the word for a dashboard had to stay apart from the word for
    // Month's day panel ("+N more" opens it), and Swedish and Latvian had drifted from Home
    // Assistant's own word.
    name: 'dashboard',
    sense: 'a Home Assistant dashboard, which holds the card (never Month’s day panel)',
    decided: {
      ja: 'ダッシュボード',
      lt: 'prietaisų skydelis',
      lv: 'infopanelis',
      sv: 'kontrollpanel',
    },
    rejected: {
      lv: ['informācijas panel'],
      sv: ['instrumentpanel'],
    },
  },
  {
    // Decided in the v6 translation review. German had used the word Refresh already holds.
    name: 'upgrade',
    sense: 'the editor converting a card written before v5 to the current configuration',
    decided: {
      de: 'umstellen',
    },
    rejected: {
      de: ['aktualisier'],
    },
  },
  {
    // Decided in the v6 translation review. Estonian follows Home Assistant’s own word for Duplicate.
    name: 'duplicate',
    sense: 'a calendar entry’s Duplicate action, which lists the calendar on the card again',
    decided: {
      et: 'Paljunda',
    },
    rejected: {
      et: ['Dubleeri'],
    },
  },
  {
    // Decided in the v6 translation review. Estonian follows Home Assistant’s word for the long press.
    name: 'hold',
    sense: 'the long-press gesture (Hold Action, Event Hold Action), never keeping something',
    decided: {
      et: 'pikk vajutus',
    },
    rejected: {
      et: ['hoidmi'],
    },
  },
  {
    // Decided in the v6 translation review. Latvian had two words for it, one of which also means restore.
    name: 'refresh',
    sense: 'fetching the calendars’ events again: the toolbar’s Refresh, the refresh interval',
    decided: {
      lv: 'Atsvaidzināt',
    },
    rejected: {
      lv: ['Atjaunošan', 'Atjaunot'],
    },
  },
];
