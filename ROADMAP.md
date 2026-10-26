# Daily Begleiter – Roadmap

Persönliche All-in-one-App (PWA) auf GitHub Pages mit Firebase (Spark-Tarif, ohne laufende Kosten).
Jeder Bereich ist ein eigenes Modul unter `js/modules/`, Daten liegen pro Nutzer unter `users/{uid}/…`.

## Phase 1 – Grundgerüst ✅
- Login, Registrierung, Passwort zurücksetzen (Firebase Authentication)
- Navigation: Tabs oben, „Mehr“-Menü rechts, Reihenfolge und Leiste in den Einstellungen festlegbar
- Einstellungen: Navigation, Dashboard-Kacheln, Design (Hell/Dunkel/System), Name, Benachrichtigungen, Konto
- Dashboard mit ein-/ausblendbaren und sortierbaren Kacheln
- PWA: installierbar, Offline-Start, Firestore-Offline-Cache
- Rechnungstool als Bereich (gleiche Daten wie vorher, zusätzlich Status „bezahlt/offen“)
- Gewohnheiten: anlegen, bearbeiten, löschen, abhaken, Zielmenge, Streaks, Statistik, Erinnerungen

## Phase 2 ✅
- Push-Erinnerungen bei geschlossener App: GitHub Actions alle 15 Minuten + Firebase Cloud Messaging (kostenlos)
- Training (Krafttraining): Trainings, Übungen, Einheiten mit Gewicht/Sätzen/Wiederholungen, Fortschrittsgrafiken,
  Gesamtfortschritt (Volumen pro Woche, Ø Steigerung des Höchstgewichts)
- Uni-Modulübersicht: Raster nach Quartalsblöcken, Prüfungsformen mit Farben, Noten, „Meine nächsten Prüfungen“

## Phase 3 ✅
- Rezepte: Zutaten-Datenbank (57 Zutaten, Nährwerte pro 100 g, geschätzte Preise pro kg, Alternativen),
  12 eiweißreiche Startrezepte, Filter und Sortierung (Eiweiß pro €, pro 100 g …), Schnellerfassung per Textzeilen
- Lebensreflektor: Dankbarkeit täglich, Rauszoomen, Rückblick, Erinnerungen (App + Push)
  → überarbeitet (siehe unten)

## Überarbeitung Lebensreflektor ✅ (zum Test)
- Perspektiv-Karten (30 Startkarten wortgleich), Gedanke des Tages (Favoriten häufiger, Push), Notizen je Karte
- Täglicher Check-in: Dankbarkeit, Alltagsmoment (Zeitstrahl), Stimmung 1–5 (abschaltbar)
- Meckern umdrehen mit Umdeutungsfrage und passender Karte, Übersicht häufiger Ärgernisse
- Menschen und ihre Geschichten, Rauszoomen (wöchentlich), Lebensrad (monatlich, Radar + Verlauf),
  Leben in Wochen, Rückblick mit Jahresrückblick und Suche

## Phase 4 ✅
- News: 11 deutsche Medien per RSS (Abruf über GitHub Actions alle 30 Minuten, kostenlos), Quellen wählbar,
  Gruppierung ähnlicher Meldungen zu Themen, nur Überschrift/Anreißer/Link
- Video zu Text: Plattform-Erkennung, passende kostenlose Transkript-Seiten (Link wird kopiert, bei YouTube
  vorausgefüllt), Speichern mit Titel/Link/Notiz, Verlauf mit Volltextsuche

## Phase 5
- Englisch lernen
- Trading

## Entscheidungen
- Push-Erinnerungen: Variante B (GitHub Actions + FCM, kostenlos, ca. ±15 Minuten) statt Cloud Functions/Blaze.
