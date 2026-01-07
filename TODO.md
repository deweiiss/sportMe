# TODO - Backlog

## Bugs 🐛
<!-- List bugs with clear descriptions and reproduction steps if needed -->
<!-- Reference screenshots: See: screenshots/filename.png -->

- [x] When starting a new training plan chat, the chatbot correctly asks me the first intake question. after replying (e.g., "i want to run a half marathon on may 24. ideally sub 2h"), the intended sequence of messages stopped working - instead i got a lengthy answer and some JSON output that certainly shouldnt be there. - see screenshot /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image.png and /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy.png
  - **FIXED**: Added sequence advancement after initial message in `startTrainingPlanFlow()`

- [x] It seems wrong to me that this plan snapshot says "undefined: undefined weeks" (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 3.png)
  - **FIXED**: Phases are stored as strings, not objects - updated summary generation

- [x] Seems like the workout view (training plan -> week -> day -> expand day) only always shows the first segment of a given workout (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 4.png)
  - **FIXED**: Critical bug in parseTrainingPlan.js - split('|') was breaking on ALL pipes including || segment separators. Now manually extracts first 7 fields to preserve segments. Added comprehensive test suite (11 tests, all passing). Also fixed day_index=0 being parsed as 1.


## Features ✨
<!-- New functionality or capabilities to add -->

- [ ]

## Improvements 🔧
<!-- Enhancements to existing features, refactoring, optimization -->

- [x] /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 7.png -  the chatbot shouldnt immediately jump to adjusting the plan without answering the user's question, or explaining what it intends to adjust. this is currently intransparent to the user
  - **FIXED**: Created `planModificationDetection.js` to distinguish questions from modification requests. ChatPanel now detects intent and only triggers structured JSON output for actual modifications (e.g., "change Monday to Tuesday"). Questions (e.g., "how many days per week?") now get conversational answers. Added 14 tests. All 53 tests passing.

- [x] Make the training plan summary a bulleted list (see /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 2.png)
  - **FIXED**: Updated athlete-summary prompt to use bullet points

- [x] I feel like the chatbot takes quite a while to respond. Can we improve this? (LOW PRIORITY)
  - **OPTIMIZED**: Implemented smart model selection - uses faster gemini-2.5-flash for conversational chat, reserves gemini-2.5-pro for plan generation. Expected 30-50% faster response time for regular chat. Added comprehensive test suite (28 tests, all passing).

- [x] The chatbot seems to have incorporated strength trainings in the plan, although I didn't specify that I wanted to do that. Is that intended? (As in: did I specify in the prompts that we should include strength trainings?)
  - **REVIEWED**: Strength training is only explicitly mentioned in WEIGHT_LOSS strategy. For COMPETITION plans, Gemini may add it based on best practices. If you don't want it, you can ask the bot to remove it when discussing the plan. To prevent this, we could add an explicit question during intake: "Do you want to include strength/cross-training?"
  - Yes, lets do' that

- [ ] The chatbot seems to not have asked how many days per week I can/want to workout. Is this intended? Like, is it just assumed based on my Strava data?
  - **REVIEWED**: Yes, this is intentional. The bot uses your Strava "runs/week" data to determine current frequency. The intake asks "which days work best?" but not "how many days?" to avoid forcing a change. If you want to increase/decrease frequency, you can mention it when answering about goals or schedule preferences. 

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
