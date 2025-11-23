# Supabase Setup - Schnellstart

## Schritt-für-Schritt Anleitung

### 1. Supabase-Projekt erstellen

1. Gehe zu https://supabase.com
2. Erstelle ein neues Projekt
3. Warte, bis das Projekt bereit ist (ca. 2-3 Minuten)

### 2. Umgebungsvariablen konfigurieren

1. Öffne dein Supabase-Projekt
2. Gehe zu **Settings** → **API**
3. Kopiere folgende Werte:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `VITE_SUPABASE_SERVICE_ROLE_KEY`

4. Erstelle eine `.env` Datei im Projektroot:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Datenbank-Migration ausführen

**Option A: Über Supabase Dashboard (Empfohlen)**

1. Öffne dein Supabase-Projekt
2. Gehe zu **SQL Editor** (linke Sidebar)
3. Klicke auf **New Query**
4. Öffne die Datei: `supabase/migrations/001_initial_schema.sql`
5. Kopiere den gesamten Inhalt
6. Füge ihn in den SQL Editor ein
7. Klicke auf **Run** (oder Cmd/Ctrl + Enter)
8. Du solltest "Success. No rows returned" sehen

**Option B: Über Supabase CLI**

```bash
supabase db push
```

### 4. Verbindung testen

```bash
npm run test:supabase
```

**Erwartete Ausgabe:**
```
🔍 Testing Supabase Connection...

✅ Environment variables found
📡 Testing basic connection...
✅ Connection successful!

📊 Testing table structure...

✅ athletes - exists and accessible
✅ activities - exists and accessible
✅ training_plans - exists and accessible
✅ sync_logs - exists and accessible

🎉 All tests passed! Your Supabase setup is ready to use.
```

### 5. Tabellen verifizieren

Im Supabase Dashboard:
1. Gehe zu **Table Editor**
2. Du solltest folgende Tabellen sehen:
   - ✅ `athletes`
   - ✅ `activities`
   - ✅ `training_plans`
   - ✅ `sync_logs`

## Was passiert jetzt?

### Automatische Synchronisierung

Sobald ein Benutzer sich mit Strava authentifiziert:

1. **Athlet wird gespeichert**: Beim OAuth-Callback wird der Athlet in der `athletes` Tabelle gespeichert
2. **Automatischer Sync**: Die Anwendung synchronisiert automatisch alle 60 Minuten neue Aktivitäten
3. **Persistente Speicherung**: Alle Aktivitäten werden in der `activities` Tabelle gespeichert
4. **Trainingspläne**: Generierte Pläne werden in der `training_plans` Tabelle gespeichert

### Sync-Protokollierung

Jeder Sync-Vorgang wird in der `sync_logs` Tabelle protokolliert:
- Anzahl synchronisierter Aktivitäten
- Anzahl neuer/aktualisierter Aktivitäten
- Fehler (falls vorhanden)
- Zeitstempel

## Troubleshooting

### ❌ "Table does not exist"

**Lösung:** Migration noch nicht ausgeführt. Führe Schritt 3 aus.

### ❌ "Connection refused"

**Lösung:** 
- Prüfe, ob `VITE_SUPABASE_URL` korrekt ist
- Stelle sicher, dass das Supabase-Projekt aktiv ist (nicht pausiert)

### ❌ "Invalid API key"

**Lösung:**
- Prüfe, ob die Keys korrekt kopiert wurden
- Stelle sicher, dass keine Leerzeichen am Anfang/Ende sind

### ⚠️ Sync funktioniert nicht

**Lösung:**
1. Prüfe die `sync_logs` Tabelle im Supabase Dashboard
2. Stelle sicher, dass der Athlet in der `athletes` Tabelle existiert
3. Prüfe, ob Strava-Tokens gültig sind

## Nächste Schritte

- ✅ Datenbank ist eingerichtet
- ✅ Automatische Synchronisierung ist aktiv
- ✅ Aktivitäten werden persistent gespeichert
- ✅ Trainingspläne werden in der Datenbank gespeichert

Die Anwendung ist jetzt bereit für den produktiven Einsatz!

