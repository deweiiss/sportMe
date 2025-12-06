import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getActivitiesFromSupabase } from '../services/supabase';
import { getActivities, getStravaAthleteId } from '../services/stravaApi';
import { useStravaSync } from '../hooks/useStravaSync';

// Helper function to get current week range (Monday-Sunday)
const getCurrentWeekRange = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
  
  const daysUntilMonday = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);
  
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: sunday };
};

// Helper function to filter activities by date range
const filterActivitiesByDateRange = (activities, startDate, endDate) => {
  if (!startDate || !endDate) return activities;
  
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  return activities.filter(activity => {
    const activityDate = new Date(activity.start_date_local);
    return activityDate >= start && activityDate <= end;
  });
};

// Helper function to calculate aggregated stats
const calculateStats = (filteredActivities) => {
  if (filteredActivities.length === 0) {
    return {
      totalDistance: 0,
      totalElevationGain: 0,
      totalTime: 0,
      activityCount: 0,
    };
  }
  
  const stats = filteredActivities.reduce((acc, activity) => {
    acc.totalDistance += activity.distance || 0;
    acc.totalElevationGain += activity.total_elevation_gain || 0;
    acc.totalTime += activity.moving_time || 0;
    acc.activityCount += 1;
    return acc;
  }, {
    totalDistance: 0,
    totalElevationGain: 0,
    totalTime: 0,
    activityCount: 0,
  });
  
  return stats;
};

const StatisticsPage = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Initialize date range to current week
  const weekRange = getCurrentWeekRange();
  const [startDate, setStartDate] = useState(weekRange.start);
  const [endDate, setEndDate] = useState(weekRange.end);

  // Track if we've seen RLS errors to disable sync
  const [hasRLSError, setHasRLSError] = useState(false);

  // Enable automatic Strava sync in the background (every 15 minutes)
  useStravaSync({
    intervalMinutes: 15,
    enabled: !hasRLSError,
    onSyncComplete: (result) => {
      if (result.synced > 0) {
        console.log(`Background sync completed: ${result.synced} activities synced`);
        setHasRLSError(false);
      }
    },
    onSyncError: (error) => {
      console.warn('Background sync error:', error);
      if (error && (error.includes('PGRST116') || error.includes('permission') || error.includes('policy'))) {
        setHasRLSError(true);
        console.warn('RLS policy error detected. Sync disabled.');
      }
    }
  });

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const stravaId = getStravaAthleteId();
        const supabaseResult = await getActivitiesFromSupabase(stravaId, 100);
        
        if (!isMounted) return;
        
        if (supabaseResult.error) {
          console.warn('Supabase query failed:', supabaseResult.error);
          if (supabaseResult.error.includes('PGRST116') || supabaseResult.error.includes('permission') || supabaseResult.error.includes('policy')) {
            setHasRLSError(true);
            console.warn('⚠️ RLS policy error detected.');
          }
          console.log('Falling back to Strava API...');
          const stravaData = await getActivities(100);
          if (isMounted) {
            setActivities(stravaData);
          }
        } else if (supabaseResult.data && supabaseResult.data.length > 0) {
          if (isMounted) {
            setActivities(supabaseResult.data);
            console.log(`Loaded ${supabaseResult.data.length} activities from Supabase`);
          }
        } else {
          console.log('Supabase empty, fetching from Strava API...');
          const stravaData = await getActivities(100);
          if (isMounted) {
            setActivities(stravaData);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to fetch activities. Please try again.');
          console.error('Error fetching activities:', err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Filter activities by date range for stats
  const filteredActivities = filterActivitiesByDateRange(activities, startDate, endDate);
  
  // Calculate stats from filtered activities
  const stats = calculateStats(filteredActivities);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-700 dark:text-gray-300">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  return (
    <div>
      <h1 className="text-4xl m-0 mb-8 text-gray-900 dark:text-white">Statistics</h1>

      {/* Date Picker Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-8 shadow-md">
        <div className="flex gap-8 items-end flex-wrap">
          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <label htmlFor="start-date" className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Start Date:</label>
            <DatePicker
              id="start-date"
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              maxDate={endDate}
              dateFormat="MMM dd, yyyy"
              className="w-full px-3 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-colors focus:outline-none focus:border-primary-start dark:bg-gray-700 dark:text-white"
              calendarStartDay={1}
            />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <label htmlFor="end-date" className="font-semibold text-gray-600 dark:text-gray-300 text-sm">End Date:</label>
            <DatePicker
              id="end-date"
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              dateFormat="MMM dd, yyyy"
              className="w-full px-3 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-colors focus:outline-none focus:border-primary-start dark:bg-gray-700 dark:text-white"
              calendarStartDay={1}
            />
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div>
        <h2 className="text-3xl m-0 mb-6 text-gray-900 dark:text-white">Statistics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg text-center">
            <div className="text-sm text-gray-600 dark:text-gray-300 font-semibold mb-2 uppercase tracking-wide">Total Distance</div>
            <div className="text-3xl font-bold text-primary-start m-0">{formatDistance(stats.totalDistance)}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg text-center">
            <div className="text-sm text-gray-600 dark:text-gray-300 font-semibold mb-2 uppercase tracking-wide">Total Elevation Gain</div>
            <div className="text-3xl font-bold text-primary-start m-0">{stats.totalElevationGain.toFixed(0)} m</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg text-center">
            <div className="text-sm text-gray-600 dark:text-gray-300 font-semibold mb-2 uppercase tracking-wide">Total Time</div>
            <div className="text-3xl font-bold text-primary-start m-0">{formatDuration(stats.totalTime)}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg text-center">
            <div className="text-sm text-gray-600 dark:text-gray-300 font-semibold mb-2 uppercase tracking-wide">Number of Activities</div>
            <div className="text-3xl font-bold text-primary-start m-0">{stats.activityCount}</div>
          </div>
        </div>
      </div>

      {/* TODO: Add additional statistics features (charts, trends, etc.) */}
    </div>
  );
};

export default StatisticsPage;

