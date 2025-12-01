import { useEffect, useRef } from 'react';
import { autoSyncActivities } from '../services/stravaSync';
import { getStravaAthleteId } from '../services/stravaApi';
import { getAccessToken } from '../services/stravaApi';

/**
 * Custom hook for automatic Strava activity syncing
 * 
 * @param {Object} options - Sync options
 * @param {number} options.intervalMinutes - Sync interval in minutes (default: 60)
 * @param {boolean} options.enabled - Enable/disable auto-sync (default: true)
 * @param {Function} options.onSyncComplete - Callback when sync completes
 * @param {Function} options.onSyncError - Callback when sync fails
 */
export const useStravaSync = (options = {}) => {
  const {
    intervalMinutes = 60,
    enabled = true,
    onSyncComplete,
    onSyncError
  } = options;

  const intervalRef = useRef(null);
  const isSyncingRef = useRef(false);

  const performSync = async () => {
    // Prevent concurrent syncs
    if (isSyncingRef.current) {
      return;
    }

    const token = await getAccessToken(true); // Auto-refresh if expired
    if (!token) {
      return; // Not authenticated or token refresh failed
    }

    const stravaId = getStravaAthleteId();
    if (!stravaId) {
      return; // No athlete ID
    }

    isSyncingRef.current = true;

    try {
      const result = await autoSyncActivities(stravaId);
      
      if (result.success) {
        if (onSyncComplete) {
          onSyncComplete(result);
        }
        if (result.synced > 0) {
          console.log(`✅ Synced ${result.synced} activities (${result.created} new, ${result.updated} updated)`);
        }
      } else {
        if (onSyncError) {
          onSyncError(result.error);
        } else {
          console.warn('Sync completed with errors:', result.error);
        }
      }
    } catch (error) {
      if (onSyncError) {
        onSyncError(error.message);
      } else {
        console.error('Sync error:', error);
      }
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Perform initial sync after a short delay
    const initialTimeout = setTimeout(() => {
      performSync();
    }, 5000); // Wait 5 seconds after mount

    // Set up periodic sync
    const intervalMs = intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(() => {
      performSync();
    }, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, intervalMinutes]);

  // Manual sync function
  const syncNow = () => {
    performSync();
  };

  return { syncNow };
};

