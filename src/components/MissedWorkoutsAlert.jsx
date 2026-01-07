/**
 * MissedWorkoutsAlert Component
 *
 * Alert banner for missed workouts with options to:
 * - Mark as completed anyway (with note)
 * - Skip workout (mark as intentionally skipped)
 * - Link to late-logged activity
 * - Dismiss
 */

import { useState } from 'react';
import Badge from './Badge';

const MissedWorkoutsAlert = ({
  missedWorkouts = [],
  onMarkCompleted,
  onSkipWorkout,
  onLinkActivity,
  onDismiss
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [actioningWorkouts, setActioningWorkouts] = useState(new Set());
  const [showNoteInput, setShowNoteInput] = useState(null);
  const [note, setNote] = useState('');

  if (!missedWorkouts || missedWorkouts.length === 0) {
    return null;
  }

  const handleMarkCompleted = async (workout) => {
    if (!onMarkCompleted) return;

    const key = `${workout.weekIndex}-${workout.dayIndex}`;
    setActioningWorkouts(prev => new Set(prev).add(key));

    try {
      await onMarkCompleted(workout, note);
      setShowNoteInput(null);
      setNote('');
    } catch (error) {
      console.error('Error marking as completed:', error);
    } finally {
      setActioningWorkouts(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleSkipWorkout = async (workout) => {
    if (!onSkipWorkout) return;

    const key = `${workout.weekIndex}-${workout.dayIndex}`;
    setActioningWorkouts(prev => new Set(prev).add(key));

    try {
      await onSkipWorkout(workout, 'Intentionally skipped');
    } catch (error) {
      console.error('Error skipping workout:', error);
    } finally {
      setActioningWorkouts(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleLinkActivity = (workout) => {
    if (onLinkActivity) {
      onLinkActivity(workout);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatWorkoutTitle = (workout) => {
    const day = workout.day;
    return `${day.day_name} - ${day.activity_title || 'Workout'}`;
  };

  const visibleWorkouts = isExpanded ? missedWorkouts : missedWorkouts.slice(0, 3);
  const hasMore = missedWorkouts.length > 3;

  return (
    <div className="mb-4 border border-red-200 bg-red-50 rounded-lg">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1">
            <svg
              className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-900">
                {missedWorkouts.length} Missed Workout{missedWorkouts.length !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                These workouts are past their scheduled date. What would you like to do?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-red-700 hover:text-red-900 font-medium whitespace-nowrap"
            >
              {isExpanded ? 'Hide' : 'Review'}
            </button>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-red-400 hover:text-red-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {visibleWorkouts.map((workout) => {
            const key = `${workout.weekIndex}-${workout.dayIndex}`;
            const isActioning = actioningWorkouts.has(key);
            const showingNote = showNoteInput === key;

            return (
              <div
                key={key}
                className="p-3 bg-white border border-gray-200 rounded-lg"
              >
                {/* Workout info */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-gray-900">
                        {formatWorkoutTitle(workout)}
                      </h4>
                      <Badge variant="missed">
                        {workout.daysPastDue} day{workout.daysPastDue !== 1 ? 's' : ''} ago
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600">
                      Scheduled: {formatDate(workout.dayDate)}
                    </div>
                    <div className="text-xs text-gray-600">
                      Week {workout.weekIndex + 1}, Day {workout.dayIndex + 1} • {workout.day.total_estimated_duration_min} min
                    </div>
                  </div>
                </div>

                {/* Note input (if showing) */}
                {showingNote && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-700 mb-1">
                      Add a note (optional):
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g., Did the workout but forgot to log"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {showingNote ? (
                    <>
                      <button
                        onClick={() => handleMarkCompleted(workout)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded transition-colors"
                      >
                        {isActioning ? 'Saving...' : 'Confirm Complete'}
                      </button>
                      <button
                        onClick={() => {
                          setShowNoteInput(null);
                          setNote('');
                        }}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowNoteInput(key)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-300 hover:bg-green-100 disabled:bg-gray-100 rounded transition-colors"
                      >
                        Mark as Completed
                      </button>
                      <button
                        onClick={() => handleLinkActivity(workout)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 hover:bg-blue-100 disabled:bg-gray-100 rounded transition-colors"
                      >
                        Link Activity
                      </button>
                      <button
                        onClick={() => handleSkipWorkout(workout)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 rounded transition-colors"
                      >
                        {isActioning ? 'Processing...' : 'Skip'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Show more indicator */}
          {hasMore && !isExpanded && (
            <div className="text-center text-xs text-red-700">
              ... and {missedWorkouts.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MissedWorkoutsAlert;
