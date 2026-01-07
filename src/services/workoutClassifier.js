/**
 * Workout Classification Engine
 *
 * Classifies Strava activities by workout type using multiple signals:
 * - Pace variation (coefficient of variation)
 * - Relative pace (compared to athlete's average)
 * - Relative distance (compared to longest/average runs)
 * - Duration
 * - Activity name keywords
 *
 * Returns classification with confidence score (0.0-1.0)
 */

// Workout type constants
export const WORKOUT_TYPES = {
  INTERVAL: 'INTERVAL',
  TEMPO: 'TEMPO',
  LONG_RUN: 'LONG_RUN',
  EASY_RUN: 'EASY_RUN',
  RECOVERY: 'RECOVERY',
  RACE: 'RACE'
};

/**
 * Classify a Strava activity by workout type
 *
 * @param {Object} activity - Strava activity object
 * @param {Object} athleteBaseline - Athlete's baseline metrics
 * @param {number} athleteBaseline.avgPace - Average pace in min/km
 * @param {number} athleteBaseline.longestDistance - Longest run in km
 * @param {number} athleteBaseline.avgDistance - Average run distance in km
 * @param {number} athleteBaseline.avgRunsPerWeek - Average runs per week
 * @returns {Object} Classification result
 */
export const classifyActivity = (activity, athleteBaseline) => {
  if (!activity || activity.type?.toLowerCase() !== 'run') {
    return null;
  }

  const signals = {
    paceVariation: calculatePaceVariation(activity),
    relativePace: getRelativePace(activity, athleteBaseline),
    relativeDistance: getRelativeDistance(activity, athleteBaseline),
    duration: (activity.moving_time || 0) / 60, // Convert to minutes
    keywords: extractKeywords(activity.name || '')
  };

  const classification = determineWorkoutType(signals, athleteBaseline);
  const confidence = calculateConfidence(signals, activity);

  return {
    type: classification,
    confidence,
    signals
  };
};

/**
 * Calculate pace variation (coefficient of variation)
 * Requires split data or heart rate variability
 * Returns null if data not available
 *
 * @param {Object} activity - Strava activity
 * @returns {number|null} Coefficient of variation (0-1+)
 */
export const calculatePaceVariation = (activity) => {
  // Check if split data exists in raw_data
  if (!activity.raw_data || !activity.raw_data.splits_metric) {
    return null;
  }

  const splits = activity.raw_data.splits_metric;
  if (!splits || splits.length < 2) {
    return null;
  }

  // Calculate pace for each split (min/km)
  const paces = splits
    .filter(split => split.distance > 0 && split.moving_time > 0)
    .map(split => {
      const kmDistance = split.distance / 1000;
      const minutes = split.moving_time / 60;
      return minutes / kmDistance; // min/km
    });

  if (paces.length < 2) {
    return null;
  }

  // Calculate mean
  const mean = paces.reduce((sum, pace) => sum + pace, 0) / paces.length;

  // Calculate standard deviation
  const squaredDiffs = paces.map(pace => Math.pow(pace - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / paces.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation
  const cv = mean > 0 ? stdDev / mean : 0;

  return cv;
};

/**
 * Get pace relative to athlete's baseline
 * Returns ratio: actual pace / average pace
 * < 1.0 means faster than average
 *
 * @param {Object} activity - Strava activity
 * @param {Object} athleteBaseline - Athlete baseline metrics
 * @returns {number|null} Pace ratio
 */
export const getRelativePace = (activity, athleteBaseline) => {
  if (!activity.average_speed || !athleteBaseline || !athleteBaseline.avgPace) {
    return null;
  }

  // Calculate activity pace in min/km
  const activityPace = 1000 / (activity.average_speed * 60); // min/km

  // Calculate ratio (actual / average)
  // Lower ratio = faster pace = harder workout
  const paceRatio = activityPace / athleteBaseline.avgPace;

  return paceRatio;
};

/**
 * Get distance relative to athlete's baseline
 *
 * @param {Object} activity - Strava activity
 * @param {Object} athleteBaseline - Athlete baseline metrics
 * @returns {Object} Relative distance metrics
 */
export const getRelativeDistance = (activity, athleteBaseline) => {
  if (!activity.distance || !athleteBaseline) {
    return null;
  }

  const distanceKm = activity.distance / 1000;

  const ratios = {
    toLongest: athleteBaseline.longestDistance ? distanceKm / athleteBaseline.longestDistance : null,
    toAverage: athleteBaseline.avgDistance ? distanceKm / athleteBaseline.avgDistance : null
  };

  return ratios;
};

/**
 * Extract workout type keywords from activity name
 *
 * @param {string} activityName - Activity name/title
 * @returns {Object} Detected keywords by type
 */
export const extractKeywords = (activityName) => {
  if (!activityName) {
    return {};
  }

  const nameLower = activityName.toLowerCase();

  const keywords = {
    interval: /interval|repeat|track|400m|800m|1000m|speedwork|speed work|fartlek/i.test(nameLower),
    tempo: /tempo|threshold|lt run|lactate|steady state/i.test(nameLower),
    longRun: /long run|long|marathon|half marathon|20k|25k|30k/i.test(nameLower),
    easy: /easy|recovery|shake.*out|shakeout|base|aerobic/i.test(nameLower),
    race: /race|5k|10k|half|marathon|parkrun|competition/i.test(nameLower)
  };

  return keywords;
};

/**
 * Determine workout type based on signals
 *
 * @param {Object} signals - Classification signals
 * @param {Object} athleteBaseline - Athlete baseline
 * @returns {string} Workout type
 */
const determineWorkoutType = (signals, athleteBaseline) => {
  const { paceVariation, relativePace, relativeDistance, duration, keywords } = signals;

  // Check keywords first (strongest signal)
  if (keywords.race) {
    return WORKOUT_TYPES.RACE;
  }
  if (keywords.interval) {
    return WORKOUT_TYPES.INTERVAL;
  }
  if (keywords.tempo) {
    return WORKOUT_TYPES.TEMPO;
  }
  if (keywords.longRun) {
    return WORKOUT_TYPES.LONG_RUN;
  }

  // Check duration (long runs are > 90 min)
  if (duration && duration > 90) {
    return WORKOUT_TYPES.LONG_RUN;
  }

  // Check pace variation (high = intervals)
  if (paceVariation !== null) {
    if (paceVariation > 0.15) {
      return WORKOUT_TYPES.INTERVAL;
    }
  }

  // Check relative pace
  if (relativePace !== null) {
    if (relativePace < 0.90) {
      // Much faster than average - tempo or race
      return WORKOUT_TYPES.TEMPO;
    }
    if (relativePace > 1.05) {
      // Slower than average - recovery or easy
      if (duration && duration < 25) {
        return WORKOUT_TYPES.RECOVERY;
      }
      return WORKOUT_TYPES.EASY_RUN;
    }
  }

  // Check relative distance
  if (relativeDistance && relativeDistance.toLongest !== null) {
    if (relativeDistance.toLongest > 0.75) {
      // Close to longest run - likely a long run
      return WORKOUT_TYPES.LONG_RUN;
    }
    if (relativeDistance.toAverage !== null && relativeDistance.toAverage < 0.4) {
      // Much shorter than average - recovery
      return WORKOUT_TYPES.RECOVERY;
    }
  }

  // Check "easy" keyword last (weakest signal)
  if (keywords.easy) {
    return WORKOUT_TYPES.EASY_RUN;
  }

  // Default to easy run
  return WORKOUT_TYPES.EASY_RUN;
};

/**
 * Calculate confidence score for classification
 * Based on availability and quality of signals
 *
 * @param {Object} signals - Classification signals
 * @param {Object} activity - Activity object
 * @returns {number} Confidence score (0.0-1.0)
 */
export const calculateConfidence = (signals, activity) => {
  let confidence = 0.5; // Base confidence

  const { paceVariation, relativePace, relativeDistance, keywords } = signals;

  // Boost confidence based on available data
  if (relativePace !== null) {
    confidence += 0.15; // Have pace data
  }

  if (activity.has_heartrate || activity.average_heartrate) {
    confidence += 0.15; // Have HR data
  }

  if (paceVariation !== null) {
    confidence += 0.10; // Have split data for pace variation
  }

  if (activity.average_cadence) {
    confidence += 0.05; // Have cadence data
  }

  // Keyword matches boost confidence significantly
  if (keywords.interval) confidence += 0.20;
  else if (keywords.tempo) confidence += 0.20;
  else if (keywords.longRun) confidence += 0.15;
  else if (keywords.race) confidence += 0.20;
  else if (keywords.easy) confidence += 0.10;

  // Penalize if signals conflict
  // e.g., high pace but long distance
  if (relativePace !== null && relativePace < 0.90 && relativeDistance) {
    if (relativeDistance.toLongest !== null && relativeDistance.toLongest > 0.8) {
      // Fast pace but very long distance - conflicting signals
      confidence -= 0.10;
    }
  }

  // Cap confidence at 1.0
  return Math.min(1.0, confidence);
};
