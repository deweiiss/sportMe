/**
 * Training Plan Updater Utility
 *
 * Helper functions for updating training plan JSONB data structure.
 * All functions return a NEW plan object (immutable updates).
 * Preserves meta, periodization_overview, and other schedule data.
 */

/**
 * Update a day with match/completion data
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index (0-based)
 * @param {number} dayIndex - Day index (0-based)
 * @param {Object} matchData - Match metadata
 * @param {number} matchData.matched_activity_id - Strava activity ID
 * @param {string} matchData.match_type - 'auto' | 'manual' | 'suggested_accepted'
 * @param {number} matchData.match_confidence - 0.0-1.0
 * @param {number} matchData.match_score - Raw score
 * @param {string} matchData.completion_date - ISO date (YYYY-MM-DD)
 * @returns {Object} Updated plan
 */
export const updateDayCompletion = (plan, weekIndex, dayIndex, matchData) => {
  if (!plan || !plan.schedule) {
    throw new Error('Invalid plan structure');
  }

  if (!plan.schedule[weekIndex]) {
    throw new Error(`Week ${weekIndex} does not exist in plan`);
  }

  if (!plan.schedule[weekIndex].days[dayIndex]) {
    throw new Error(`Day ${dayIndex} does not exist in week ${weekIndex}`);
  }

  // Deep clone the plan to avoid mutations
  const updatedPlan = JSON.parse(JSON.stringify(plan));

  // Update the specific day
  const day = updatedPlan.schedule[weekIndex].days[dayIndex];

  // Set completion fields
  day.is_completed = true;
  day.matched_activity_id = matchData.matched_activity_id || null;
  day.matched_at = matchData.matched_at !== undefined ? matchData.matched_at : new Date().toISOString();
  day.match_type = matchData.match_type !== undefined ? matchData.match_type : 'manual';
  day.match_confidence = matchData.match_confidence !== undefined ? matchData.match_confidence : null;
  day.match_score = matchData.match_score !== undefined ? matchData.match_score : null;
  day.completion_date = matchData.completion_date || new Date().toISOString().split('T')[0];
  day.completion_type = matchData.matched_activity_id ? 'matched' : 'manual_checkbox';
  day.is_missed = false; // Clear missed flag if it was set
  day.user_notes = matchData.user_notes !== undefined ? matchData.user_notes : (day.user_notes || null);

  return updatedPlan;
};

/**
 * Mark a day as missed
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @param {string} reason - Optional reason (e.g., 'injury/illness', 'forgot', 'weather')
 * @returns {Object} Updated plan
 */
export const markDayAsMissed = (plan, weekIndex, dayIndex, reason = null) => {
  if (!plan || !plan.schedule) {
    throw new Error('Invalid plan structure');
  }

  if (!plan.schedule[weekIndex]) {
    throw new Error(`Week ${weekIndex} does not exist in plan`);
  }

  if (!plan.schedule[weekIndex].days[dayIndex]) {
    throw new Error(`Day ${dayIndex} does not exist in week ${weekIndex}`);
  }

  // Deep clone the plan
  const updatedPlan = JSON.parse(JSON.stringify(plan));

  // Update the specific day
  const day = updatedPlan.schedule[weekIndex].days[dayIndex];

  day.is_missed = true;
  day.missed_reason = reason;
  day.is_completed = false; // Can't be both missed and completed

  return updatedPlan;
};

/**
 * Unmatch a day (clear all matching fields)
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @returns {Object} Updated plan
 */
export const unmatchDay = (plan, weekIndex, dayIndex) => {
  if (!plan || !plan.schedule) {
    throw new Error('Invalid plan structure');
  }

  if (!plan.schedule[weekIndex]) {
    throw new Error(`Week ${weekIndex} does not exist in plan`);
  }

  if (!plan.schedule[weekIndex].days[dayIndex]) {
    throw new Error(`Day ${dayIndex} does not exist in week ${weekIndex}`);
  }

  // Deep clone the plan
  const updatedPlan = JSON.parse(JSON.stringify(plan));

  // Update the specific day
  const day = updatedPlan.schedule[weekIndex].days[dayIndex];

  // Clear all matching fields
  day.matched_activity_id = null;
  day.matched_at = null;
  day.match_type = null;
  day.match_confidence = null;
  day.match_score = null;
  day.completion_date = null;
  day.completion_type = null;
  day.is_completed = false;
  day.is_missed = false;

  return updatedPlan;
};

/**
 * Manually match a day to an activity
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @param {number} activityId - Strava activity ID
 * @param {string} completionDate - ISO date (YYYY-MM-DD)
 * @returns {Object} Updated plan
 */
export const manuallyMatchDay = (plan, weekIndex, dayIndex, activityId, completionDate = null) => {
  const matchData = {
    matched_activity_id: activityId,
    match_type: 'manual',
    match_confidence: 1.0, // Manual matches have 100% confidence
    match_score: 1.0,
    completion_date: completionDate || new Date().toISOString().split('T')[0],
    matched_at: new Date().toISOString()
  };

  return updateDayCompletion(plan, weekIndex, dayIndex, matchData);
};

/**
 * Mark a day as completed manually (no activity match)
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @param {string} note - Optional user note
 * @returns {Object} Updated plan
 */
export const markDayCompletedManually = (plan, weekIndex, dayIndex, note = null) => {
  const matchData = {
    matched_activity_id: null,
    match_type: null,
    match_confidence: null,
    match_score: null,
    completion_date: new Date().toISOString().split('T')[0],
    matched_at: null,
    user_notes: note
  };

  return updateDayCompletion(plan, weekIndex, dayIndex, matchData);
};

/**
 * Add a note to a day
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @param {string} note - User note
 * @returns {Object} Updated plan
 */
export const addNoteToDay = (plan, weekIndex, dayIndex, note) => {
  if (!plan || !plan.schedule) {
    throw new Error('Invalid plan structure');
  }

  if (!plan.schedule[weekIndex]) {
    throw new Error(`Week ${weekIndex} does not exist in plan`);
  }

  if (!plan.schedule[weekIndex].days[dayIndex]) {
    throw new Error(`Day ${dayIndex} does not exist in week ${weekIndex}`);
  }

  // Deep clone the plan
  const updatedPlan = JSON.parse(JSON.stringify(plan));

  // Update the specific day
  const day = updatedPlan.schedule[weekIndex].days[dayIndex];
  day.user_notes = note;

  return updatedPlan;
};

/**
 * Clear missed status from a day
 *
 * @param {Object} plan - Training plan
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @returns {Object} Updated plan
 */
export const clearMissedStatus = (plan, weekIndex, dayIndex) => {
  if (!plan || !plan.schedule) {
    throw new Error('Invalid plan structure');
  }

  if (!plan.schedule[weekIndex]) {
    throw new Error(`Week ${weekIndex} does not exist in plan`);
  }

  if (!plan.schedule[weekIndex].days[dayIndex]) {
    throw new Error(`Day ${dayIndex} does not exist in week ${weekIndex}`);
  }

  // Deep clone the plan
  const updatedPlan = JSON.parse(JSON.stringify(plan));

  // Update the specific day
  const day = updatedPlan.schedule[weekIndex].days[dayIndex];
  day.is_missed = false;
  day.missed_reason = null;

  return updatedPlan;
};

/**
 * Batch update multiple days
 * Useful for applying multiple matches at once
 *
 * @param {Object} plan - Training plan
 * @param {Array} updates - Array of update objects
 * @param {number} updates[].weekIndex - Week index
 * @param {number} updates[].dayIndex - Day index
 * @param {Object} updates[].matchData - Match data
 * @returns {Object} Updated plan
 */
export const batchUpdateDays = (plan, updates) => {
  // Deep clone the plan first
  let updatedPlan = JSON.parse(JSON.stringify(plan));

  for (const update of updates) {
    updatedPlan = updateDayCompletion(
      updatedPlan,
      update.weekIndex,
      update.dayIndex,
      update.matchData
    );
  }

  return updatedPlan;
};
