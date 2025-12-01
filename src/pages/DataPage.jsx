import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getAccessToken, getActivities, clearStravaData, getStravaAthleteId } from '../services/stravaApi';
import { getActivitiesFromSupabase, deleteUserStravaData } from '../services/supabase';
import { signOut } from '../services/auth';
import TrainingPlanCalendar from '../components/TrainingPlanCalendar';
import { useStravaSync } from '../hooks/useStravaSync';

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
  
  // Initialize date range to current week
  const weekRange = getCurrentWeekRange();
  const [startDate, setStartDate] = useState(weekRange.start);
  const [endDate, setEndDate] = useState(weekRange.end);

  // Track if we've seen RLS errors to disable sync
  const [hasRLSError, setHasRLSError] = useState(false);

  // Enable automatic Strava sync in the background (every 60 minutes)
  // Disable if RLS errors are detected
  useStravaSync({
    intervalMinutes: 60,
    enabled: !hasRLSError, // Disable sync if RLS errors detected
    onSyncComplete: (result) => {
      if (result.synced > 0) {
        console.log(`Background sync completed: ${result.synced} activities synced`);
        setHasRLSError(false); // Re-enable if sync succeeds
      }
    },
    onSyncError: (error) => {
      console.warn('Background sync error:', error);
      // Check if it's an RLS/policy error
      if (error && (error.includes('PGRST116') || error.includes('permission') || error.includes('policy'))) {
        setHasRLSError(true);
        console.warn('RLS policy error detected. Sync disabled. Please run migration 002_add_missing_rls_policies.sql');
      }
    }
  });

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
          // via the useStravaSync hook
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
    
    // Load saved training plans
    const loadSavedPlans = () => {
      try {
        const plans = JSON.parse(localStorage.getItem('trainingPlans') || '[]');
        // Sort by creation date, most recent first
        plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setSavedPlans(plans);
      } catch (err) {
        console.error('Error loading saved plans:', err);
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
        
        // Clear training plans from localStorage (they're also stored locally)
        localStorage.removeItem('trainingPlans');
        
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

  const handlePlanChange = (updatedPlan) => {
    if (!selectedPlan) return;
    
    // Update the plan in localStorage
    const plans = JSON.parse(localStorage.getItem('trainingPlans') || '[]');
    const planIndex = plans.findIndex(p => 
      p.createdAt === selectedPlan.createdAt && 
      p.planType === selectedPlan.planType
    );
    
    if (planIndex !== -1) {
      plans[planIndex] = {
        ...plans[planIndex],
        startDate: updatedPlan.startdate,
        endDate: updatedPlan.enddate,
        weeks: {
          week1: updatedPlan.week1,
          week2: updatedPlan.week2,
          week3: updatedPlan.week3,
          week4: updatedPlan.week4
        },
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('trainingPlans', JSON.stringify(plans));
      setSavedPlans([...plans]);
      setSelectedPlan({ ...selectedPlan, calendarData: updatedPlan });
    }
  };

  const handleDeletePlan = (plan) => {
    if (window.confirm('Are you sure you want to delete this training plan?')) {
      const plans = JSON.parse(localStorage.getItem('trainingPlans') || '[]');
      const filteredPlans = plans.filter(p => 
        !(p.createdAt === plan.createdAt && p.planType === plan.planType)
      );
      localStorage.setItem('trainingPlans', JSON.stringify(filteredPlans));
      setSavedPlans(filteredPlans);
      if (selectedPlan && 
          selectedPlan.createdAt === plan.createdAt && 
          selectedPlan.planType === plan.planType) {
        setSelectedPlan(null);
      }
    }
  };

  // Filter activities by date range for stats
  const filteredActivities = filterActivitiesByDateRange(activities, startDate, endDate);
  
  // Calculate stats from filtered activities
  const stats = calculateStats(filteredActivities);
  
  // Get last 100 activities for display
  const displayActivities = activities.slice(0, 100);

  if (loading) {
    return (
      <div className="data-page">
        <div className="data-container">
          <div className="loading-spinner"></div>
          <p>Loading your activities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-page">
        <div className="data-container">
          <div className="error-message">
            <h2>Error</h2>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="data-page">
      <div className="data-container">
        <div className="header">
          <h1>Your Activities</h1>
          <div className="header-actions">
            <button onClick={() => navigate('/training')} className="training-button">
              Generate Training Plan
            </button>
            <button onClick={handleDisconnect} className="disconnect-button">
              Disconnect Strava
            </button>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>

        {/* Date Picker Section */}
        <div className="date-picker-section">
          <div className="date-picker-container">
            <div className="date-picker-group">
              <label htmlFor="start-date">Start Date:</label>
              <DatePicker
                id="start-date"
                selected={startDate}
                onChange={(date) => setStartDate(date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                maxDate={endDate}
                dateFormat="MMM dd, yyyy"
                className="date-picker-input"
                calendarStartDay={1}
              />
            </div>
            <div className="date-picker-group">
              <label htmlFor="end-date">End Date:</label>
              <DatePicker
                id="end-date"
                selected={endDate}
                onChange={(date) => setEndDate(date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                dateFormat="MMM dd, yyyy"
                className="date-picker-input"
                calendarStartDay={1}
              />
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="stats-section">
          <h2>Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Distance</div>
              <div className="stat-value">{formatDistance(stats.totalDistance)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Elevation Gain</div>
              <div className="stat-value">{stats.totalElevationGain.toFixed(0)} m</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Time</div>
              <div className="stat-value">{formatDuration(stats.totalTime)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Number of Activities</div>
              <div className="stat-value">{stats.activityCount}</div>
            </div>
          </div>
        </div>

        {/* Saved Training Plans Section */}
        <div className="saved-plans-section">
          <h2>Saved Training Plans</h2>
          {savedPlans.length === 0 ? (
            <div className="no-plans">
              <p>No saved training plans. Generate a plan to get started!</p>
            </div>
          ) : (
            <div className="plans-list">
              {savedPlans.map((plan, index) => (
                <div key={index} className="plan-card-item">
                  <div className="plan-card-header">
                    <h3>{getPlanTypeLabel(plan.planType)}</h3>
                    <span className="plan-date-range">
                      {formatPlanDate(plan.startDate)} - {formatPlanDate(plan.endDate)}
                    </span>
                  </div>
                  <div className="plan-card-actions">
                    <button 
                      onClick={() => handleViewPlan(plan)}
                      className="view-plan-button"
                    >
                      {selectedPlan && 
                       selectedPlan.createdAt === plan.createdAt && 
                       selectedPlan.planType === plan.planType 
                        ? 'Hide Plan' 
                        : 'View/Edit Plan'}
                    </button>
                    <button 
                      onClick={() => handleDeletePlan(plan)}
                      className="delete-plan-button"
                    >
                      Delete
                    </button>
                  </div>
                  {selectedPlan && 
                   selectedPlan.createdAt === plan.createdAt && 
                   selectedPlan.planType === plan.planType && (
                    <div className="plan-calendar-view">
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
        <div className="activities-section">
          <h2>Last 100 Activities</h2>
          {displayActivities.length === 0 ? (
            <div className="no-activities">
              <p>No activities found.</p>
            </div>
          ) : (
            <div className="activities-list">
              <div className="activities-count">
                Showing {displayActivities.length} {displayActivities.length === 1 ? 'activity' : 'activities'}
              </div>
              {displayActivities.map((activity) => (
                <div key={activity.id} className="activity-card">
                  <div className="activity-header">
                    <h3>{activity.name || 'Untitled Activity'}</h3>
                    <span className="activity-type">{activity.type}</span>
                  </div>
                  <div className="activity-details">
                    <div className="detail-item">
                      <span className="detail-label">Date:</span>
                      <span className="detail-value">{formatDate(activity.start_date_local)}</span>
                    </div>
                    {activity.distance > 0 && (
                      <div className="detail-item">
                        <span className="detail-label">Distance:</span>
                        <span className="detail-value">{formatDistance(activity.distance)}</span>
                      </div>
                    )}
                    {activity.moving_time > 0 && (
                      <div className="detail-item">
                        <span className="detail-label">Duration:</span>
                        <span className="detail-value">{formatDuration(activity.moving_time)}</span>
                      </div>
                    )}
                    {activity.average_speed > 0 && (
                      <div className="detail-item">
                        <span className="detail-label">Avg Speed:</span>
                        <span className="detail-value">
                          {(activity.average_speed * 3.6).toFixed(2)} km/h
                        </span>
                      </div>
                    )}
                    {activity.total_elevation_gain > 0 && (
                      <div className="detail-item">
                        <span className="detail-label">Elevation Gain:</span>
                        <span className="detail-value">
                          {activity.total_elevation_gain.toFixed(0)} m
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataPage;

