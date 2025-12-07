import { useEffect, useState } from 'react';
import { getActivitiesFromSupabase } from '../services/supabase';
import { getActivities, getStravaAthleteId } from '../services/stravaApi';
import { autoSyncActivities } from '../services/stravaSync';

const WorkoutsPage = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [displayCount, setDisplayCount] = useState(10);

  // Track if we've seen RLS errors
  const [hasRLSError, setHasRLSError] = useState(false);

  const fetchActivities = async () => {
    try {
      setError(null);
      
      const stravaId = getStravaAthleteId();
      const supabaseResult = await getActivitiesFromSupabase(stravaId, 100);
      
      if (supabaseResult.error) {
        console.warn('Supabase query failed:', supabaseResult.error);
        if (supabaseResult.error.includes('PGRST116') || supabaseResult.error.includes('permission') || supabaseResult.error.includes('policy')) {
          setHasRLSError(true);
          console.warn('⚠️ RLS policy error detected.');
        }
        console.log('Falling back to Strava API...');
        const stravaData = await getActivities(100);
        setActivities(stravaData || []);
      } else if (supabaseResult.data && supabaseResult.data.length > 0) {
        setActivities(supabaseResult.data);
        console.log(`Loaded ${supabaseResult.data.length} activities from Supabase`);
      } else {
        console.log('Supabase empty, fetching from Strava API...');
        const stravaData = await getActivities(100);
        setActivities(stravaData || []);
      }
    } catch (err) {
      setError('Failed to fetch activities. Please try again.');
      console.error('Error fetching activities:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      setLoading(true);
      await fetchActivities();
      if (isMounted) {
        setLoading(false);
      }
    };

    loadData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefreshStrava = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      const stravaId = getStravaAthleteId();
      if (!stravaId) {
        setError('No Strava account connected. Please connect your Strava account first.');
        setRefreshing(false);
        return;
      }

      // Trigger manual sync
      const result = await autoSyncActivities(stravaId, true);
      
      if (result.error) {
        setError(`Failed to sync: ${result.error}`);
      } else {
        // Refresh activities after sync
        await fetchActivities();
        console.log(`Sync completed: ${result.synced || 0} activities synced`);
      }
    } catch (err) {
      setError(`Error refreshing Strava: ${err.message}`);
      console.error('Error refreshing Strava:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const handleShowMore = () => {
    setDisplayCount(prevCount => prevCount + 10);
  };

  // Get activities for display (paginated)
  const displayActivities = activities.slice(0, displayCount);
  const hasMoreActivities = activities.length > displayCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-700 dark:text-gray-300">Loading your activities...</p>
        </div>
      </div>
    );
  }

  if (error && !activities.length) {
    return (
      <div>
        <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
          <h2 className="text-red-600 dark:text-red-400 text-2xl font-semibold mb-4 mt-0">Error</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-primary-start hover:bg-primary-end text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <h1 className="text-4xl m-0 text-gray-900 dark:text-white">Workouts</h1>
        <button 
          onClick={handleRefreshStrava}
          disabled={refreshing}
          className="bg-black hover:bg-gray-800 text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Strava'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {displayActivities.length === 0 ? (
        <div className="text-center py-16 px-8 bg-white dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-300 shadow-md">
          <p className="text-xl m-0">No activities found.</p>
        </div>
      ) : (
        <div>
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {displayActivities.map((activity) => (
              <div key={activity.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg">
                <div className="flex justify-between items-start mb-4 gap-4">
                  <h3 className="m-0 text-xl text-gray-900 dark:text-white flex-1">{activity.name || 'Untitled Activity'}</h3>
                  <span className="bg-primary-start text-white py-1 px-3 rounded-full text-xs font-semibold whitespace-nowrap">{activity.type}</span>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {formatDate(activity.start_date_local)}
                </div>
                <div className="flex flex-col gap-3">
                  {activity.distance > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="font-semibold text-gray-600 dark:text-gray-300">Distance:</span>
                      <span className="text-gray-900 dark:text-white font-medium">{formatDistance(activity.distance)}</span>
                    </div>
                  )}
                  {activity.average_speed > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="font-semibold text-gray-600 dark:text-gray-300">Pace:</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {Math.floor(1000 / (activity.average_speed * 60))} min {Math.floor((1000 / activity.average_speed) % 60)} sec
                      </span>
                    </div>
                  )}
                  {activity.moving_time > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="font-semibold text-gray-600 dark:text-gray-300">Duration:</span>
                      <span className="text-gray-900 dark:text-white font-medium">{formatDuration(activity.moving_time)}</span>
                    </div>
                  )}
                  {/* TODO: Add "Type: Zone 2" or similar classification */}
                </div>
              </div>
            ))}
          </div>
          {hasMoreActivities && (
            <div className="text-center mt-8">
              <button
                onClick={handleShowMore}
                className="px-8 py-3 text-base bg-yale-blue-600 hover:bg-yale-blue-700 text-white border-none rounded cursor-pointer font-medium transition-colors"
              >
                Show More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkoutsPage;

