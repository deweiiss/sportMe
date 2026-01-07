/**
 * MatchingModal Component
 *
 * Modal for manually selecting an activity to match with a planned workout
 * Features:
 * - Lists recent activities (last 14 days)
 * - Search/filter by activity name, date, type, distance
 * - Shows if activity is already matched
 * - Click to link activity to workout
 */

import { useState, useEffect, useMemo } from 'react';
import Badge from './Badge';

const MatchingModal = ({
  isOpen,
  onClose,
  onSelectActivity,
  activities = [],
  matchedActivityIds = new Set(),
  workoutDetails = null
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedType('all');
      setIsProcessing(false);
    }
  }, [isOpen]);

  // Filter activities to last 14 days
  const recentActivities = useMemo(() => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    return activities.filter(activity => {
      const activityDate = new Date(activity.start_date_local || activity.start_date);
      return activityDate >= fourteenDaysAgo;
    }).sort((a, b) => {
      const dateA = new Date(a.start_date_local || a.start_date);
      const dateB = new Date(b.start_date_local || b.start_date);
      return dateB - dateA; // Most recent first
    });
  }, [activities]);

  // Get unique activity types
  const activityTypes = useMemo(() => {
    const types = new Set();
    recentActivities.forEach(activity => {
      if (activity.type) types.add(activity.type);
    });
    return Array.from(types).sort();
  }, [recentActivities]);

  // Filter activities based on search and type
  const filteredActivities = useMemo(() => {
    return recentActivities.filter(activity => {
      // Type filter
      if (selectedType !== 'all' && activity.type !== selectedType) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (activity.name || '').toLowerCase();
        const type = (activity.type || '').toLowerCase();
        const distance = activity.distance ? (activity.distance / 1000).toFixed(1) : '';

        return name.includes(term) || type.includes(term) || distance.includes(term);
      }

      return true;
    });
  }, [recentActivities, searchTerm, selectedType]);

  const handleSelectActivity = async (activity) => {
    if (!onSelectActivity || isProcessing) return;

    setIsProcessing(true);
    try {
      await onSelectActivity(activity);
      onClose();
    } catch (error) {
      console.error('Error selecting activity:', error);
      setIsProcessing(false);
    }
  };

  const formatActivityDate = (activity) => {
    const date = new Date(activity.start_date_local || activity.start_date);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatActivityTime = (activity) => {
    const date = new Date(activity.start_date_local || activity.start_date);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatDistance = (meters) => {
    if (!meters) return null;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatPace = (activity) => {
    if (!activity.average_speed || !activity.type?.toLowerCase().includes('run')) {
      return null;
    }
    const paceMinPerKm = 1000 / (activity.average_speed * 60);
    const paceMin = Math.floor(paceMinPerKm);
    const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
    return `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Link Activity to Workout
              </h2>
              {workoutDetails && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {workoutDetails.day_name} - {workoutDetails.activity_title}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <input
            type="text"
            placeholder="Search by activity name, type, or distance..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">
              Type:
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {activityTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {recentActivities.length === 0
                ? 'No activities found in the last 14 days'
                : 'No activities match your search criteria'
              }
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActivities.map(activity => {
                const isAlreadyMatched = matchedActivityIds.has(activity.id);
                const distance = formatDistance(activity.distance);
                const duration = formatDuration(activity.moving_time);
                const pace = formatPace(activity);

                return (
                  <button
                    key={activity.id}
                    onClick={() => handleSelectActivity(activity)}
                    disabled={isAlreadyMatched || isProcessing}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      isAlreadyMatched
                        ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 dark:text-white truncate">
                            {activity.name || 'Untitled Activity'}
                          </h3>
                          {isAlreadyMatched && (
                            <Badge variant="manual">Already Matched</Badge>
                          )}
                        </div>

                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {formatActivityDate(activity)} at {formatActivityTime(activity)}
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                          <span>{activity.type}</span>
                          {distance && <span>{distance}</span>}
                          {duration && <span>{duration}</span>}
                          {pace && <span>{pace}</span>}
                        </div>
                      </div>

                      {!isAlreadyMatched && (
                        <svg
                          className="w-5 h-5 text-gray-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchingModal;
