import { useState } from 'react';

const TrainingPlanView = ({ planData, onPlanUpdate }) => {
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [planName, setPlanName] = useState(planData?.meta?.plan_name || 'Training Plan');
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

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

      {/* Weekly View */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white m-0">
            Week {currentWeek.week_number} ({currentWeek.phase_name})
          </h3>
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
              return (
                <div
                  key={dayIndex}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900"
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {day.day_name}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400 mt-1">
                    Rest day
                  </div>
                </div>
              );
            }

            // Active Day
            return (
              <div
                key={dayIndex}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-1">
                      {day.day_name}
                    </div>
                    <div className="text-gray-700 dark:text-gray-300">
                      {getActivityCategoryLabel(day.activity_category)}: {day.activity_title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {day.total_estimated_duration_min} min
                    </div>

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
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        day.is_completed
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-yale-blue-500'
                      }`}
                      aria-label={day.is_completed ? 'Mark as incomplete' : 'Mark as complete'}
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
    </div>
  );
};

export default TrainingPlanView;

