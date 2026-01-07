/**
 * SuggestedMatchesBanner Component
 *
 * Collapsible banner displaying medium-confidence activity matches
 * Users can accept or reject each suggestion
 */

import { useState } from 'react';
import ConfidenceMeter from './ConfidenceMeter';

const SuggestedMatchesBanner = ({ suggestions = [], onAccept, onReject, onRefresh }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const handleAccept = async (suggestion) => {
    if (!onAccept) return;

    const id = `${suggestion.match.weekIndex}-${suggestion.match.dayIndex}`;
    setProcessingIds(prev => new Set(prev).add(id));

    try {
      await onAccept(suggestion);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error accepting suggestion:', error);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReject = async (suggestion) => {
    if (!onReject) return;

    const id = `${suggestion.match.weekIndex}-${suggestion.match.dayIndex}`;
    setProcessingIds(prev => new Set(prev).add(id));

    try {
      await onReject(suggestion);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const formatActivityDetails = (activity) => {
    const date = new Date(activity.start_date_local || activity.start_date);
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const distance = activity.distance ? `${(activity.distance / 1000).toFixed(1)} km` : null;

    let duration = null;
    if (activity.moving_time) {
      const minutes = Math.floor(activity.moving_time / 60);
      duration = `${minutes}min`;
    }

    return [formattedDate, distance, duration].filter(Boolean).join(', ');
  };

  const formatWorkoutDetails = (day) => {
    const parts = [];
    if (day.day_name) parts.push(day.day_name);
    if (day.activity_title) parts.push(day.activity_title);
    return parts.join(' - ');
  };

  const visibleSuggestions = isExpanded ? suggestions : suggestions.slice(0, 3);
  const hasMore = suggestions.length > 3;

  return (
    <div className="mb-4 border border-blue-200 bg-blue-50 rounded-lg">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-blue-900">
            We found {suggestions.length} potential match{suggestions.length !== 1 ? 'es' : ''} for your workouts
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-700">
            {isExpanded ? 'Hide' : 'Show'}
          </span>
          <svg
            className={`w-4 h-4 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {visibleSuggestions.map((suggestion, index) => {
            const { activity, match } = suggestion;
            const id = `${match.weekIndex}-${match.dayIndex}`;
            const isProcessing = processingIds.has(id);

            return (
              <div
                key={id}
                className="p-3 bg-white border border-gray-200 rounded-lg"
              >
                {/* Activity info */}
                <div className="mb-2">
                  <div className="text-sm font-medium text-gray-900">
                    {activity.name || 'Activity'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {formatActivityDetails(activity)}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center my-1">
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>

                {/* Planned workout info */}
                <div className="mb-3">
                  <div className="text-sm font-medium text-gray-900">
                    {formatWorkoutDetails(match.day)}
                  </div>
                  <div className="text-xs text-gray-600">
                    Week {match.weekIndex + 1}, Day {match.dayIndex + 1}
                  </div>
                </div>

                {/* Confidence meter */}
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Match confidence:</div>
                  <ConfidenceMeter confidence={match.matchScore} />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(suggestion)}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded transition-colors"
                  >
                    {isProcessing ? 'Processing...' : 'Accept'}
                  </button>
                  <button
                    onClick={() => handleReject(suggestion)}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 rounded transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}

          {/* Show more indicator */}
          {hasMore && !isExpanded && (
            <div className="text-center text-xs text-blue-700">
              ... and {suggestions.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuggestedMatchesBanner;
