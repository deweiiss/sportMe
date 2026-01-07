/**
 * ActivityPreview Component
 *
 * Compact display of a matched Strava activity
 * Shows: activity name, date, distance, duration, pace
 * Includes link to view on Strava and unmatch button
 */

import { useState } from 'react';
import Badge from './Badge';

const ActivityPreview = ({ activity, matchType, matchConfidence, onUnmatch, showUnmatchButton = true }) => {
  const [isUnmatching, setIsUnmatching] = useState(false);

  if (!activity) return null;

  // Format date
  const activityDate = new Date(activity.start_date_local || activity.start_date);
  const formattedDate = activityDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Format distance
  const distanceKm = activity.distance ? (activity.distance / 1000).toFixed(1) : null;

  // Format duration
  let durationStr = null;
  if (activity.moving_time) {
    const hours = Math.floor(activity.moving_time / 3600);
    const minutes = Math.floor((activity.moving_time % 3600) / 60);
    if (hours > 0) {
      durationStr = `${hours}h ${minutes}m`;
    } else {
      durationStr = `${minutes}m`;
    }
  }

  // Format pace (for running)
  let paceStr = null;
  if (activity.average_speed && activity.type?.toLowerCase().includes('run')) {
    const paceMinPerKm = 1000 / (activity.average_speed * 60);
    const paceMin = Math.floor(paceMinPerKm);
    const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
    paceStr = `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;
  }

  // Get match type badge variant
  const getBadgeVariant = () => {
    if (matchType === 'auto') return 'auto-matched';
    if (matchType === 'manual') return 'manual';
    if (matchType === 'suggested_accepted') return 'suggested_accepted';
    return 'unmatched';
  };

  const getBadgeText = () => {
    if (matchType === 'auto') return 'Auto-matched';
    if (matchType === 'manual') return 'Manual';
    if (matchType === 'suggested_accepted') return 'Suggested';
    return 'Matched';
  };

  const handleUnmatch = async () => {
    if (!onUnmatch) return;

    setIsUnmatching(true);
    try {
      await onUnmatch();
    } catch (error) {
      console.error('Error unmatching:', error);
    } finally {
      setIsUnmatching(false);
    }
  };

  return (
    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Activity name and badge */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {activity.name || 'Activity'}
            </h4>
            <Badge variant={getBadgeVariant()}>
              {getBadgeText()}
            </Badge>
          </div>

          {/* Activity details */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span>{formattedDate}</span>
            {distanceKm && <span>{distanceKm} km</span>}
            {durationStr && <span>{durationStr}</span>}
            {paceStr && <span>{paceStr}</span>}
          </div>

          {/* Match confidence (if available) */}
          {matchConfidence !== null && matchConfidence !== undefined && (
            <div className="mt-2 text-xs text-gray-500">
              Match confidence: {Math.round(matchConfidence * 100)}%
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* View on Strava */}
          <a
            href={`https://www.strava.com/activities/${activity.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
          >
            View on Strava →
          </a>

          {/* Unmatch button */}
          {showUnmatchButton && onUnmatch && (
            <button
              onClick={handleUnmatch}
              disabled={isUnmatching}
              className="text-xs text-red-600 hover:text-red-800 disabled:text-gray-400 whitespace-nowrap"
            >
              {isUnmatching ? 'Unmatching...' : 'Unmatch'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityPreview;
