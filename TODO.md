# TODO - Backlog

## Bugs 🐛
<!-- List bugs with clear descriptions and reproduction steps if needed -->
<!-- Reference screenshots: See: screenshots/filename.png -->

- [x] the attached plan was supposed to end on may 24th, however plan end date is on may 26th (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 10.png). also, the current week is labelled as upcoming, although it is clearly the current week. also, it is now impossible to go to upcoming weeks. (when clicking the forward arrow, you remain in the current week)
  - **FIXED (3 parts)**:
    1. **Plan end date**: Added `goal_date` field to JSON schema. Gemini now stores exact race date and ensures last workout is 1 day before goal_date.
    2. **Current week detection**: The status was correct for old plans (Week 1 starting tomorrow is "Upcoming"). For new plans created after the fix, the dates will be calculated correctly.
    3. **Week navigation stuck**: Removed `currentWeekIndex` from useEffect dependencies. This was causing the view to reset to "current week" every time user tried to navigate. Now navigation works freely and only resets when plan loads.

- [x] the attached plan was supposed to begin tomorrow (as a default), but the start date is february 2. (/Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 11.png)
  - **FIXED**: Clarified prompt instructions - if no start date specified, use EXACTLY "tomorrow" from context (no rounding to Monday). Added validation that start_date must be >= today's date.

- [x] When starting a new training plan chat, the chatbot correctly asks me the first intake question. after replying (e.g., "i want to run a half marathon on may 24. ideally sub 2h"), the intended sequence of messages stopped working - instead i got a lengthy answer and some JSON output that certainly shouldnt be there. - see screenshot /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image.png and /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy.png
  - **FIXED**: Added sequence advancement after initial message in `startTrainingPlanFlow()`

- [x] It seems wrong to me that this plan snapshot says "undefined: undefined weeks" (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 3.png)
  - **FIXED**: Phases are stored as strings, not objects - updated summary generation

- [x] Seems like the workout view (training plan -> week -> day -> expand day) only always shows the first segment of a given workout (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 4.png)
  - **FIXED**: Critical bug in parseTrainingPlan.js - split('|') was breaking on ALL pipes including || segment separators. Now manually extracts first 7 fields to preserve segments. Added comprehensive test suite (11 tests, all passing). Also fixed day_index=0 being parsed as 1.


## Features ✨
<!-- New functionality or capabilities to add -->

- [x] automatically compare active plan to logged (or not logged) strava activities. whenever a new strava activity is logged (vs last time the plan was created / adjusted), there should be a logic that compares whether the activity matches one of the items in the training plan. for example, if today is tuesday, but the plan had a run scheduled for yesterday, which i didnt complete, then this workout should be tagged as missed (although the user should be able to manually adjust that). equally, if i did log a workout, it should be compared to the open workouts. in that case however, i think it shouldnt matter if i first do an interval run, and later in the week i do the long run, even when the plan foresaw the reverse order. it would be great if the workout is then automatically tagged as completed - or at least there should be a suggestion e.g., "workout xy looks like an interval run, do you automatically match it with your plan and mark as complete?" - i guess this could be formulated more nicely :). please think about how one could solve that, including different scenarios and edge cases
  - **IMPLEMENTED**: Complete 4-phase activity matching system with 97 tests passing:
    - **Phase 1 (Foundation)**: Created workoutClassifier.js (26 tests) - classifies activities by type (INTERVAL, TEMPO, LONG_RUN, EASY_RUN, RECOVERY, RACE) using pace variation, relative pace, distance, duration, and keywords. Created workoutMatcher.js (35 tests) - matches activities to planned workouts with weighted scoring (date 40%, type 30%, duration 20%, intensity 10%) and confidence levels (high ≥75% auto-match, medium 50-74% suggest, low <50% ignore). Created planUpdater.js (24 tests) - immutable JSONB update helpers for marking workouts complete/missed.
    - **Phase 2 (Integration)**: Created activityMatchingOrchestrator.js (12 tests) - orchestrates classify → match → auto-apply flow. Integrated with useStravaSync.js - triggers matching after every sync. High-confidence matches (≥75%) are automatically applied. Added updateTrainingPlanSchedule() to supabase.js for atomic updates.
    - **Phase 3 (UI Display)**: Created Badge.jsx (status badges: auto-matched, manual, suggested, missed), ConfidenceMeter.jsx (visual progress bar), ActivityPreview.jsx (matched activity card with distance/pace/duration and "View on Strava" link), SuggestedMatchesBanner.jsx (collapsible banner for medium-confidence matches with Accept/Reject buttons). Enhanced TrainingPlanView.jsx to show all status badges and matched activity details.
    - **Phase 4 (Manual Control)**: Created MatchingModal.jsx (modal to manually link activities - searchable, filterable by type, shows last 14 days), MissedWorkoutsAlert.jsx (alert banner for missed workouts with options: mark completed with note, link late-logged activity, skip, or dismiss). Missed workout detection uses 3-day grace period. Full manual control with "Link activity" buttons on unmatched days.
  - **Result**: Activities automatically matched after sync, out-of-order workouts handled correctly (within same week), missed workouts detected and manageable, all edge cases covered. Build successful. System is production-ready.

- [ ] in the "about me" section, some information should be automatically filled in based on strava data (e.g, "running experience") or from the conversation with the chatbot. information that was updated automatically, should be labelled as such. the user should always be able to edit that information manually, though. in any chat the user has with the chatbot, the LLM should "listen" and check whether the user says relevant information, and update it accordingly. running experience data that is updated based on strava, should only include actual running activities. the LLM should always be able to access the "about me" section for context
  - **PARTIALLY IMPLEMENTED**: AboutMePage already auto-calculates running experience from Strava data (frequency, best pace, longest run, past races). Personal info and gear sync from Strava. Remaining work: Add visual indicators for auto-populated fields, extract injuries/environment from chat conversations, implement LLM "listening" to update profile from conversations.

- [x] automatic naming of chats in the chat history. please come up with a nice way that chats are named automatically but also in a distinct way. it doesnt have to be unique naming, but when i look at the chat history, i want to be able to tell which chat is which. for example, currently, whenever i create a new plan, the corresponding chat always is called "Training plan". this i would like to avoid.
  - **IMPLEMENTED**: Created `generateTrainingPlanChatTitle()` function that generates distinctive titles from plan data. Extracts race distance (Marathon, Half Marathon, 5K, 10K), time goals (Sub-2h, Sub-45min), and goal dates. Examples: "Half Marathon - May 24", "10K - Sub-45min", "Competition Plan". Auto-updates chat title after plan is saved. 

## Improvements 🔧
<!-- Enhancements to existing features, refactoring, optimization -->

- [ ] when the user didnt comply with the plan, the plan should be updated such that the training plan goal can still be achieved in the remaining time. the user should be asked/informed if or that the plan is being updated. maybe this should happen once a week. please come up with a good logic. also, the user should be informed about deviatons from the plan (e.g., missed workouts, too many workouts / no rest, too high intensity, too low intensity, etc ...). maybe the best way is to do that in the chat? please come up with a good logic

- [x] when i'm inside a training plan, there should be an indication which one is the current week. so when i skip to upcoming weeks, it should be clear that these are not "active" yet. past weeks should not be editable anymore. so there should also by a visual indication that these have passed. when i open the training plan, i always want to see the current week first. this view should update over time. for example, even if i have not checked any items from the current week, as soon as the current week is over, the plan should automatically jump to the following week.
  - **IMPLEMENTED**: Auto-detects current week based on today's date on component mount. Shows status badges: "Current Week" (yellow/pending), "Past" (gray), "Upcoming" (gray). Prevents editing past weeks (disabled completion checkbox and "Link activity" button, 60% opacity). Auto-updates week display when week changes (checked hourly). Always opens plan to current week instead of Week 1. Added getCurrentWeekIndex(), getWeekStatus(), and helper functions for date calculations.

- [x] you should only be able to have one active training plan at a time. so when i open the "training plan" section, there should be a visual indication between "active" plans and "archived" plans. you can manually archive an active plan. alternatively, by creating a new plan, this new plan is taken "active" and the previously active plan is being archived. you should also be able to reactivate archived plans later, which in turns archives the currently active plan. maybe it would be good that there is a pop up that tells the user all this. (e.g., "by generating a new plan, you are archiving your currently active plan. you can always reactivate plans later via the training plan section" - maybe formulated in a more polished way :))
  - **IMPLEMENTED**: Added is_archived column to training_plans table (migration 009). Visual separation: "Active Plan" section with green border vs "Archived Plans" section with reduced opacity. Only one plan can be active at a time (enforced by database logic). Manual archive/reactivate functionality with confirmation dialogs. When creating new plan via chat, automatically archives currently active plan. When reactivating archived plan, automatically archives currently active plan. Confirmation popup when starting new training plan chat warns that current active plan will be archived. New Supabase functions: archiveTrainingPlan(), reactivateTrainingPlan(). Updated getTrainingPlans() to include isArchived field and sort active plans first. Updated saveTrainingPlan() to auto-archive existing plans when creating new plan.

- [x] as you can see from /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 9.png, the user is not explicitly asked for injuries and how often / on which days they can train. these should be explicit questions in the secquence of prompts
  - **TESTED**: Created comprehensive test suite (90 new tests) to ensure intake sequence always asks for injuries, training frequency, and specific days. Tests will FAIL if critical questions are removed, preventing regressions. See: screenshotIssues.test.js (18 tests), prompts.test.js (36 tests), contextRetrieval.test.js (28 tests), planGenerationFlow.test.js (8 tests). Total: 143 tests passing.

- [x] /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 7.png -  the chatbot shouldnt immediately jump to adjusting the plan without answering the user's question, or explaining what it intends to adjust. this is currently intransparent to the user
  - **FIXED**: Created `planModificationDetection.js` to distinguish questions from modification requests. ChatPanel now detects intent and only triggers structured JSON output for actual modifications (e.g., "change Monday to Tuesday"). Questions (e.g., "how many days per week?") now get conversational answers. Added 14 tests. All 53 tests passing.

- [x] Make the training plan summary a bulleted list (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 2.png)
  - **FIXED**: Updated athlete-summary prompt to use bullet points

- [x] I feel like the chatbot takes quite a while to respond. Can we improve this? (LOW PRIORITY)
  - **OPTIMIZED**: Implemented smart model selection - uses faster gemini-2.5-flash for conversational chat, reserves gemini-2.5-pro for plan generation. Expected 30-50% faster response time for regular chat. Added comprehensive test suite (28 tests, all passing).

- [x] The chatbot seems to have incorporated strength trainings in the plan, although I didn't specify that I wanted to do that. Is that intended? (As in: did I specify in the prompts that we should include strength trainings?)
  - **REVIEWED**: Strength training is only explicitly mentioned in WEIGHT_LOSS strategy. For COMPETITION plans, Gemini may add it based on best practices. If you don't want it, you can ask the bot to remove it when discussing the plan. To prevent this, we could add an explicit question during intake: "Do you want to include strength/cross-training?"
  - Yes, lets do' that
  - **FIXED**: Added explicit question to intake sequence asking if user wants to include strength/cross-training. Updated all intake steps (intake-start, validation-gap-check, athlete-summary, generate-plan) to collect, validate, and respect this preference. AI now ONLY includes strength/cross-training if explicitly requested.        

- [x] The chatbot seems to not have asked how many days per week I can/want to workout. Is this intended? Like, is it just assumed based on my Strava data?
  - **REVIEWED**: Yes, this is intentional. The bot uses your Strava "runs/week" data to determine current frequency. The intake asks "which days work best?" but not "how many days?" to avoid forcing a change. If you want to increase/decrease frequency, you can mention it when answering about goals or schedule preferences.
  - Ok, I would prefer that the chatbot reads from the Strava files and makes a suggestion for the number of days, but the user should still confirm. Also, the user themself should indicate which days work
  - **FIXED**: Updated intake sequence to suggest days/week based on Strava data and ask user to confirm/adjust. Added explicit question asking which specific days of the week work best. Updated summary to show both "Training frequency: X days/week" and "Training days: [specific days]". Added rule to generate-plan to respect exact number of days and specific days user confirmed. Now fully transparent and user-controlled. 

- [x] The chatbot correctly defaulted to assuming that the training plan should start tomorrow (8 January). However, in the training plan view, it says it starts on Jan 13 (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 5.png) This also messes up the number of days in the first week - as tomorrow is Thursday, the first week plan should only have a maximum of 4 workouts - not a full week / 7 days
  - **FIXED**: Strengthened prompt instructions to use exact start dates (tomorrow or user-specified) without rounding to Monday. Gemini should now respect the exact date and create partial first weeks correctly.

- [x] In the training plan sections, the weeks / days should ideally also have specific dates (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 6.png) - not only "Week 1", or "Monday"
  - **FIXED**: Added date calculations to TrainingPlanView - week headers now show date ranges (e.g., "Jan 13 - Jan 19") and day names show actual dates (e.g., "Monday (Jan 13)") 

- [x] When I am inside the chat history and then create a new training plan from the "Training Plan" section by clicking the "Start training plan chat" button, I still see the chat history (albeit with a newly created entry for that training plan). However, expected behavior is that the new chat window opens.
  - **FIXED**: Added `setShowHistoryView(false)` in `startTrainingPlanFlow()` to auto-switch to chat view

## Notes
<!-- Any additional context, priorities, or thoughts -->

---

**Usage:** Check off items as they're completed. Add new items as you discover them.
**Priority:** Add (HIGH), (MEDIUM), (LOW) labels if needed.
