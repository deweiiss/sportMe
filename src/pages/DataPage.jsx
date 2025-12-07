import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getAccessToken, getActivities, clearStravaData, getStravaAthleteId } from '../services/stravaApi';
import { getActivitiesFromSupabase, deleteUserStravaData, getTrainingPlans, saveTrainingPlan, deleteTrainingPlan, migrateTrainingPlansFromLocalStorage } from '../services/supabase';
import { signOut } from '../services/auth';
import TrainingPlanCalendar from '../components/TrainingPlanCalendar';

// Helper function to get current week range (Monday-Sunday)
const getCurrentWeekRange = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
  
  // Calculate days to go back to Monday of the current week
  // If today is Sunday (0), go back 6 days to get Monday
  // If today is Monday (1), go back 0 days (today is Monday)
  // If today is Tuesday-Saturday, go back (dayOfWeek - 1) days
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

const DataPage = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [displayCount, setDisplayCount] = useState(10); // Start with 10 activities
  
  // Initialize date range to current week
  const weekRange = getCurrentWeekRange();
  const [startDate, setStartDate] = useState(weekRange.start);
  const [endDate, setEndDate] = useState(weekRange.end);

  // Track if we've seen RLS errors
  const [hasRLSError, setHasRLSError] = useState(false);

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates if component unmounts
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get Strava athlete ID (optional, for backward compatibility)
        const stravaId = getStravaAthleteId();

        // Try to fetch from Supabase first (will use authenticated user)
        const supabaseResult = await getActivitiesFromSupabase(stravaId, 100);
        
        if (!isMounted) return; // Don't update state if component unmounted
        
        if (supabaseResult.error) {
          // If there's an error (e.g., RLS policies missing), log it and fallback
          console.warn('Supabase query failed:', supabaseResult.error);
          // Check if it's an RLS/policy error
          if (supabaseResult.error.includes('PGRST116') || supabaseResult.error.includes('permission') || supabaseResult.error.includes('policy')) {
            setHasRLSError(true);
            console.warn('⚠️ RLS policy error detected. Please run migration: supabase/migrations/002_add_missing_rls_policies.sql');
          }
          console.log('Falling back to Strava API...');
          const stravaData = await getActivities(100);
          if (isMounted) {
            setActivities(stravaData);
          }
        } else if (supabaseResult.data && supabaseResult.data.length > 0) {
          // Use activities from Supabase
          if (isMounted) {
            setActivities(supabaseResult.data);
            console.log(`Loaded ${supabaseResult.data.length} activities from Supabase`);
          }
        } else {
          // Supabase is empty, fetch from Strava API
          console.log('Supabase empty, fetching from Strava API...');
          const stravaData = await getActivities(100);
          if (isMounted) {
            setActivities(stravaData);
          }
          
          // Background sync will handle saving to Supabase automatically
          // via the useStravaSync hook in MainLayout
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
    
    // Migrate training plans from localStorage to database (one-time)
    const migratePlans = async () => {
      try {
        const migrationResult = await migrateTrainingPlansFromLocalStorage();
        if (migrationResult.migrated > 0) {
          console.log(`Migrated ${migrationResult.migrated} training plans from localStorage to database`);
        }
      } catch (err) {
        console.warn('Failed to migrate training plans:', err);
        // Don't block the app if migration fails
      }
    };
    
    // Load saved training plans from database
    const loadSavedPlans = async () => {
      try {
        // First migrate any localStorage plans
        await migratePlans();
        
        // Then load from database
        const result = await getTrainingPlans();
        if (result.error) {
          console.error('Error loading training plans:', result.error);
          setSavedPlans([]);
          return;
        }
        
        // Plans are already sorted by created_at DESC from the query
        setSavedPlans(result.data || []);
      } catch (err) {
        console.error('Error loading saved plans:', err);
        setSavedPlans([]);
      }
    };
    
    loadSavedPlans();
    
    return () => {
      isMounted = false; // Cleanup: prevent state updates after unmount
    };
  }, [navigate]);

  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect your Strava account? This will delete all your activities, training plans, and other Strava data from the database.')) {
      try {
        setLoading(true);
        
        // Delete all Strava data from database (athlete, activities, sync logs, training plans)
        const result = await deleteUserStravaData();
        
        if (result.error) {
          setError(`Failed to disconnect: ${result.error}`);
          setLoading(false);
          return;
        }
        
        // Clear Strava data from localStorage
        clearStravaData();
        
        // Training plans are already deleted via deleteUserStravaData (CASCADE)
        // No need to manually remove from localStorage
        
        // Reload the page to refresh the UI
        window.location.reload();
      } catch (err) {
        setError(`Error disconnecting Strava: ${err.message}`);
        setLoading(false);
      }
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await signOut();
      navigate('/');
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
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPlanDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPlanTypeLabel = (planType) => {
    const labels = {
      ftp: 'FTP Improvement',
      base: 'Base Building',
      vo2max: 'VO2max Training'
    };
    return labels[planType] || planType;
  };

  const handleViewPlan = (plan) => {
    // Convert saved plan format to calendar format
    const calendarPlan = {
      startdate: plan.startDate,
      enddate: plan.endDate,
      week1: plan.weeks.week1,
      week2: plan.weeks.week2,
      week3: plan.weeks.week3,
      week4: plan.weeks.week4
    };
    setSelectedPlan({ ...plan, calendarData: calendarPlan });
  };

  const handleClosePlan = () => {
    setSelectedPlan(null);
  };

  const handlePlanChange = async (updatedPlan) => {
    if (!selectedPlan || !selectedPlan.id) return;
    
    try {
      // Update the plan in database
      const planToUpdate = {
        id: selectedPlan.id,
        planType: selectedPlan.planType,
        startDate: updatedPlan.startdate,
        endDate: updatedPlan.enddate,
        weeklyHours: selectedPlan.weeklyHours || null,
        weeks: {
          week1: updatedPlan.week1,
          week2: updatedPlan.week2,
          week3: updatedPlan.week3,
          week4: updatedPlan.week4
        }
      };

      const result = await saveTrainingPlan(planToUpdate);
      
      if (result.error) {
        console.error('Failed to update plan:', result.error);
        alert(`Failed to update plan: ${result.error}`);
        return;
      }

      // Update local state
      const updatedPlans = savedPlans.map(p => 
        p.id === selectedPlan.id ? result.data : p
      );
      setSavedPlans(updatedPlans);
      setSelectedPlan({ ...result.data, calendarData: updatedPlan });
    } catch (err) {
      console.error('Error updating plan:', err);
      alert(`Failed to update plan: ${err.message}`);
    }
  };

  const handleDeletePlan = async (plan) => {
    if (!plan.id) {
      console.error('Plan missing ID, cannot delete');
      return;
    }

    if (window.confirm('Are you sure you want to delete this training plan?')) {
      try {
        const result = await deleteTrainingPlan(plan.id);
        
        if (result.error) {
          alert(`Failed to delete plan: ${result.error}`);
          return;
        }

        // Update local state
        const filteredPlans = savedPlans.filter(p => p.id !== plan.id);
        setSavedPlans(filteredPlans);
        
        if (selectedPlan && selectedPlan.id === plan.id) {
          setSelectedPlan(null);
        }
      } catch (err) {
        console.error('Error deleting plan:', err);
        alert(`Failed to delete plan: ${err.message}`);
      }
    }
  };

  const handleShowMore = () => {
    setDisplayCount(prevCount => prevCount + 10);
  };

  // Filter activities by date range for stats
  const filteredActivities = filterActivitiesByDateRange(activities, startDate, endDate);
  
  // Calculate stats from filtered activities
  const stats = calculateStats(filteredActivities);
  
  // Get activities for display (paginated)
  const displayActivities = activities.slice(0, displayCount);
  const hasMoreActivities = activities.length > displayCount;

  if (loading) {
    return (
      <div className="min-h-screen p-8 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-center text-gray-700 dark:text-gray-300">Loading your activities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <h1 className="text-4xl m-0 text-gray-900 dark:text-white">Your Activities</h1>
          <div className="flex gap-4 flex-wrap">
            <button 
              onClick={() => navigate('/training')} 
              className="bg-gradient-to-br from-primary-start to-primary-end text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Generate Training Plan
            </button>
            <button 
              onClick={handleDisconnect} 
              className="bg-red-600 hover:bg-red-700 text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-colors"
            >
              Disconnect Strava
            </button>
            <button 
              onClick={handleLogout} 
              className="bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

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
        <div className="mb-12">
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

        {/* Saved Training Plans Section */}
        <div className="mb-12 mt-8">
          <h2 className="text-3xl m-0 mb-6 text-gray-900 dark:text-white">Saved Training Plans</h2>
          {savedPlans.length === 0 ? (
            <div className="text-center py-12 px-8 bg-white dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-300 shadow-md">
              <p className="text-lg m-0">No saved training plans. Generate a plan to get started!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {savedPlans.map((plan, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                    <h3 className="m-0 text-xl text-gray-900 dark:text-white">{getPlanTypeLabel(plan.planType)}</h3>
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                      {formatPlanDate(plan.startDate)} - {formatPlanDate(plan.endDate)}
                    </span>
                  </div>
                  <div className="flex gap-4 mb-4">
                    <button 
                      onClick={() => handleViewPlan(plan)}
                      className="bg-primary-start hover:bg-primary-end text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      {selectedPlan && 
                       selectedPlan.id === plan.id 
                        ? 'Hide Plan' 
                        : 'View/Edit Plan'}
                    </button>
                    <button 
                      onClick={() => handleDeletePlan(plan)}
                      className="bg-red-600 hover:bg-red-700 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      Delete
                    </button>
                  </div>
                  {selectedPlan && 
                   selectedPlan.id === plan.id && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                      <TrainingPlanCalendar
                        planData={selectedPlan.calendarData}
                        onPlanChange={handlePlanChange}
                        planType={plan.planType}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activities List Section */}
        <div className="mt-8">
          <h2 className="text-3xl m-0 mb-6 text-gray-900 dark:text-white">Your Activities</h2>
          {displayActivities.length === 0 ? (
            <div className="text-center py-16 px-8 bg-white dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-300 shadow-md">
              <p className="text-xl m-0">No activities found.</p>
            </div>
          ) : (
            <div>
              <div className="text-lg text-gray-600 dark:text-gray-300 mb-6 font-medium">
                Showing {displayActivities.length} of {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
              </div>
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {displayActivities.map((activity) => (
                  <div key={activity.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex justify-between items-start mb-4 gap-4">
                      <h3 className="m-0 text-xl text-gray-900 dark:text-white flex-1">{activity.name || 'Untitled Activity'}</h3>
                      <span className="bg-primary-start text-white py-1 px-3 rounded-full text-xs font-semibold whitespace-nowrap">{activity.type}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="font-semibold text-gray-600 dark:text-gray-300">Date:</span>
                        <span className="text-gray-900 dark:text-white font-medium">{formatDate(activity.start_date_local)}</span>
                      </div>
                      {activity.distance > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Distance:</span>
                          <span className="text-gray-900 dark:text-white font-medium">{formatDistance(activity.distance)}</span>
                        </div>
                      )}
                      {activity.moving_time > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Duration:</span>
                          <span className="text-gray-900 dark:text-white font-medium">{formatDuration(activity.moving_time)}</span>
                        </div>
                      )}
                      {activity.average_speed > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Avg Speed:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {(activity.average_speed * 3.6).toFixed(2)} km/h
                          </span>
                        </div>
                      )}
                      {activity.total_elevation_gain > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Elevation Gain:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {activity.total_elevation_gain.toFixed(0)} m
                          </span>
                        </div>
                      )}
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
      </div>
    </div>
  );
};

export default DataPage;

