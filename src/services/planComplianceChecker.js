/**
 * Plan Compliance Checker
 * Analyzes training plan adherence and detects deviations
 */

/**
 * Calculates compliance statistics for a training week
 * @param {Object} week - Week object from training plan schedule
 * @returns {Object} Compliance metrics
 */
export const calculateWeekCompliance = (week) => {
  if (!week || !week.days) {
    return {
      totalWorkouts: 0,
      completedWorkouts: 0,
      missedWorkouts: 0,
      complianceRate: 0,
      missedDays: []
    };
  }

  const workoutDays = week.days.filter(day => !day.is_rest_day);
  const completedDays = workoutDays.filter(day => day.is_completed || day.matched_activity_id);
  const missedDays = workoutDays.filter(day => {
    return day.is_missed || (!day.is_completed && !day.matched_activity_id);
  });

  return {
    totalWorkouts: workoutDays.length,
    completedWorkouts: completedDays.length,
    missedWorkouts: missedDays.length,
    complianceRate: workoutDays.length > 0
      ? (completedDays.length / workoutDays.length) * 100
      : 0,
    missedDays: missedDays.map(day => ({
      dayName: day.day_name,
      dayIndex: day.day_index,
      activityTitle: day.activity_title,
      isMissed: day.is_missed
    }))
  };
};

/**
 * Analyzes compliance for entire plan
 * @param {Object} planData - Complete training plan
 * @param {Date} currentDate - Current date for context
 * @returns {Object} Overall compliance analysis
 */
export const analyzePlanCompliance = (planData, currentDate = new Date()) => {
  if (!planData || !planData.schedule) {
    return {
      overallComplianceRate: 0,
      weeklyCompliance: [],
      trends: [],
      warnings: []
    };
  }

  const today = new Date(currentDate);
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(planData.meta.start_date);

  const weeklyCompliance = planData.schedule.map((week, weekIndex) => {
    const weekRange = getWeekDateRange(weekIndex, startDate, planData.schedule);
    const weekStart = new Date(weekRange.start);
    const weekEnd = new Date(weekRange.end);

    const isPast = today > weekEnd;
    const isCurrent = today >= weekStart && today <= weekEnd;

    return {
      weekNumber: week.week_number,
      weekIndex: weekIndex,
      phase: week.phase_name,
      ...calculateWeekCompliance(week),
      weekStatus: isPast ? 'past' : isCurrent ? 'current' : 'future',
      weekRange: weekRange
    };
  });

  // Calculate overall compliance (only for past and current weeks)
  const relevantWeeks = weeklyCompliance.filter(w => w.weekStatus !== 'future');
  const overallTotal = relevantWeeks.reduce((sum, w) => sum + w.totalWorkouts, 0);
  const overallCompleted = relevantWeeks.reduce((sum, w) => sum + w.completedWorkouts, 0);
  const overallComplianceRate = overallTotal > 0
    ? (overallCompleted / overallTotal) * 100
    : 0;

  // Detect trends (last 3 weeks)
  const trends = detectTrends(weeklyCompliance);

  // Generate warnings
  const warnings = generateWarnings(weeklyCompliance, trends);

  return {
    overallComplianceRate: Math.round(overallComplianceRate),
    weeklyCompliance,
    trends,
    warnings
  };
};

/**
 * Helper to get week date range
 */
const getWeekDateRange = (weekIndex, startDate, schedule) => {
  const planStartDate = new Date(startDate);
  let currentWeekStart = new Date(planStartDate);

  // First week might be partial
  if (weekIndex === 0) {
    const dayOfWeek = planStartDate.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const weekEnd = new Date(planStartDate);
    weekEnd.setDate(weekEnd.getDate() + daysUntilSunday);

    return {
      start: planStartDate.toISOString().split('T')[0],
      end: weekEnd.toISOString().split('T')[0]
    };
  }

  // For subsequent weeks, calculate from plan start
  const firstWeekDayOfWeek = planStartDate.getDay();
  const daysUntilFirstSunday = firstWeekDayOfWeek === 0 ? 0 : 7 - firstWeekDayOfWeek;

  // Week 2+ are full Monday-Sunday weeks
  const weekStart = new Date(planStartDate);
  weekStart.setDate(weekStart.getDate() + daysUntilFirstSunday + 1 + ((weekIndex - 1) * 7));

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0]
  };
};

/**
 * Detect compliance trends from recent weeks
 * @param {Array} weeklyCompliance - Array of week compliance data
 * @returns {Array} Detected trends
 */
const detectTrends = (weeklyCompliance) => {
  const trends = [];

  // Only look at past weeks for trends
  const pastWeeks = weeklyCompliance.filter(w => w.weekStatus === 'past');
  if (pastWeeks.length < 2) {
    return trends; // Not enough data
  }

  // Get last 3 weeks (or fewer if plan is shorter)
  const recentWeeks = pastWeeks.slice(-3);
  const avgCompliance = recentWeeks.reduce((sum, w) => sum + w.complianceRate, 0) / recentWeeks.length;

  if (avgCompliance < 50) {
    trends.push({
      type: 'low_compliance',
      severity: 'high',
      message: 'You\'ve completed less than 50% of your workouts recently',
      weeks: recentWeeks.length,
      avgComplianceRate: Math.round(avgCompliance)
    });
  } else if (avgCompliance < 70) {
    trends.push({
      type: 'moderate_compliance',
      severity: 'medium',
      message: 'You\'ve completed about ' + Math.round(avgCompliance) + '% of your workouts recently',
      weeks: recentWeeks.length,
      avgComplianceRate: Math.round(avgCompliance)
    });
  }

  // Check for improving/declining trends
  if (recentWeeks.length >= 3) {
    const week1 = recentWeeks[0].complianceRate;
    const week2 = recentWeeks[1].complianceRate;
    const week3 = recentWeeks[2].complianceRate;

    if (week3 > week2 && week2 > week1 && week3 - week1 > 20) {
      trends.push({
        type: 'improving',
        severity: 'positive',
        message: 'Great progress! Your consistency is improving',
        weeks: 3
      });
    } else if (week3 < week2 && week2 < week1 && week1 - week3 > 20) {
      trends.push({
        type: 'declining',
        severity: 'medium',
        message: 'Your consistency has been declining recently',
        weeks: 3
      });
    }
  }

  return trends;
};

/**
 * Generate warnings based on compliance data
 * @param {Array} weeklyCompliance - Array of week compliance data
 * @param {Array} trends - Detected trends
 * @returns {Array} Warning messages
 */
const generateWarnings = (weeklyCompliance, trends) => {
  const warnings = [];

  // Check current week
  const currentWeek = weeklyCompliance.find(w => w.weekStatus === 'current');
  if (currentWeek && currentWeek.missedWorkouts >= 2) {
    warnings.push({
      type: 'missed_workouts',
      severity: 'medium',
      weekNumber: currentWeek.weekNumber,
      message: `You've missed ${currentWeek.missedWorkouts} workouts this week`,
      action: 'Consider adjusting your schedule or plan difficulty'
    });
  }

  // Check for chronic low compliance
  const lowComplianceTrend = trends.find(t => t.type === 'low_compliance');
  if (lowComplianceTrend) {
    warnings.push({
      type: 'plan_too_aggressive',
      severity: 'high',
      message: 'Your plan might be too challenging for your current schedule',
      action: 'Consider modifying the plan or adjusting your weekly volume'
    });
  }

  // Check for declining trend
  const decliningTrend = trends.find(t => t.type === 'declining');
  if (decliningTrend) {
    warnings.push({
      type: 'consistency_declining',
      severity: 'medium',
      message: 'Your training consistency has been decreasing',
      action: 'Review what changed and consider taking a recovery week'
    });
  }

  return warnings;
};

/**
 * Generates suggestions for plan adjustments based on compliance
 * @param {Object} complianceAnalysis - Result from analyzePlanCompliance
 * @returns {Array} Adjustment suggestions
 */
export const generatePlanAdjustmentSuggestions = (complianceAnalysis) => {
  const suggestions = [];

  if (complianceAnalysis.overallComplianceRate < 60) {
    suggestions.push({
      type: 'reduce_volume',
      priority: 'high',
      title: 'Reduce weekly volume',
      description: 'Your compliance is low. Consider reducing the number of workouts per week or shortening workout durations.',
      impact: 'Makes the plan more sustainable for your schedule'
    });

    suggestions.push({
      type: 'add_rest_days',
      priority: 'high',
      title: 'Add more rest days',
      description: 'Adding recovery days can help prevent burnout and improve consistency.',
      impact: 'Improves recovery and makes plan more manageable'
    });
  }

  // Check if user is exceeding plan
  if (complianceAnalysis.overallComplianceRate >= 90) {
    suggestions.push({
      type: 'increase_difficulty',
      priority: 'low',
      title: 'Consider progressing the plan',
      description: 'You\'re following the plan very well! You might be ready for increased volume or intensity.',
      impact: 'Accelerates fitness gains'
    });
  }

  // Check for specific patterns in missed workouts
  const missedWorkoutTypes = analyzeMissedWorkoutPatterns(complianceAnalysis.weeklyCompliance);
  if (missedWorkoutTypes.length > 0) {
    missedWorkoutTypes.forEach(pattern => {
      suggestions.push({
        type: 'modify_workout_type',
        priority: 'medium',
        title: `Adjust ${pattern.type} workouts`,
        description: `You frequently miss ${pattern.type} workouts (${pattern.frequency}%). Consider moving them to different days or replacing them.`,
        impact: 'Improves plan compatibility with your schedule'
      });
    });
  }

  return suggestions;
};

/**
 * Analyze patterns in missed workouts
 * @param {Array} weeklyCompliance - Weekly compliance data
 * @returns {Array} Patterns found
 */
const analyzeMissedWorkoutPatterns = (weeklyCompliance) => {
  const patterns = [];

  // This is a simplified version - in a real implementation,
  // you'd track which specific workout types (tempo, long run, etc.) are being missed
  // For now, we'll return empty array as this requires more detailed tracking

  return patterns;
};

/**
 * Check if a specific week needs a check-in
 * @param {Object} week - Week object from compliance analysis
 * @param {Date} currentDate - Current date
 * @returns {boolean} Whether check-in is needed
 */
export const needsWeeklyCheckIn = (week, currentDate = new Date()) => {
  if (!week || !week.weekRange) {
    return false;
  }

  const today = new Date(currentDate);
  today.setHours(0, 0, 0, 0);

  const weekEnd = new Date(week.weekRange.end);
  weekEnd.setHours(0, 0, 0, 0);

  // Check-in needed if:
  // 1. Week has ended (today is after week end)
  // 2. Week status is 'past'
  // 3. Compliance rate is below 100% (meaning there's something to discuss)

  const weekHasEnded = today > weekEnd;
  const hasIssues = week.complianceRate < 100 || week.missedWorkouts > 0;

  return weekHasEnded && hasIssues;
};
