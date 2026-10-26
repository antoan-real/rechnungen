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

## Phase 2 ✅ (zum Test)
- Push-Erinnerungen bei geschlossener App: GitHub Actions alle 15 Minuten + Firebase Cloud Messaging (kostenlos)
- Training (Krafttraining): Trainings, Übungen, Einheiten mit Gewicht/Sätzen/Wiederholungen, Fortschrittsgrafiken,
  Gesamtfortschritt (Volumen pro Woche, Ø Steigerung des Höchstgewichts)
- Uni-Modulübersicht: Raster nach Quartalsblöcken, Prüfungsformen mit Farben, Noten, „Meine nächsten Prüfungen“

## Phase 3
- Rezepte: Zutaten-Datenbank mit Nährwerten und Preisen, Alternativen, Filter „Eiweiß pro €“, Schnellerfassung
- Lebensreflektor: Dankbarkeit täglich, Rauszoomen-Fragen, Rückblick

## Phase 4
- News: RSS-Feeds deutscher Medien, Gruppierung nach Thema
- Video zu Text: Transkript-Seiten pro Plattform, Verlauf mit Suche

## Phase 5
- Englisch lernen
- Trading

## Entscheidungen
- Push-Erinnerungen: Variante B (GitHub Actions + FCM, kostenlos, ca. ±15 Minuten) statt Cloud Functions/Blaze.
