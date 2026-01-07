# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SportMe is a React-based training planning application that integrates Strava for workout data and uses Google Gemini AI to generate personalized running training plans. The app features an AI coaching interface that analyzes athlete data and creates adaptive training programs.

## Common Commands

### Development
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

### Database & Testing
```bash
# Test Supabase connection and verify database structure
npm run test:supabase

# Clear database (requires --confirm flag)
npm run clear:db
```

## Environment Configuration

Required environment variables in `.env`:
```env
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs... # Only for migrations

# Strava OAuth
VITE_STRAVA_CLIENT_ID=12345
VITE_STRAVA_CLIENT_SECRET=abc123...

# Gemini AI
VITE_GEMINI_API_KEY=AIzaSy...
```

## Architecture Overview

### Three-Layer Architecture

1. **External Services Layer**
   - Strava API: OAuth authentication and activity data retrieval
   - Gemini API: AI-powered training plan generation with structured output
   - Supabase: PostgreSQL database with Row-Level Security (RLS) for auth and data persistence

2. **Service Layer** (`src/services/`)
   - All external API interactions are encapsulated in service modules
   - Business logic isolated from React components
   - Each service handles a single domain (auth, strava, gemini, supabase, sync)

3. **Component Layer** (`src/pages/`, `src/components/`)
   - React components for UI rendering and user interaction
   - No direct API calls - always goes through service layer
   - Local state management with useState (no Redux/Zustand)

### Key Data Flows

**1. Authentication Flow (Two-Layer)**
```
User → Supabase Auth (email/password) → AuthPage
     → Strava OAuth → CallbackPage → Token Storage (localStorage + Supabase)
     → Protected Routes
```

**2. Activity Sync Flow**
```
useStravaSync Hook (15-min intervals)
  → stravaSync.autoSyncActivities()
  → Strava API (paginated, 200 activities per page)
  → Supabase activities table
  → Available in WorkoutsPage & AI context
```

**3. Training Plan Generation Flow**
```
ChatPanel initiates sequence → getUserContext() retrieves athlete data
  → Gemini API with structured output (JSON Schema)
  → Plan returned as flattened format (pipe-delimited strings)
  → parseFlattenedTrainingPlan() converts to structured objects
  → Saved to Supabase training_plans table
  → Displayed in TrainingPlanView
```

**4. Plan Modification Flow**
```
User selects existing plan → ChatPanel with discussingPlanId
  → Gemini receives original plan + user request
  → Modified plan generated with ADAPTATION_SCENARIOS
  → Updated in Supabase
```

### Database Schema (Supabase PostgreSQL)

**Core Tables:**
- `auth.users` (managed by Supabase): User accounts
- `athletes`: 1:1 with users, stores Strava tokens and profile data
- `activities`: N:1 with athletes, stores all Strava workouts (50+ metrics per activity)
- `training_plans`: N:1 with athletes, stores plan_data (JSONB) with full schedule structure
- `chat_sessions`: N:1 with users, tracks conversation threads
- `chat_messages`: N:1 with sessions, stores individual messages for context retention
- `sync_logs`: N:1 with athletes, logs all sync operations

**Data Isolation:**
- All tables use Row-Level Security (RLS) policies
- Users can only access their own data via `user_id = auth.uid()` or `athlete_id` foreign key
- Service role key bypasses RLS (only use for migrations/admin tasks)

### Flattened Training Plan Format

Gemini has a 4-level JSON nesting limit. To accommodate complex workout structures:

1. **In JSON Schema (Gemini Output):** Days are stored as pipe-delimited strings
   ```
   "day_name|day_index|is_rest_day|is_completed|activity_category|activity_title|duration|SEGMENTS"
   "WARMUP:desc,value unit,Zone N||MAIN:desc,value unit,Zone N||COOLDOWN:desc,..."
   ```

2. **After Parsing (Frontend):** `parseFlattenedTrainingPlan()` converts to structured objects
   ```javascript
   {
     day_name: "Tuesday",
     workout_structure: [
       { segment_type: "WARMUP", description: "...", duration_value: 5, duration_unit: "min", intensity_zone: 1 },
       { segment_type: "MAIN", description: "...", duration_value: 30, duration_unit: "min", intensity_zone: 2 }
     ]
   }
   ```

**Critical Rules:**
- Every run workout MUST have minimum 3 segments: WARMUP||MAIN||COOLDOWN
- Use `||` to separate segments in string format
- Valid segment types: WARMUP, MAIN, INTERVAL, RECOVERY, COOLDOWN
- Valid activity categories: RUN, WALK, STRENGTH, CROSS_TRAIN, REST, MOBILITY

## AI Coaching System

### System Prompts & Strategies

Location: `src/prompts/prompts.js` (650+ lines)

**Core Components:**
1. **BASE_COACH_PROMPT**: Elite running coach persona with injury-aware, evidence-based methodology
2. **PLAN_TYPE_STRATEGIES**: Specific instructions for 4 plan types (BEGINNER, FITNESS, WEIGHT_LOSS, COMPETITION)
3. **ADAPTATION_SCENARIOS**: Handles modifications (MICRO_ADJUSTMENT, REGRESSION, RECALIBRATION)
4. **trainingPlanSequence**: Multi-step intake flow with validation
5. **JSON_SCHEMA_CONSTRAINTS**: Defines allowed values for plan output

### Training Plan Sequence

4-step conversation flow managed by ChatPanel:
1. **intake-start**: Ask goal, timeline, injury history, schedule preferences
2. **validation-gap-check**: Verify completeness, identify missing info
3. **athlete-summary**: Present summary for user approval
4. **generate-plan**: Create full training plan with structured output

**Important:** AI receives REAL Strava data from `getUserContext()` - it can see:
- Weekly averages (km/week, runs/week)
- Recent activities with dates, distances, paces
- Longest run, average pace
- Current training plan (if exists)

The AI is explicitly instructed NOT to ask for information already in Strava data.

### Context Aggregation

`src/services/contextRetrieval.js` builds athlete context by:
1. Retrieving athlete profile (name, weight, location, gear)
2. Fetching active + recent training plans
3. Calculating workout statistics (weekly averages, recent frequency)
4. Formatting recent activities with readable dates
5. Including current date (critical for date calculations)

Context passed to Gemini as "=== SYNCED STRAVA DATA ===" message to enable personalized coaching.

## Gemini API Integration

**Model Fallback Chain** (`src/services/geminiApi.js`):
- Primary: `gemini-2.5-pro` (most capable)
- Fallback 1: `gemini-2.5-flash` (fast)
- Fallback 2: `gemini-2.5-flash-lite` (lightest, highest availability)
- Each model: 2 retries with exponential backoff (2s → 4s → 8s → max 15s)

**Structured Output:**
- Used for plan generation (`generate-plan` and `modify-plan` steps)
- `responseMimeType: "application/json"`
- `responseJsonSchema`: See `getTrainingPlanJsonSchema()` in geminiApi.js
- Returns `{ text: displayText, planData: structuredPlan }` when using structured output

**Error Handling:**
- Retryable errors (503, UNAVAILABLE): Auto-retry with backoff
- Model not found: Try next model in chain
- All models failed: Throw error with details

## Strava Integration

### Token Management

**Storage:**
- `localStorage`: `strava_access_token`, `strava_refresh_token`, `strava_token_expires_at`, `strava_athlete_id`
- Supabase `athletes` table: Same fields persisted for multi-device access

**Refresh Strategy:**
- Tokens expire after ~6 hours
- `isTokenExpired()` checks with 5-minute buffer
- `refreshAccessToken()` proactively refreshes before each API call
- Updates both localStorage (instant) and Supabase (persistent)

### Activity Sync

**Background Sync** (`src/hooks/useStravaSync.js`):
- Runs every 15 minutes after initial 5-second delay
- `autoSyncActivities()` orchestrates sync process
- Pagination: 200 activities per request
- Creates sync_log entry with status (success, error, partial)
- Configurable via `intervalMinutes` and `enabled` props

**Manual Sync:**
```javascript
const { syncNow } = useStravaSync();
syncNow(); // Triggers immediate sync
```

## State Management Patterns

**No Global State Manager** - uses React hooks + local state:
- Component-level state with `useState`
- localStorage for persistence (tokens, preferences)
- Supabase as source of truth for all persistent data
- Services return `{ data, error }` tuples
- Error handling at call site with user-friendly messages

## Date Handling (CRITICAL)

**Rules for AI Prompts:**
- Current date is ALWAYS passed in context as "THE YEAR IS: XXXX"
- start_date in JSON MUST be in format YYYY-MM-DD with CORRECT year
- Week alignment: All weeks end on Sunday
- If start_date is not Monday, Week 1 is partial (starts on start_date, ends Sunday)
- Weeks 2+ are full Monday-Sunday weeks
- Last week ends 1 day before goal date

## Testing & Debugging

### Supabase Connection Test
```bash
npm run test:supabase
```
Expected output:
- Environment variables found
- Connection successful
- All tables (athletes, activities, training_plans, sync_logs) accessible

### Common Issues

**"Table does not exist":**
- Run migration: Copy `supabase/migrations/001_initial_schema.sql` into Supabase SQL Editor

**Sync not working:**
- Check `sync_logs` table in Supabase Dashboard for error messages
- Verify athlete exists in `athletes` table
- Ensure Strava tokens are valid (check token_expires_at)

**Gemini API overloaded:**
- Automatic fallback to flash/lite models
- Wait 2-15 seconds for retry
- Check console for retry logs

## File Locations

**Key Services:**
- `src/services/auth.js`: Supabase authentication
- `src/services/supabase.js`: Database CRUD (1400+ lines)
- `src/services/stravaApi.js`: Strava OAuth & API client
- `src/services/stravaSync.js`: Activity sync orchestration
- `src/services/geminiApi.js`: Gemini API + structured output (650+ lines)
- `src/services/contextRetrieval.js`: Context aggregation for AI

**Key Components:**
- `src/components/ChatPanel.jsx`: Main chat & plan management UI
- `src/components/TrainingPlanView.jsx`: Plan detail display with week/day/segment breakdown
- `src/components/MainLayout.jsx`: Two-column layout with sidebar + content + chat
- `src/pages/AuthPage.jsx`: Login/signup + Strava OAuth connection
- `src/pages/TrainingPlanPage.jsx`: Plan listing & management
- `src/pages/WorkoutsPage.jsx`: Activity listing from Strava

**Utilities & Prompts:**
- `src/prompts/prompts.js`: System prompts, strategies, sequences (650+ lines)
- `src/utils/parseTrainingPlan.js`: Flattened → structured conversion
- `src/utils/jsonExtraction.js`: JSON validation & extraction
- `src/hooks/useStravaSync.js`: Background sync hook

## Code Modification Guidelines

1. **Service Layer Changes:** If adding new external API integration, create new service module in `src/services/`
2. **Database Schema:** Migrations go in `supabase/migrations/` with sequential numbering
3. **AI Prompts:** Modify `src/prompts/prompts.js` for coaching behavior changes
4. **Training Plan Structure:** Changes require updates in both `getTrainingPlanJsonSchema()` and `parseFlattenedTrainingPlan()`
5. **Authentication:** Always use RLS-aware queries (include user context)
6. **Error Messages:** User-friendly messages at UI layer, detailed logs in console
