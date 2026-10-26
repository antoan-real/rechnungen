# Daily Begleiter

Persönliche All-in-one-App als PWA: Gewohnheiten, Rechnungen und (nach und nach) Training, Uni, Rezepte,
Lebensreflektor, News und mehr. Läuft kostenlos auf GitHub Pages, Login und Daten über Firebase (Spark-Tarif).

**Adresse:** https://antoan-real.github.io/rechnungen/

Was in welcher Phase kommt, steht in [ROADMAP.md](ROADMAP.md).

## Aufbau

Reines HTML, CSS und JavaScript (ES-Module), kein Build-Schritt.

```
index.html               App-Hülle (Kopfleiste, Login, Bereich)
css/app.css              gemeinsame Gestaltung inkl. Dark Mode
js/app.js                Anmeldung, Navigation mit „Mehr“-Menü, Router (#bereich)
js/firebase.js           Firebase-Konfiguration
js/core/                 Datenzugriff, Einstellungen, Erinnerungen, Datums- und UI-Helfer
js/modules/registry.js   Liste aller Bereiche und Startseiten-Kacheln
js/modules/*.js          ein Bereich pro Datei bzw. Ordner
sw.js                    Service Worker (Offline-Start)
firestore.rules          Sicherheitsregeln für Firestore
rechnungen-alt.html      frühere Einzelseite des Rechnungstools (Notlösung, gleiche Daten)
```

### Neuen Bereich hinzufügen
1. Datei `js/modules/<name>.js` mit `export function mount(el, ctx) { …; return aufräumen }` anlegen.
2. In `js/modules/registry.js` bei `MODULES` eintragen (ohne `soon`).
3. Optional Startseiten-Kachel: in der Datei `export const widgets = { "<id>": (el, ctx) => aufräumen }`
   und in `WIDGETS` eintragen.
4. Neue Dateien in `sw.js` bei `FILES` ergänzen und `VERSION` erhöhen.

## Daten (Firestore)

Alles liegt pro Nutzer unter `users/{uid}/…`:

| Pfad | Inhalt |
|---|---|
| `invoices/{id}` | Rechnungen (wie bisher, neu: `paid`, `paidAt`) |
| `customers/{id}` | Kunden |
| `settings/profile` | Absender & Bank für Rechnungen |
| `settings/app` | Navigation, Startseite, Design, Name |
| `habits/{id}` | Gewohnheiten inkl. Erinnerungseinstellungen |
| `habitLogs/{YYYY-MM-DD}` | erledigte Gewohnheiten pro Tag (`v: { habitId: Wert }`) |
| `reminderState/{YYYY-MM-DD}` | bereits verschickte Erinnerungen (damit nichts doppelt kommt) |
| `pushTokens/{id}` | Geräte, die Push-Erinnerungen bekommen |
| `workouts/{id}` | Trainings mit ihren Übungen |
| `sessions/{id}` | Trainingseinheiten (Gewicht, Sätze, Wiederholungen je Übung) |
| `uni/plan` | Studienplan: Module, Prüfungsformen, nächste Prüfungen |
| `journal/{YYYY-MM-DD}` | täglicher Check-in: 3× Dankbarkeit, Alltagsmoment, Stimmung |
| `cards/{id}` | Perspektiv-Karten mit Favorit und Notizen („wo ist mir das begegnet“) |
| `complaints/{id}` | „Meckern umdrehen“: Ärger, Frage, Karte, Umdeutung |
| `people/{id}` | Menschen mit Geschichten, Sprüchen, Eigenarten |
| `reflections/{week-2026-W44}` | Rauszoomen (wöchentlich); ältere Monatsrückblicke bleiben erhalten |
| `wheel/{YYYY-MM}` | Lebensrad: Bewertung der Lebensbereiche pro Monat |
| `settings/reflect` | Fragenkatalog, Lebensbereiche, Erinnerungen, Optionen, Geburtsdatum, Karte des Tages |
| `food/prefs` | eigene/geänderte Zutaten (Nährwerte, Preise, Alternativen), gelöschte Zutaten, ausgeblendete Startrezepte |
| `recipes/{id}` | eigene und geänderte Rezepte |
| `transcripts/{id}` | gespeicherte Video-Transkripte mit Titel, Link und Notiz |
| `settings/app.newsSources` | gewählte Nachrichtenquellen |

## Firebase einrichten (einmalig)

1. **Authentication → Anmeldemethode:** „E-Mail/Passwort“ aktiviert.
2. **Authentication → Einstellungen → Autorisierte Domains:** `antoan-real.github.io` eingetragen.
3. **Firestore Database → Regeln:** Inhalt von [`firestore.rules`](firestore.rules) einfügen und **Veröffentlichen**.

### Firestore-Regeln
Erscheint „Keine Berechtigung“ bzw. `permission-denied`, stimmen die Regeln nicht:
- Sie müssen unter **Firestore Database → Regeln** stehen (nicht bei Realtime Database oder Storage).
- Nach dem Einfügen **Veröffentlichen** klicken, dann 1–2 Minuten warten und die App neu laden.
- Im Feld darf nur der Text aus `firestore.rules` stehen (kein altes `allow read, write: if false;`).
- Die Datenbank muss `(default)` heißen.

## Erinnerungen

Erinnerungen für Gewohnheiten werden im Bereich Gewohnheiten pro Gewohnheit eingestellt (Uhrzeit, täglich oder
bestimmte Wochentage, ein/aus). Der Lebensreflektor hat eigene Erinnerungen (Dankbarkeit täglich, Wochen- und
Monatsrückblick) unter „Fragen & Erinnerungen“; sie kommen nur, wenn der Eintrag noch fehlt.

- **App geöffnet:** Die App zeigt die Erinnerung selbst an.
- **App geschlossen:** Der Workflow `.github/workflows/reminders.yml` läuft alle 15 Minuten (kostenlos),
  prüft mit `scripts/send-reminders.js` fällige Erinnerungen und schickt sie per Firebase Cloud Messaging.
  GitHub startet geplante Läufe oft ein paar Minuten später; verpasste Erinnerungen kommen bis 2 Stunden danach noch.

### Einrichtung Push (einmalig)
1. Firebase → Projekteinstellungen → **Cloud Messaging** → Web-Push-Zertifikate → **Schlüsselpaar generieren**.
   Den öffentlichen Schlüssel in `js/firebase.js` bei `VAPID_KEY` eintragen.
2. Firebase → Projekteinstellungen → **Dienstkonten** → **Neuen privaten Schlüssel generieren** (JSON-Datei).
   **Diese Datei ist geheim** – nicht ins Repo legen und nicht weitergeben.
3. GitHub → Repo → Settings → Secrets and variables → Actions → **New repository secret**:
   Name `FIREBASE_SERVICE_ACCOUNT`, Inhalt = kompletter Inhalt der JSON-Datei.
4. In der App: Einstellungen → „Push auch bei geschlossener App“ auf jedem Gerät einschalten.
5. Test: GitHub → Actions → „Erinnerungen senden“ → **Run workflow**.

Hinweis: GitHub pausiert geplante Workflows in öffentlichen Repos nach 60 Tagen ohne Commit. Dann unter Actions
den Workflow wieder aktivieren.

## News

Browser dürfen die RSS-Feeds der Zeitungen nicht direkt abrufen (CORS). Deshalb holt der Workflow
`.github/workflows/news.yml` die Feeds alle 30 Minuten mit `scripts/fetch-news.js` ab und legt `news.json` in den
Branch `news-data` (immer nur ein Commit, das Repo wächst nicht). Die App liest die Datei von
`raw.githubusercontent.com`. Gespeichert werden nur Überschrift, Anreißer aus dem Feed, Link und Zeit.
Quellen und Feed-Adressen stehen in `js/modules/news-core.js`, die Themen-Gruppierung passiert in der App.

## Lokal testen

```bash
python3 -m http.server 8000
```
Dann http://localhost:8000 öffnen (`localhost` muss in Firebase als autorisierte Domain stehen, ist es standardmäßig).

## Neue Version veröffentlichen
Bei Änderungen an App-Dateien in `sw.js` die `VERSION` erhöhen. Nach dem Push zeigt die App „Neue Version verfügbar“.
