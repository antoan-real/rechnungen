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
bestimmte Wochentage, ein/aus). Sie erscheinen als Benachrichtigung, **solange die App geöffnet oder im Hintergrund
aktiv ist**. Wurde eine Erinnerung verpasst, erscheint sie beim nächsten Öffnen.

Echte Push-Nachrichten bei komplett geschlossener App brauchen einen Server, der zur richtigen Zeit sendet:
- **Firebase Cloud Functions** (zeitgesteuert): erfordert den Blaze-Tarif (Kreditkarte, im kleinen Rahmen meist 0 €).
- **Kostenlos:** ein zeitgesteuerter GitHub-Actions-Workflow, der alle 15 Minuten fällige Erinnerungen per
  Firebase Cloud Messaging verschickt (ohne Blaze, Zeitpunkt ca. ±15 Minuten ungenau).
- **Kostenlos und ohne Server:** Erinnerung als wiederkehrender Termin in den Handy-Kalender exportieren.

Noch nicht eingebaut – Entscheidung steht aus.

## Lokal testen

```bash
python3 -m http.server 8000
```
Dann http://localhost:8000 öffnen (`localhost` muss in Firebase als autorisierte Domain stehen, ist es standardmäßig).

## Neue Version veröffentlichen
Bei Änderungen an App-Dateien in `sw.js` die `VERSION` erhöhen. Nach dem Push zeigt die App „Neue Version verfügbar“.
