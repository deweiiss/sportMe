# Supabase Integration für SportMe

Diese Anleitung beschreibt die Supabase-Integration für die SportMe-Anwendung.

## Übersicht

Die Anwendung verwendet Supabase als persistente Datenbank für:
- **Athleten-Daten**: Strava-Benutzerinformationen und Tokens
- **Aktivitäten**: Alle Strava-Aktivitäten werden in der Datenbank gespeichert
- **Trainingspläne**: Generierte Trainingspläne werden persistent gespeichert
- **Sync-Logs**: Protokollierung aller Synchronisierungsvorgänge

## Schnellstart

### 1. Supabase-Projekt erstellen

1. Gehe zu https://supabase.com und erstelle ein neues Projekt
2. Notiere dir die Projekt-URL und API-Keys

### 2. Umgebungsvariablen setzen

Erstelle eine `.env` Datei im Projektroot:

```env
VITE_SUPABASE_URL=https://dein-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=dein_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=dein_service_role_key
```

### 3. Datenbank-Migration ausführen

Öffne die Supabase SQL Editor und führe das Migration-Script aus:
- Datei: `supabase/migrations/001_initial_schema.sql`
- Kopiere den gesamten Inhalt in den SQL Editor
- Führe das Script aus

### 4. Verbindung testen

```bash
npm run test:supabase
```

## Datenbankstruktur

### Tabellen

#### `athletes`
Speichert Strava-Benutzerinformationen und Tokens.

**Wichtige Felder:**
- `strava_id`: Eindeutige Strava-Athleten-ID
- `access_token`, `refresh_token`: Strava API Tokens
- `token_expires_at`: Ablaufzeitpunkt des Tokens

#### `activities`
Speichert alle Strava-Aktivitäten.

**Wichtige Felder:**
- `strava_id`: Eindeutige Strava-Aktivitäts-ID
- `athlete_id`: Referenz zum Athleten
- `start_date`, `start_date_local`: Startzeitpunkt
- `distance`, `moving_time`, `total_elevation_gain`: Aktivitätsdaten
- `raw_data`: Vollständige Strava-Response als JSONB

#### `training_plans`
Speichert generierte Trainingspläne.

**Wichtige Felder:**
- `plan_type`: Typ des Plans ('ftp', 'base', 'vo2max')
- `start_date`, `end_date`: Zeitraum des Plans
- `week1` bis `week4`: Wochen-Daten als JSONB

#### `sync_logs`
Protokolliert alle Synchronisierungsvorgänge.

**Wichtige Felder:**
- `sync_type`: Art der Synchronisierung
- `status`: Status ('success', 'error', 'partial')
- `activities_synced`, `activities_created`, `activities_updated`: Statistiken

## Automatische Synchronisierung

Die Anwendung synchronisiert automatisch neue Strava-Aktivitäten im Hintergrund.

### Funktionsweise

1. **Initial Sync**: Beim ersten Laden der DataPage wird nach 5 Sekunden ein Sync durchgeführt
2. **Periodischer Sync**: Alle 60 Minuten werden neue Aktivitäten synchronisiert
3. **Intelligente Syncs**: Es werden nur neue/geänderte Aktivitäten synchronisiert

### Konfiguration

Der Auto-Sync kann in `DataPage.jsx` konfiguriert werden:

```javascript
useStravaSync({
  intervalMinutes: 60,  // Sync-Intervall in Minuten
  enabled: true,        // Auto-Sync aktivieren/deaktivieren
  onSyncComplete: (result) => {
    // Callback bei erfolgreichem Sync
  },
  onSyncError: (error) => {
    // Callback bei Sync-Fehler
  }
});
```

### Manueller Sync

Ein manueller Sync kann über den Hook durchgeführt werden:

```javascript
const { syncNow } = useStravaSync();
// ...
syncNow(); // Führt sofort einen Sync durch
```

## API-Funktionen

### Supabase Service (`src/services/supabase.js`)

- `testConnection()`: Testet die Verbindung zu Supabase
- `getOrCreateAthlete(stravaId, athleteData)`: Holt oder erstellt einen Athleten
- `updateAthleteTokens(stravaId, tokenData)`: Aktualisiert Athleten-Tokens
- `getAthlete(stravaId)`: Holt einen Athleten

### Strava Sync Service (`src/services/stravaSync.js`)

- `syncActivities(athleteId, stravaId, options)`: Synchronisiert Aktivitäten
- `getLastSyncTime(athleteId)`: Gibt die letzte Sync-Zeit zurück
- `shouldSync(athleteId, hoursThreshold)`: Prüft, ob ein Sync nötig ist
- `autoSyncActivities(stravaId)`: Führt einen automatischen Sync durch

## Sicherheit

### Row Level Security (RLS)

Die Datenbank verwendet RLS-Policies, um den Datenzugriff zu kontrollieren. Standardmäßig sind alle Policies auf `true` gesetzt (für Entwicklung). Für Produktion sollten diese angepasst werden.

### Service Role Key

Der Service Role Key umgeht RLS und sollte **niemals** im Client-Code verwendet werden. Er ist nur für:
- Migration-Scripts
- Server-seitige Operationen
- Admin-Tasks

### Best Practices

1. **Nie** den Service Role Key im Frontend-Code verwenden
2. **Immer** den Anon Key für Client-Operationen verwenden
3. RLS-Policies für Produktion anpassen
4. Regelmäßig API-Keys rotieren

## Troubleshooting

### "Table does not exist" Fehler

- Stelle sicher, dass die Migration ausgeführt wurde
- Prüfe im Supabase Dashboard, ob die Tabellen existieren

### Sync funktioniert nicht

- Prüfe, ob der Athlet in der Datenbank existiert
- Prüfe die Sync-Logs in der `sync_logs` Tabelle
- Stelle sicher, dass Strava-Tokens gültig sind

### Verbindungsfehler

- Prüfe die Umgebungsvariablen
- Stelle sicher, dass das Supabase-Projekt aktiv ist
- Prüfe die Netzwerkverbindung

## Nächste Schritte

1. **Auth-Integration**: Supabase Auth für Benutzerauthentifizierung einrichten
2. **RLS-Policies**: Anpassen für Multi-User-Szenarien
3. **Backups**: Regelmäßige Datenbank-Backups einrichten
4. **Monitoring**: Sync-Logs überwachen und analysieren

