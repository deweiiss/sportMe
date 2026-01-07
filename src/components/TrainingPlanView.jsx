import { useState, useEffect } from 'react';
import Badge from './Badge';
import ActivityPreview from './ActivityPreview';
import SuggestedMatchesBanner from './SuggestedMatchesBanner';
import MatchingModal from './MatchingModal';
import MissedWorkoutsAlert from './MissedWorkoutsAlert';
import ComplianceInsights from './ComplianceInsights';
import { unmatchDay, manuallyMatchDay, markDayCompletedManually, markDayAsMissed } from '../utils/planUpdater';
import { updateTrainingPlanSchedule, getActivitiesFromSupabase } from '../services/supabase';
import { acceptSuggestion, rejectSuggestion } from '../services/activityMatchingOrchestrator';
import { detectMissedWorkouts } from '../services/workoutMatcher';
import { analyzePlanCompliance, generatePlanAdjustmentSuggestions } from '../services/planComplianceChecker';

const TrainingPlanView = ({ planData, planId, onPlanUpdate }) => {
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [planName, setPlanName] = useState(planData?.meta?.plan_name || 'Training Plan');
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [currentWeekIndex, setCurrentWeekIndex] = useState(() => {
    // Calculate the actual current week on mount
    return getCurrentWeekIndex();
  });
  const [matchedActivities, setMatchedActivities] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [missedWorkouts, setMissedWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allActivities, setAllActivities] = useState([]);
  const [showMatchingModal, setShowMatchingModal] = useState(false);
  const [selectedWorkoutForMatching, setSelectedWorkoutForMatching] = useState(null);
  const [matchedActivityIds, setMatchedActivityIds] = useState(new Set());
  const [complianceAnalysis, setComplianceAnalysis] = useState(null);
  const [onRequestPlanAdjustment, setOnRequestPlanAdjustment] = useState(null);

  // Load matched activities and detect missed workouts
  useEffect(() => {
    const loadMatchData = async () => {
      setIsLoading(true);
      try {
        // Fetch all activities to populate matched activity details
        const activitiesResult = await getActivitiesFromSupabase(null, 200, 0);
        if (activitiesResult.data) {
          const activitiesById = {};
          const allActivityIds = new Set();
          const matchedIds = new Set();

          activitiesResult.data.forEach(activity => {
            activitiesById[activity.id] = activity;
            allActivityIds.add(activity.id);
          });

          // Build set of already matched activity IDs
          if (planData && planData.schedule) {
            planData.schedule.forEach(week => {
              week.days.forEach(day => {
                if (day.matched_activity_id) {
                  matchedIds.add(day.matched_activity_id);
                }
              });
            });
          }

          setMatchedActivities(activitiesById);
          setAllActivities(activitiesResult.data);
          setMatchedActivityIds(matchedIds);
        }

        // Detect missed workouts (3-day grace period)
        if (planData) {
          const missed = detectMissedWorkouts(planData, 3);
          setMissedWorkouts(missed);
        }

        // Calculate compliance analysis
        if (planData) {
          const compliance = analyzePlanCompliance(planData);
          setComplianceAnalysis(compliance);

          // Log suggestions if compliance is low
          if (compliance.overallComplianceRate < 70) {
            const suggestions = generatePlanAdjustmentSuggestions(compliance);
            console.log('Plan adjustment suggestions:', suggestions);
          }
        }

        // TODO Phase 4: Load suggestions from persistent storage
        // const suggestions = await getSuggestedMatches(planId);
        // setSuggestions(suggestions);
      } catch (error) {
        console.error('Error loading match data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMatchData();
  }, [planData, planId]);

  // Auto-update current week when week changes (check daily)
  useEffect(() => {
    const checkCurrentWeek = () => {
      const calculatedCurrentWeek = getCurrentWeekIndex();
      if (calculatedCurrentWeek !== currentWeekIndex) {
        // Week has changed, auto-jump to current week
        setCurrentWeekIndex(calculatedCurrentWeek);
      }
    };

    // Check immediately on mount
    checkCurrentWeek();

    // Check every hour for week changes
    const interval = setInterval(checkCurrentWeek, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(interval);
  }, [currentWeekIndex, planData]);

  if (!planData || !planData.schedule || planData.schedule.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-md">
        <p className="text-gray-600 dark:text-gray-300 text-center">
          No plan data available
        </p>
      </div>
    );
  }

  const meta = planData.meta || {};
  const periodization = planData.periodization_overview || {};
  const schedule = planData.schedule || [];
  const currentWeek = schedule[currentWeekIndex] || schedule[0];

  // Calculate which week is the current week based on today's date
  function getCurrentWeekIndex() {
    if (!planData || !planData.meta || !planData.meta.start_date || !planData.schedule) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(planData.meta.start_date);
    startDate.setHours(0, 0, 0, 0);

    // If plan hasn't started yet, show week 0
    if (today < startDate) {
      return 0;
    }

    // Check each week to see if today falls within its date range
    for (let i = 0; i < planData.schedule.length; i++) {
      const weekRange = getWeekDateRangeForIndex(i, startDate, planData.schedule);
      if (weekRange) {
        const weekStart = new Date(weekRange.start);
        const weekEnd = new Date(weekRange.end);
        weekStart.setHours(0, 0, 0, 0);
        weekEnd.setHours(23, 59, 59, 999);

        if (today >= weekStart && today <= weekEnd) {
          return i;
        }
      }
    }

    // If we're past all weeks, show the last week
    return planData.schedule.length - 1;
  }

  // Helper to get week date range (used in getCurrentWeekIndex)
  function getWeekDateRangeForIndex(weekIndex, startDate, schedule) {
    if (!startDate || !schedule[weekIndex]) return null;

    let weekStart;
    if (weekIndex === 0) {
      weekStart = new Date(startDate);
    } else {
      const prevWeekEnd = getWeekEndForIndex(weekIndex - 1, startDate, schedule);
      if (prevWeekEnd) {
        weekStart = new Date(prevWeekEnd);
        weekStart.setDate(weekStart.getDate() + 1);
      } else {
        weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + (weekIndex * 7));
      }
    }

    const weekEnd = getWeekEndForIndex(weekIndex, startDate, schedule);
    return { start: weekStart, end: weekEnd };
  }

  function getWeekEndForIndex(weekIndex, startDate, schedule) {
    if (!startDate || !schedule[weekIndex]) return null;

    if (weekIndex === 0) {
      const dayOfWeek = startDate.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const weekEnd = new Date(startDate);
      weekEnd.setDate(startDate.getDate() + daysUntilSunday);
      return weekEnd;
    } else {
      const prevWeekEnd = getWeekEndForIndex(weekIndex - 1, startDate, schedule);
      if (prevWeekEnd) {
        const weekEnd = new Date(prevWeekEnd);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return weekEnd;
      }
    }

    return null;
  }

  // Determine week status relative to current date
  const getWeekStatus = (weekIndex) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekRange = getWeekDateRange(weekIndex);
    if (!weekRange) return 'future';

    const weekStart = new Date(weekRange.start);
    const weekEnd = new Date(weekRange.end);
    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(23, 59, 59, 999);

    if (today < weekStart) return 'future';
    if (today > weekEnd) return 'past';
    return 'current';
  };

  // Calculate week date range
  const getWeekDateRange = (weekIndex) => {
    if (!meta.start_date || !schedule[weekIndex]) return null;

    const startDate = new Date(meta.start_date);
    const week = schedule[weekIndex];

    // Calculate the start of this week
    // Week 1 starts on start_date, subsequent weeks start on the Monday after previous week's Sunday
    let weekStart;
    if (weekIndex === 0) {
      weekStart = new Date(startDate);
    } else {
      // Find the end of the previous week (Sunday) and add 1 day to get Monday
      const prevWeekEnd = getWeekEnd(weekIndex - 1);
      if (prevWeekEnd) {
        weekStart = new Date(prevWeekEnd);
        weekStart.setDate(weekStart.getDate() + 1);
      } else {
        // Fallback: calculate based on week index
        weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + (weekIndex * 7));
      }
    }

    // Calculate the end of this week (Sunday)
    const weekEnd = getWeekEnd(weekIndex);

    return { start: weekStart, end: weekEnd };
  };

  // Helper to get the end date (Sunday) of a week
  const getWeekEnd = (weekIndex) => {
    if (!meta.start_date || !schedule[weekIndex]) return null;

    const startDate = new Date(meta.start_date);
    const week = schedule[weekIndex];

    if (weekIndex === 0) {
      // Week 1: find the next Sunday from start_date
      const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const weekEnd = new Date(startDate);
      weekEnd.setDate(startDate.getDate() + daysUntilSunday);
      return weekEnd;
    } else {
      // Subsequent weeks: end on Sunday, 7 days after Monday
      const prevWeekEnd = getWeekEnd(weekIndex - 1);
      if (prevWeekEnd) {
        const weekEnd = new Date(prevWeekEnd);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return weekEnd;
      }
    }

    return null;
  };

  // Get day's actual date
  const getDayDate = (weekIndex, dayIndex) => {
    const weekDateRange = getWeekDateRange(weekIndex);
    if (!weekDateRange) return null;

    const dayDate = new Date(weekDateRange.start);
    dayDate.setDate(dayDate.getDate() + dayIndex);
    return dayDate;
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format week range
  const formatWeekRange = (weekIndex) => {
    const range = getWeekDateRange(weekIndex);
    if (!range) return '';
    return `${formatDate(range.start)} - ${formatDate(range.end)}`;
  };

  const handlePlanNameSave = () => {
    setEditingPlanName(false);
    if (onPlanUpdate) {
      onPlanUpdate({
        ...planData,
        meta: {
          ...meta,
          plan_name: planName
        }
      });
    }
  };

  const toggleDayExpanded = (weekIndex, dayIndex) => {
    const key = `${weekIndex}-${dayIndex}`;
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleWorkoutCompleted = (weekIndex, dayIndex) => {
    if (!onPlanUpdate) return;

    // Prevent editing past weeks
    if (getWeekStatus(weekIndex) === 'past') {
      return;
    }

    const updatedSchedule = schedule.map((week, wIdx) => {
      if (wIdx !== weekIndex) return week;
      return {
        ...week,
        days: week.days.map((day, dIdx) => {
          if (dIdx !== dayIndex) return day;
          return {
            ...day,
            is_completed: !day.is_completed
          };
        })
      };
    });

    onPlanUpdate({
      ...planData,
      schedule: updatedSchedule
    });
  };

  const getPlanTypeLabel = (planType) => {
    const labels = {
      BEGINNER: 'Beginner',
      FITNESS: 'Fitness',
      WEIGHT_LOSS: 'Weight Loss',
      COMPETITION: 'Competition'
    };
    return labels[planType] || planType;
  };

  const getAthleteLevelLabel = (level) => {
    const labels = {
      Novice: 'Novice',
      Intermediate: 'Intermediate',
      Advanced: 'Advanced'
    };
    return labels[level] || level;
  };

  const getActivityCategoryLabel = (category) => {
    const labels = {
      RUN: 'Run',
      WALK: 'Walk',
      STRENGTH: 'Strength',
      CROSS_TRAIN: 'Cross Train',
      REST: 'Rest',
      MOBILITY: 'Mobility'
    };
    return labels[category] || category;
  };

  const getSegmentTypeLabel = (segmentType) => {
    const labels = {
      WARMUP: 'Warmup',
      MAIN: 'Main',
      INTERVAL: 'Interval',
      RECOVERY: 'Recovery',
      COOLDOWN: 'Cooldown'
    };
    return labels[segmentType] || segmentType;
  };

  // Unmatch a day
  const handleUnmatch = async (weekIndex, dayIndex) => {
    if (!planId || !onPlanUpdate) return;

    try {
      const updatedPlan = unmatchDay(planData, weekIndex, dayIndex);
      const result = await updateTrainingPlanSchedule(planId, updatedPlan);

      if (result.success) {
        onPlanUpdate(updatedPlan);
      } else {
        console.error('Failed to unmatch:', result.error);
      }
    } catch (error) {
      console.error('Error unmatching:', error);
    }
  };

  // Accept a suggestion
  const handleAcceptSuggestion = async (suggestion) => {
    if (!planId) return;

    try {
      const result = await acceptSuggestion(
        planId,
        suggestion.match.weekIndex,
        suggestion.match.dayIndex,
        suggestion.activity
      );

      if (result.success) {
        // Remove from suggestions
        setSuggestions(prev => prev.filter(s =>
          s.match.weekIndex !== suggestion.match.weekIndex ||
          s.match.dayIndex !== suggestion.match.dayIndex
        ));

        // Reload plan data
        if (onPlanUpdate) {
          // Trigger parent to reload
          window.location.reload(); // Simple approach for now
        }
      }
    } catch (error) {
      console.error('Error accepting suggestion:', error);
    }
  };

  // Reject a suggestion
  const handleRejectSuggestion = async (suggestion) => {
    if (!planId) return;

    try {
      await rejectSuggestion(
        planId,
        suggestion.match.weekIndex,
        suggestion.match.dayIndex
      );

      // Remove from suggestions
      setSuggestions(prev => prev.filter(s =>
        s.match.weekIndex !== suggestion.match.weekIndex ||
        s.match.dayIndex !== suggestion.match.dayIndex
      ));
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
    }
  };

  // Get status badge for a day
  const getDayStatusBadge = (day, weekIndex, dayIndex) => {
    // Check if missed
    const isMissed = missedWorkouts.some(
      m => m.weekIndex === weekIndex && m.dayIndex === dayIndex
    );

    if (day.is_missed || isMissed) {
      return <Badge variant="missed">Missed</Badge>;
    }

    if (day.matched_activity_id) {
      const variant = day.match_type === 'auto' ? 'auto-matched' :
                      day.match_type === 'suggested_accepted' ? 'suggested_accepted' :
                      'manual';
      return <Badge variant={variant}>{day.match_type === 'auto' ? 'Auto-matched' : day.match_type === 'suggested_accepted' ? 'Suggested' : 'Manual'}</Badge>;
    }

    if (day.is_completed && !day.matched_activity_id) {
      return <Badge variant="manual">Completed</Badge>;
    }

    return null;
  };

  // Open matching modal for a workout
  const handleOpenMatchingModal = (weekIndex, dayIndex, day) => {
    setSelectedWorkoutForMatching({ weekIndex, dayIndex, day });
    setShowMatchingModal(true);
  };

  // Manually match an activity to a workout
  const handleManualMatch = async (activity) => {
    if (!planId || !selectedWorkoutForMatching || !onPlanUpdate) return;

    try {
      const { weekIndex, dayIndex, day } = selectedWorkoutForMatching;
      const activityDate = new Date(activity.start_date_local || activity.start_date)
        .toISOString()
        .split('T')[0];

      const updatedPlan = manuallyMatchDay(
        planData,
        weekIndex,
        dayIndex,
        activity.id,
        activityDate
      );

      const result = await updateTrainingPlanSchedule(planId, updatedPlan);

      if (result.success) {
        onPlanUpdate(updatedPlan);
        setShowMatchingModal(false);
        setSelectedWorkoutForMatching(null);
      } else {
        console.error('Failed to match:', result.error);
      }
    } catch (error) {
      console.error('Error manually matching:', error);
    }
  };

  // Mark missed workout as completed
  const handleMarkMissedCompleted = async (workout, note) => {
    if (!planId || !onPlanUpdate) return;

    try {
      const updatedPlan = markDayCompletedManually(
        planData,
        workout.weekIndex,
        workout.dayIndex,
        note
      );

      const result = await updateTrainingPlanSchedule(planId, updatedPlan);

      if (result.success) {
        onPlanUpdate(updatedPlan);
        // Remove from missed workouts
        setMissedWorkouts(prev =>
          prev.filter(w =>
            w.weekIndex !== workout.weekIndex || w.dayIndex !== workout.dayIndex
          )
        );
      }
    } catch (error) {
      console.error('Error marking missed workout as completed:', error);
    }
  };

  // Skip a missed workout
  const handleSkipMissedWorkout = async (workout, reason) => {
    if (!planId || !onPlanUpdate) return;

    try {
      const updatedPlan = markDayAsMissed(
        planData,
        workout.weekIndex,
        workout.dayIndex,
        reason
      );

      const result = await updateTrainingPlanSchedule(planId, updatedPlan);

      if (result.success) {
        onPlanUpdate(updatedPlan);
        // Remove from missed workouts (it's now marked, so won't show as alert)
        setMissedWorkouts(prev =>
          prev.filter(w =>
            w.weekIndex !== workout.weekIndex || w.dayIndex !== workout.dayIndex
          )
        );
      }
    } catch (error) {
      console.error('Error skipping missed workout:', error);
    }
  };

  // Link activity to missed workout
  const handleLinkToMissedWorkout = (workout) => {
    setSelectedWorkoutForMatching({
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      day: workout.day
    });
    setShowMatchingModal(true);
  };

  // Dismiss missed workouts alert
  const handleDismissMissedWorkouts = () => {
    setMissedWorkouts([]);
  };

  // Handle request for plan adjustment
  const handleRequestPlanAdjustment = () => {
    if (!complianceAnalysis) return;

    const suggestions = generatePlanAdjustmentSuggestions(complianceAnalysis);

    // For now, show suggestions in console and alert
    // TODO: Integrate with chat panel to start adjustment conversation
    console.log('Plan adjustment requested. Suggestions:', suggestions);

    const message = `Based on your ${complianceAnalysis.overallComplianceRate}% compliance rate, here are some suggestions:\n\n${
      suggestions.map((s, i) => `${i + 1}. ${s.title}\n   ${s.description}`).join('\n\n')
    }\n\nConsider discussing these adjustments with the AI coach in the chat.`;

    alert(message);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
      {/* Plan Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          {editingPlanName ? (
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              onBlur={handlePlanNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePlanNameSave();
                if (e.key === 'Escape') {
                  setPlanName(meta.plan_name || 'Training Plan');
                  setEditingPlanName(false);
                }
              }}
              className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-yale-blue-500 focus:outline-none"
              autoFocus
            />
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white m-0">
                {planName}
              </h2>
              <button
                onClick={() => setEditingPlanName(true)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                aria-label="Edit plan name"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-3 py-1 rounded-full bg-yale-blue-100 dark:bg-yale-blue-900 text-yale-blue-700 dark:text-yale-blue-200 text-sm font-medium">
            {getPlanTypeLabel(meta.plan_type)}
          </span>
          <span className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-sm font-medium">
            {getAthleteLevelLabel(meta.athlete_level)}
          </span>
          <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 text-sm font-medium">
            {meta.total_duration_weeks} weeks
          </span>
        </div>

        {/* Goal and Phases */}
        <div className="space-y-2 text-gray-700 dark:text-gray-300">
          <p className="m-0">
            <span className="font-semibold">Your goal:</span> {periodization.macrocycle_goal || 'N/A'}
          </p>
          <p className="m-0">
            <span className="font-semibold">Phases:</span> {periodization.phases?.join(', ') || 'N/A'}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

      {/* Compliance Insights */}
      {complianceAnalysis && complianceAnalysis.overallComplianceRate > 0 && (
        <div className="mb-6">
          <ComplianceInsights
            complianceAnalysis={complianceAnalysis}
            onRequestAdjustment={handleRequestPlanAdjustment}
          />
        </div>
      )}

      {/* Missed Workouts Alert */}
      {missedWorkouts.length > 0 && (
        <MissedWorkoutsAlert
          missedWorkouts={missedWorkouts}
          onMarkCompleted={handleMarkMissedCompleted}
          onSkipWorkout={handleSkipMissedWorkout}
          onLinkActivity={handleLinkToMissedWorkout}
          onDismiss={handleDismissMissedWorkouts}
        />
      )}

      {/* Suggested Matches Banner */}
      {suggestions.length > 0 && (
        <SuggestedMatchesBanner
          suggestions={suggestions}
          onAccept={handleAcceptSuggestion}
          onReject={handleRejectSuggestion}
        />
      )}

      {/* Weekly View */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
              Week {currentWeek.week_number} ({currentWeek.phase_name})
              {formatWeekRange(currentWeekIndex) && (
                <span className="text-base font-normal text-gray-600 dark:text-gray-400 ml-2">
                  {formatWeekRange(currentWeekIndex)}
                </span>
              )}
            </h3>
            {getWeekStatus(currentWeekIndex) === 'current' && (
              <Badge variant="pending">Current Week</Badge>
            )}
            {getWeekStatus(currentWeekIndex) === 'past' && (
              <Badge variant="unmatched">Past</Badge>
            )}
            {getWeekStatus(currentWeekIndex) === 'future' && (
              <Badge variant="unmatched">Upcoming</Badge>
            )}
          </div>
          {schedule.length > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentWeekIndex(Math.max(0, currentWeekIndex - 1))}
                disabled={currentWeekIndex === 0}
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>
              <button
                onClick={() => setCurrentWeekIndex(Math.min(schedule.length - 1, currentWeekIndex + 1))}
                disabled={currentWeekIndex === schedule.length - 1}
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {currentWeek.weekly_focus || 'No focus specified'}
        </p>

        {/* Day Cards */}
        <div className="space-y-3">
          {currentWeek.days?.map((day, dayIndex) => {
            const dayKey = `${currentWeekIndex}-${dayIndex}`;
            const isExpanded = expandedDays.has(dayKey);

            // Rest Day
            if (day.is_rest_day) {
              const dayDate = getDayDate(currentWeekIndex, dayIndex);
              return (
                <div
                  key={dayIndex}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900"
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {day.day_name}
                    {dayDate && (
                      <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
                        ({formatDate(dayDate)})
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400 mt-1">
                    Rest day
                  </div>
                </div>
              );
            }

            // Active Day
            const dayDate = getDayDate(currentWeekIndex, dayIndex);
            const statusBadge = getDayStatusBadge(day, currentWeekIndex, dayIndex);
            const matchedActivity = day.matched_activity_id ? matchedActivities[day.matched_activity_id] : null;
            const weekStatus = getWeekStatus(currentWeekIndex);
            const isPastWeek = weekStatus === 'past';

            return (
              <div
                key={dayIndex}
                className={`rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow ${
                  isPastWeek ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {day.day_name}
                        {dayDate && (
                          <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
                            ({formatDate(dayDate)})
                          </span>
                        )}
                      </div>
                      {statusBadge}
                    </div>
                    <div className="text-gray-700 dark:text-gray-300">
                      {getActivityCategoryLabel(day.activity_category)}: {day.activity_title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {day.total_estimated_duration_min} min
                    </div>

                    {/* Show matched activity preview */}
                    {matchedActivity && (
                      <ActivityPreview
                        activity={matchedActivity}
                        matchType={day.match_type}
                        matchConfidence={day.match_confidence}
                        onUnmatch={() => handleUnmatch(currentWeekIndex, dayIndex)}
                        showUnmatchButton={!isPastWeek}
                      />
                    )}

                    {/* Link activity button (for unmatched days, not past weeks) */}
                    {!day.matched_activity_id && !day.is_completed && !isPastWeek && (
                      <button
                        onClick={() => handleOpenMatchingModal(currentWeekIndex, dayIndex, day)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Link activity
                      </button>
                    )}

                    {/* Expanded Workout Segments */}
                    {isExpanded && day.workout_structure && day.workout_structure.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                        {day.workout_structure.map((segment, segIndex) => (
                          <div
                            key={segIndex}
                            className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900"
                          >
                            <div className="font-medium text-gray-900 dark:text-white text-sm">
                              {getSegmentTypeLabel(segment.segment_type)}: {segment.description}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {segment.duration_value} {segment.duration_unit}. Zone {segment.intensity_zone}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => toggleWorkoutCompleted(currentWeekIndex, dayIndex)}
                      disabled={isPastWeek}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        day.is_completed
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-yale-blue-500'
                      } ${isPastWeek ? 'cursor-not-allowed opacity-50' : ''}`}
                      aria-label={isPastWeek ? 'Past week (cannot edit)' : (day.is_completed ? 'Mark as incomplete' : 'Mark as complete')}
                    >
                      {day.is_completed && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    {day.workout_structure && day.workout_structure.length > 0 && (
                      <button
                        onClick={() => toggleDayExpanded(currentWeekIndex, dayIndex)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <svg
                          className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Matching Modal */}
      <MatchingModal
        isOpen={showMatchingModal}
        onClose={() => {
          setShowMatchingModal(false);
          setSelectedWorkoutForMatching(null);
        }}
        onSelectActivity={handleManualMatch}
        activities={allActivities}
        matchedActivityIds={matchedActivityIds}
        workoutDetails={selectedWorkoutForMatching?.day}
      />
    </div>
  );
};

export default TrainingPlanView;

