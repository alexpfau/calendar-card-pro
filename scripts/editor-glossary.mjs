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
 * `NOUN_CAPS_LANGUAGES` are the languages whose own orthography capitalises nouns, and
 * which are therefore exempt from the sentence-case check on multi-word labels.
 *
 * Held here rather than in a document because a checked artefact that only prose defines
 * is one the checker cannot be trusted to still be reading: this file is imported, so a
 * rename or a shape change is a load error rather than a silently empty termbase.
 */

/** Languages whose orthography capitalises nouns, exempt from the sentence-case check. */
export const NOUN_CAPS_LANGUAGES = ['de'];

/**
 * Every decided term, with the forms rejected for it.
 *
 * @type {ReadonlyArray<{ name: string, decided: Record<string, string>, rejected: Record<string, string[]> }>}
 */
export const GLOSSARY_TERMS = [
  {
    name: 'time',
    sense: 'the clock time printed on an event row',
    decided: {
      de: 'Uhrzeit',
      et: 'Kellaaeg',
      it: 'Orario',
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
      lt: 'Subjektas',
      lv: 'Vienība',
      nb: 'Entitet',
      pl: 'Encja',
      sk: 'Entita',
      sv: 'Entitet',
    },
    rejected: {},
  },
  {
    name: 'weather',
    sense: 'the weather integration and its forecast',
    decided: {
      de: 'Wetter',
      et: 'Ilm',
      it: 'Meteo',
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
      lt: 'Etiketė',
      lv: 'Etiķete',
      nb: 'Etikett',
      pl: 'Etykieta',
      sk: 'Štítok',
      sv: 'Etikett',
    },
    rejected: {
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
      lt: 'Išdėstymas',
      lv: 'Izkārtojums',
      nb: 'Layout',
      pl: 'Układ',
      sk: 'Rozloženie',
      sv: 'Layout',
    },
    rejected: {},
  },
  {
    name: 'columns',
    sense: 'the vertical divisions of the column layout',
    decided: {
      de: 'Spalten',
      et: 'Veerud',
      it: 'Colonne',
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
      lt: 'Suglaudintas režimas',
      lv: 'Kompaktais režīms',
      nb: 'Kompakt modus',
      pl: 'Tryb kompaktowy',
      sk: 'Kompaktný režim',
      sv: 'Kompakt läge',
    },
    rejected: {},
  },
  {
    name: 'position',
    sense: 'where something sits on the card',
    decided: {
      de: 'Position',
      et: 'Asend',
      it: 'Posizione',
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
      lt: 'Progreso juosta',
      lv: 'Progresa josla',
      nb: 'Fremdriftslinje',
      pl: 'Pasek postępu',
      sk: 'Lišta priebehu',
      sv: 'Förloppsindikator',
    },
    rejected: {},
  },
  {
    name: 'countdown',
    sense: 'the time remaining until an event starts',
    decided: {
      de: 'Countdown',
      et: 'Loendur',
      it: 'Conto alla rovescia',
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
      lt: 'Šiandienos indikatorius',
      lv: 'Šodienas indikators',
      nb: 'I dag-markør',
      pl: 'Wskaźnik dzisiaj',
      sk: 'Identifikátor dneška',
      sv: 'Idag-indikator',
    },
    rejected: {},
  },
  {
    name: 'color',
    sense: 'any colour setting',
    decided: {
      de: 'Farbe',
      et: 'Värv',
      it: 'Colore',
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
    sense: 'the accent colour',
    decided: {
      de: 'Akzentfarbe',
      et: 'Esiletõstmise värv',
      it: 'Accento',
      lt: 'Akcentas',
      lv: 'Akcents',
      nb: 'Aksentfarge',
      pl: 'Akcent',
      sk: 'Zvýraznenie',
      sv: 'Accentfärg',
    },
    rejected: {},
  },
  {
    name: 'font',
    sense: 'the typeface, as it appears in `Font Size`',
    decided: {
      de: 'Schrift',
      et: 'Font',
      it: 'Font',
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
      lt: 'Slėpti',
      lv: 'Paslēpt',
      nb: 'Skjul',
      pl: 'Ukryj',
      sk: 'Skryť',
      sv: 'Göm',
    },
    rejected: {},
  },
  {
    name: 'none',
    sense: 'the "no such thing" option',
    decided: {
      de: 'Ohne',
      et: 'Puudub',
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
      lt: 'Numatytoji',
      lv: 'Noklusējums',
      nb: 'Standard',
      pl: 'Domyślny',
      sk: 'Predvolený',
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
];
