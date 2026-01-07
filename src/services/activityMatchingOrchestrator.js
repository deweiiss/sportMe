/**
 * Activity Matching Orchestrator
 *
 * Coordinates the flow:
 * 1. Classify activities (workoutClassifier)
 * 2. Match to plan workouts (workoutMatcher)
 * 3. Apply high-confidence matches automatically
 * 4. Store medium-confidence matches for user review
 *
 * Triggers:
 * - After Strava sync (new activities)
 * - Manual refresh from TrainingPlanView
 */

import { classifyActivity } from './workoutClassifier';
import { matchActivityToPlan } from './workoutMatcher';
import { updateDayCompletion } from '../utils/planUpdater';
import { getActivitiesFromSupabase, getTrainingPlans, updateTrainingPlanSchedule } from './supabase';
import { getAthleteBaseline } from './contextRetrieval';

/**
 * Get the currently active training plan
 * Active = current date is between start_date and end_date
 *
 * @returns {Promise<Object|null>} Active plan or null
 */
export const getActivePlan = async () => {
  try {
    const result = await getTrainingPlans();

    if (!result.data || result.data.length === 0) {
      return null;
    }

    // Find the first active plan (isActive is already calculated by getTrainingPlans)
    const activePlan = result.data.find(plan => plan.isActive);

    return activePlan || null;
  } catch (error) {
    console.error('Error getting active plan:', error);
    return null;
  }
};

/**
 * Match new activities to the active training plan
 * Orchestrates the full matching flow
 *
 * @param {string} planId - Training plan ID (optional, uses active plan if not provided)
 * @param {string} sinceDate - Only match activities after this date (ISO string)
 * @returns {Promise<Object>} Matching results
 */
export const matchNewActivities = async (planId = null, sinceDate = null) => {
  try {
    console.log(`🔄 Starting activity matching (planId: ${planId || 'auto'}, since: ${sinceDate || 'all'})`);

    // Get the plan to match against
    let plan;
    if (planId) {
      // Fetch specific plan
      const plansResult = await getTrainingPlans();
      if (!plansResult.data) {
        return { success: false, error: 'Failed to fetch training plans' };
      }
      plan = plansResult.data.find(p => p.id === planId);
      if (!plan) {
        return { success: false, error: `Plan ${planId} not found` };
      }
    } else {
      // Get active plan
      plan = await getActivePlan();
      if (!plan) {
        console.log('ℹ️  No active plan found - skipping activity matching');
        return { success: true, matched: 0, suggested: 0, message: 'No active plan' };
      }
    }

    // Ensure plan has proper structure
    if (!plan.planData || !plan.planData.schedule) {
      return { success: false, error: 'Invalid plan structure - missing planData.schedule' };
    }

    // Get athlete baseline metrics for classification
    const athleteBaseline = await getAthleteBaseline();
    if (!athleteBaseline) {
      console.warn('⚠️  No athlete baseline available - classification may be less accurate');
    }

    // Fetch recent activities
    const activitiesResult = await getActivitiesFromSupabase(null, 200, 0);
    if (!activitiesResult.data || activitiesResult.data.length === 0) {
      console.log('ℹ️  No activities found to match');
      return { success: true, matched: 0, suggested: 0, message: 'No activities to match' };
    }

    let activities = activitiesResult.data;

    // Filter by date if sinceDate provided
    if (sinceDate) {
      const sinceDateObj = new Date(sinceDate);
      activities = activities.filter(activity => {
        const activityDate = new Date(activity.start_date_local || activity.start_date);
        return activityDate >= sinceDateObj;
      });
    }

    // Filter by plan date range (only match activities within plan period)
    const planStart = new Date(plan.startDate);
    const planEnd = new Date(plan.endDate);
    activities = activities.filter(activity => {
      const activityDate = new Date(activity.start_date_local || activity.start_date);
      return activityDate >= planStart && activityDate <= planEnd;
    });

    if (activities.length === 0) {
      console.log('ℹ️  No activities in plan date range to match');
      return { success: true, matched: 0, suggested: 0, message: 'No activities in plan date range' };
    }

    console.log(`📊 Processing ${activities.length} activities for matching`);

    // Match each activity
    const allMatches = [];
    for (const activity of activities) {
      // Only match running activities
      if (!activity.type || !activity.type.toLowerCase().includes('run')) {
        continue;
      }

      const matchResult = matchActivityToPlan(activity, plan.planData, athleteBaseline);

      if (matchResult.bestMatch) {
        allMatches.push({
          activity,
          match: matchResult.bestMatch,
          classification: matchResult.activityClassification
        });
      }
    }

    // Separate high-confidence (auto-match) from medium-confidence (suggest)
    const autoMatches = allMatches.filter(m => m.match.confidence === 'high');
    const suggestions = allMatches.filter(m => m.match.confidence === 'medium');

    console.log(`✅ Found ${autoMatches.length} high-confidence matches, ${suggestions.length} suggestions`);

    // Apply high-confidence matches automatically
    let matchedCount = 0;
    if (autoMatches.length > 0) {
      const applyResult = await applyAutoMatches(plan.id, autoMatches);
      if (applyResult.success) {
        matchedCount = applyResult.matchedCount;
      }
    }

    // Store suggestions for later (would need a suggestions table or in-memory store)
    // For now, we'll just return them in the result
    let suggestedCount = suggestions.length;

    return {
      success: true,
      matched: matchedCount,
      suggested: suggestedCount,
      autoMatches,
      suggestions,
      planId: plan.id
    };
  } catch (error) {
    console.error('❌ Error in matchNewActivities:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Apply high-confidence matches to the training plan
 * Updates the plan's schedule with match metadata
 *
 * @param {string} planId - Training plan ID
 * @param {Array} matches - Array of match objects { activity, match, classification }
 * @returns {Promise<Object>} Result
 */
export const applyAutoMatches = async (planId, matches) => {
  try {
    if (!matches || matches.length === 0) {
      return { success: true, matchedCount: 0 };
    }

    console.log(`🔧 Applying ${matches.length} auto-matches to plan ${planId}`);

    // Get the current plan
    const plansResult = await getTrainingPlans();
    if (!plansResult.data) {
      return { success: false, error: 'Failed to fetch plan for update' };
    }

    const plan = plansResult.data.find(p => p.id === planId);
    if (!plan || !plan.planData) {
      return { success: false, error: 'Plan not found' };
    }

    // Update the plan with all matches
    let updatedPlan = { ...plan.planData };

    for (const { activity, match } of matches) {
      const matchData = {
        matched_activity_id: activity.id,
        match_type: 'auto',
        match_confidence: match.matchScore,
        match_score: match.matchScore,
        completion_date: new Date(activity.start_date_local || activity.start_date).toISOString().split('T')[0],
        matched_at: new Date().toISOString()
      };

      // Use planUpdater to update the day
      updatedPlan = updateDayCompletion(
        updatedPlan,
        match.weekIndex,
        match.dayIndex,
        matchData
      );
    }

    // Save updated plan to database
    const updateResult = await updateTrainingPlanSchedule(planId, updatedPlan);

    if (!updateResult.success) {
      return { success: false, error: updateResult.error };
    }

    console.log(`✅ Successfully applied ${matches.length} matches to plan`);

    return { success: true, matchedCount: matches.length };
  } catch (error) {
    console.error('❌ Error applying auto-matches:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Store medium-confidence matches for user review
 * In Phase 3, this will save to a suggestions table or in-memory store
 * For now, suggestions are returned in matchNewActivities result
 *
 * @param {string} planId - Training plan ID
 * @param {Array} suggestions - Array of suggestion objects
 * @returns {Promise<Object>} Result
 */
export const storeSuggestions = async (planId, suggestions) => {
  // TODO: Phase 3 - implement persistent storage for suggestions
  // Could be:
  // 1. Separate 'suggested_matches' table in Supabase
  // 2. JSONB field in training_plans table
  // 3. localStorage for client-side only storage

  // For now, just log and return success
  console.log(`💡 Stored ${suggestions.length} suggestions for plan ${planId}`);
  return { success: true, suggestedCount: suggestions.length };
};

/**
 * Get stored suggestions for a training plan
 * Returns medium-confidence matches awaiting user approval
 *
 * @param {string} planId - Training plan ID
 * @returns {Promise<Array>} Suggestions array
 */
export const getSuggestedMatches = async (planId) => {
  // TODO: Phase 3 - retrieve from persistent storage
  // For now, return empty array
  console.log(`📋 Getting suggestions for plan ${planId}`);
  return [];
};

/**
 * Accept a suggested match
 * Moves a medium-confidence suggestion to confirmed match
 *
 * @param {string} planId - Training plan ID
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @param {Object} activity - Activity to match
 * @returns {Promise<Object>} Result
 */
export const acceptSuggestion = async (planId, weekIndex, dayIndex, activity) => {
  try {
    console.log(`✅ Accepting suggestion for plan ${planId}, week ${weekIndex}, day ${dayIndex}`);

    // Get the current plan
    const plansResult = await getTrainingPlans();
    if (!plansResult.data) {
      return { success: false, error: 'Failed to fetch plan' };
    }

    const plan = plansResult.data.find(p => p.id === planId);
    if (!plan || !plan.planData) {
      return { success: false, error: 'Plan not found' };
    }

    // Create match data for suggested_accepted type
    const matchData = {
      matched_activity_id: activity.id,
      match_type: 'suggested_accepted',
      match_confidence: 0.65, // Medium confidence (0.50-0.74)
      match_score: 0.65,
      completion_date: new Date(activity.start_date_local || activity.start_date).toISOString().split('T')[0],
      matched_at: new Date().toISOString()
    };

    // Update the plan
    const updatedPlan = updateDayCompletion(
      plan.planData,
      weekIndex,
      dayIndex,
      matchData
    );

    // Save to database
    const updateResult = await updateTrainingPlanSchedule(planId, updatedPlan);

    if (!updateResult.success) {
      return { success: false, error: updateResult.error };
    }

    console.log(`✅ Successfully accepted suggestion`);

    return { success: true };
  } catch (error) {
    console.error('❌ Error accepting suggestion:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Reject a suggested match
 * Removes the suggestion from the list
 *
 * @param {string} planId - Training plan ID
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @returns {Promise<Object>} Result
 */
export const rejectSuggestion = async (planId, weekIndex, dayIndex) => {
  // TODO: Phase 3 - remove from suggestions storage
  console.log(`❌ Rejecting suggestion for plan ${planId}, week ${weekIndex}, day ${dayIndex}`);
  return { success: true };
};
