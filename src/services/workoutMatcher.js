/**
 * Workout Matching Engine
 *
 * Matches Strava activities to planned workouts using weighted scoring:
 * - Date proximity (40%)
 * - Activity type (30%)
 * - Duration/distance similarity (20%)
 * - Intensity zones (10%)
 *
 * Returns matches with confidence levels:
 * - High (≥0.75): Auto-match
 * - Medium (0.50-0.74): Suggest to user
 * - Low (<0.50): Don't suggest
 */

import { classifyActivity, WORKOUT_TYPES } from './workoutClassifier';

// Confidence thresholds
export const CONFIDENCE_LEVELS = {
  HIGH: 0.75,
  MEDIUM: 0.50,
  LOW: 0.0
};

/**
 * Match a Strava activity to training plan workouts
 *
 * @param {Object} activity - Strava activity
 * @param {Object} plan - Training plan with schedule
 * @param {Object} athleteBaseline - Athlete baseline metrics
 * @returns {Object} Match results
 */
export const matchActivityToPlan = (activity, plan, athleteBaseline) => {
  if (!activity || !plan || !plan.schedule) {
    return { matches: [], bestMatch: null, shouldPromptUser: false };
  }

  // Classify the activity first
  const classification = classifyActivity(activity, athleteBaseline);
  if (!classification) {
    return { matches: [], bestMatch: null, shouldPromptUser: false };
  }

  const activityDate = new Date(activity.start_date_local || activity.start_date);

  // Find candidate workouts (within ±7 days, not already matched)
  const candidates = findCandidateWorkouts(plan, activityDate);

  // Score each candidate
  const matches = candidates
    .map(candidate => {
      const matchScore = calculateMatchScore(
        activity,
        candidate.day,
        candidate.dayDate,
        activityDate,
        classification,
        athleteBaseline
      );

      return {
        ...candidate,
        matchScore: matchScore.score,
        matchReasons: matchScore.reasons,
        confidence: getConfidenceLevel(matchScore.score)
      };
    })
    .filter(match => match.matchScore >= CONFIDENCE_LEVELS.LOW)
    .sort((a, b) => b.matchScore - a.matchScore);

  const bestMatch = matches.length > 0 ? matches[0] : null;
  const shouldPromptUser = bestMatch && bestMatch.confidence === 'medium';

  return {
    matches,
    bestMatch,
    shouldPromptUser,
    activityClassification: classification
  };
};

/**
 * Find candidate workouts for matching
 * Returns workouts within ±7 days that aren't already matched
 *
 * @param {Object} plan - Training plan
 * @param {Date} activityDate - Activity date
 * @returns {Array} Candidate workouts
 */
export const findCandidateWorkouts = (plan, activityDate) => {
  const candidates = [];
  const planStart = new Date(plan.meta?.start_date || plan.start_date);

  plan.schedule.forEach((week, weekIndex) => {
    week.days.forEach((day, dayIndex) => {
      // Skip rest days and already matched workouts
      if (day.is_rest_day || day.matched_activity_id) {
        return;
      }

      // Calculate this day's date
      const dayDate = calculateDayDate(planStart, weekIndex, dayIndex);

      // Check if within ±7 days of activity
      const daysDiff = Math.abs((dayDate - activityDate) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        candidates.push({
          weekIndex,
          dayIndex,
          day,
          dayDate
        });
      }
    });
  });

  return candidates;
};

/**
 * Calculate the actual date for a specific day in the plan
 *
 * @param {Date} planStart - Plan start date
 * @param {number} weekIndex - Week index (0-based)
 * @param {number} dayIndex - Day index (0-6, where 0=Monday or first day of week)
 * @returns {Date} Day date
 */
export const calculateDayDate = (planStart, weekIndex, dayIndex) => {
  const date = new Date(planStart);

  // Week 1 starts on planStart, subsequent weeks are full weeks
  if (weekIndex === 0) {
    // Week 1: Add dayIndex days from start
    date.setDate(date.getDate() + dayIndex);
  } else {
    // Find first Sunday (end of Week 1)
    const firstDayOfWeek = planStart.getDay(); // 0=Sunday, 1=Monday, etc.
    const daysUntilSunday = firstDayOfWeek === 0 ? 0 : 7 - firstDayOfWeek;

    // Add days to first Sunday + (weekIndex-1)*7 full weeks + dayIndex
    date.setDate(planStart.getDate() + daysUntilSunday + 1 + (weekIndex - 1) * 7 + dayIndex);
  }

  return date;
};

/**
 * Calculate overall match score between activity and planned workout
 *
 * @param {Object} activity - Strava activity
 * @param {Object} plannedDay - Planned workout day
 * @param {Date} plannedDate - Planned workout date
 * @param {Date} activityDate - Activity date
 * @param {Object} classification - Activity classification
 * @param {Object} athleteBaseline - Athlete baseline
 * @returns {Object} Match score and reasons
 */
const calculateMatchScore = (
  activity,
  plannedDay,
  plannedDate,
  activityDate,
  classification,
  athleteBaseline
) => {
  const reasons = [];

  // 1. Date Score (40% weight)
  const dateScore = calculateDateScore(activityDate, plannedDate);
  if (dateScore === 1.0) {
    reasons.push('Date match: same day');
  } else if (dateScore >= 0.8) {
    reasons.push(`Date match: ${Math.round(Math.abs((activityDate - plannedDate) / (1000 * 60 * 60 * 24)))} day(s) apart`);
  } else if (dateScore >= 0.4) {
    reasons.push('Date match: same week, different order');
  }

  // 2. Type Score (30% weight)
  const plannedType = inferPlannedWorkoutType(plannedDay.workout_structure);
  const typeScore = calculateTypeScore(classification.type, plannedType);
  if (typeScore === 1.0) {
    reasons.push(`Type match: both ${classification.type.toLowerCase()} workouts`);
  } else if (typeScore >= 0.6) {
    reasons.push(`Type compatible: ${classification.type} matches ${plannedType}`);
  }

  // 3. Duration Score (20% weight)
  const durationScore = calculateDurationScore(activity, plannedDay);
  if (durationScore === 1.0) {
    reasons.push('Duration within 10%');
  } else if (durationScore >= 0.8) {
    reasons.push('Duration within 25%');
  }

  // 4. Intensity Score (10% weight) - if HR data available
  const intensityScore = calculateIntensityScore(activity, plannedDay);
  if (intensityScore > 0.7) {
    reasons.push('Intensity zones match');
  }

  // Calculate weighted total
  const totalScore =
    dateScore * 0.4 +
    typeScore * 0.3 +
    durationScore * 0.2 +
    intensityScore * 0.1;

  return {
    score: totalScore,
    reasons,
    components: {
      dateScore,
      typeScore,
      durationScore,
      intensityScore
    }
  };
};

/**
 * Calculate date proximity score
 *
 * @param {Date} activityDate - Activity date
 * @param {Date} plannedDate - Planned workout date
 * @returns {number} Score 0.0-1.0
 */
export const calculateDateScore = (activityDate, plannedDate) => {
  const daysDiff = Math.abs((activityDate - plannedDate) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0 || daysDiff < 0.5) {
    return 1.0; // Same day
  }
  if (daysDiff <= 1) {
    return 0.8; // ±1 day
  }
  if (daysDiff <= 2) {
    return 0.6; // ±2 days
  }
  if (daysDiff <= 7) {
    // Same week but different order - lower score
    return 0.4 - ((daysDiff - 2) * 0.05);
  }

  return 0.0; // More than 1 week apart
};

/**
 * Calculate activity type match score
 *
 * @param {string} activityType - Classified activity type
 * @param {string} plannedType - Inferred planned workout type
 * @returns {number} Score 0.0-1.0
 */
export const calculateTypeScore = (activityType, plannedType) => {
  // Exact match
  if (activityType === plannedType) {
    return 1.0;
  }

  // Compatible types (partial match)
  const compatibilityMatrix = {
    [WORKOUT_TYPES.INTERVAL]: {
      [WORKOUT_TYPES.TEMPO]: 0.6,
      [WORKOUT_TYPES.RACE]: 0.7
    },
    [WORKOUT_TYPES.TEMPO]: {
      [WORKOUT_TYPES.INTERVAL]: 0.6,
      [WORKOUT_TYPES.RACE]: 0.7,
      [WORKOUT_TYPES.EASY_RUN]: 0.5
    },
    [WORKOUT_TYPES.LONG_RUN]: {
      [WORKOUT_TYPES.EASY_RUN]: 0.5,
      [WORKOUT_TYPES.RACE]: 0.4
    },
    [WORKOUT_TYPES.EASY_RUN]: {
      [WORKOUT_TYPES.RECOVERY]: 0.8,
      [WORKOUT_TYPES.LONG_RUN]: 0.5,
      [WORKOUT_TYPES.TEMPO]: 0.4
    },
    [WORKOUT_TYPES.RECOVERY]: {
      [WORKOUT_TYPES.EASY_RUN]: 0.8
    },
    [WORKOUT_TYPES.RACE]: {
      [WORKOUT_TYPES.TEMPO]: 0.7,
      [WORKOUT_TYPES.INTERVAL]: 0.7
    }
  };

  const compatibility = compatibilityMatrix[activityType]?.[plannedType];
  return compatibility || 0.2; // Base score for any run type
};

/**
 * Calculate duration/distance similarity score
 *
 * @param {Object} activity - Strava activity
 * @param {Object} plannedDay - Planned workout day
 * @returns {number} Score 0.0-1.0
 */
export const calculateDurationScore = (activity, plannedDay) => {
  const plannedDuration = plannedDay.total_estimated_duration_min;
  const actualDuration = (activity.moving_time || 0) / 60; // Convert to minutes

  if (!plannedDuration || plannedDuration === 0) {
    return 0.5; // Neutral if no planned duration
  }

  const variance = Math.abs(actualDuration - plannedDuration) / plannedDuration;

  if (variance < 0.10) {
    return 1.0; // Within 10%
  }
  if (variance < 0.25) {
    return 0.8; // Within 25%
  }
  if (variance < 0.50) {
    return 0.5; // Within 50%
  }

  return 0.2; // More than 50% off
};

/**
 * Calculate intensity zone match score (if HR data available)
 *
 * @param {Object} activity - Strava activity
 * @param {Object} plannedDay - Planned workout day
 * @returns {number} Score 0.0-1.0
 */
export const calculateIntensityScore = (activity, plannedDay) => {
  // If no HR data, return neutral score
  if (!activity.average_heartrate || !activity.has_heartrate) {
    return 0.5;
  }

  // Get predominant intensity zone from planned workout
  const plannedZones = plannedDay.workout_structure
    .map(segment => segment.intensity_zone)
    .filter(zone => zone);

  if (plannedZones.length === 0) {
    return 0.5;
  }

  // Calculate average planned zone
  const avgPlannedZone = plannedZones.reduce((sum, zone) => sum + zone, 0) / plannedZones.length;

  // Estimate activity's zone based on HR (rough approximation)
  // This would need athlete-specific HR zones for accuracy
  // For now, using rough estimates:
  // Zone 1: < 140 bpm
  // Zone 2: 140-155 bpm
  // Zone 3: 155-165 bpm
  // Zone 4: 165-175 bpm
  // Zone 5: > 175 bpm

  let estimatedZone;
  const hr = activity.average_heartrate;
  if (hr < 140) estimatedZone = 1;
  else if (hr < 155) estimatedZone = 2;
  else if (hr < 165) estimatedZone = 3;
  else if (hr < 175) estimatedZone = 4;
  else estimatedZone = 5;

  // Calculate zone difference
  const zoneDiff = Math.abs(estimatedZone - avgPlannedZone);

  if (zoneDiff === 0) return 1.0;
  if (zoneDiff === 1) return 0.7;
  if (zoneDiff === 2) return 0.4;
  return 0.2;
};

/**
 * Infer workout type from planned workout structure
 *
 * @param {Array} workoutStructure - Array of workout segments
 * @returns {string} Inferred workout type
 */
export const inferPlannedWorkoutType = (workoutStructure) => {
  if (!workoutStructure || workoutStructure.length === 0) {
    return WORKOUT_TYPES.EASY_RUN;
  }

  // Check for INTERVAL segments
  const hasIntervalSegment = workoutStructure.some(
    segment => segment.segment_type === 'INTERVAL'
  );
  if (hasIntervalSegment) {
    return WORKOUT_TYPES.INTERVAL;
  }

  // Check predominant intensity zone
  const zones = workoutStructure
    .filter(segment => segment.segment_type === 'MAIN')
    .map(segment => segment.intensity_zone);

  if (zones.length > 0) {
    const avgZone = zones.reduce((sum, zone) => sum + zone, 0) / zones.length;

    // Zone 4+ = Tempo
    if (avgZone >= 4) {
      return WORKOUT_TYPES.TEMPO;
    }
    // Zone 1 = Recovery
    if (avgZone <= 1.5) {
      return WORKOUT_TYPES.RECOVERY;
    }
  }

  // Check total duration
  const totalDuration = workoutStructure.reduce(
    (sum, segment) => sum + (segment.duration_value || 0),
    0
  );

  if (totalDuration > 90) {
    return WORKOUT_TYPES.LONG_RUN;
  }

  // Default to easy run
  return WORKOUT_TYPES.EASY_RUN;
};

/**
 * Get confidence level label from match score
 *
 * @param {number} score - Match score 0.0-1.0
 * @returns {string} Confidence level ('high', 'medium', 'low')
 */
export const getConfidenceLevel = (score) => {
  if (score >= CONFIDENCE_LEVELS.HIGH) {
    return 'high';
  }
  if (score >= CONFIDENCE_LEVELS.MEDIUM) {
    return 'medium';
  }
  return 'low';
};

/**
 * Detect missed workouts in a training plan
 * Returns workouts that are past due and not completed
 *
 * @param {Object} plan - Training plan
 * @param {number} graceDays - Grace period in days (default: 3)
 * @returns {Array} Missed workouts
 */
export const detectMissedWorkouts = (plan, graceDays = 3) => {
  const missedWorkouts = [];
  const today = new Date();
  const planStart = new Date(plan.meta?.start_date || plan.start_date);

  plan.schedule.forEach((week, weekIndex) => {
    week.days.forEach((day, dayIndex) => {
      // Skip rest days and completed workouts
      if (day.is_rest_day || day.is_completed || day.matched_activity_id) {
        return;
      }

      // Calculate this day's date
      const dayDate = calculateDayDate(planStart, weekIndex, dayIndex);

      // Check if past due (with grace period)
      const daysPastDue = (today - dayDate) / (1000 * 60 * 60 * 24);

      if (daysPastDue > graceDays) {
        missedWorkouts.push({
          weekIndex,
          dayIndex,
          day,
          dayDate,
          daysPastDue: Math.floor(daysPastDue)
        });
      }
    });
  });

  return missedWorkouts;
};
