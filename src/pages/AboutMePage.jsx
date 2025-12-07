import { useEffect, useState } from 'react';
import { getCurrentUser } from '../services/auth';
import { getActivitiesFromSupabase } from '../services/supabase';
import { getActivities, getStravaAthleteId } from '../services/stravaApi';

const AboutMePage = () => {
  const [user, setUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch user info
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);

      // Fetch activities for calculating running experience
      try {
        const stravaId = getStravaAthleteId();
        const supabaseResult = await getActivitiesFromSupabase(stravaId, 100);
        
        if (supabaseResult.error || !supabaseResult.data || supabaseResult.data.length === 0) {
          const stravaData = await getActivities(100);
          setActivities(stravaData || []);
        } else {
          setActivities(supabaseResult.data || []);
        }
      } catch (err) {
        console.error('Error fetching activities:', err);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate running experience from activities
  const calculateRunningExperience = () => {
    if (activities.length === 0) {
      return {
        frequency: 'No data available',
        bestPace: 'N/A',
        longestRun: 'N/A',
        pastRaces: 'No data available',
      };
    }

    // Calculate frequency (runs per week on average)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const recentActivities = activities.filter(activity => {
      const activityDate = new Date(activity.start_date_local);
      return activityDate >= oneYearAgo;
    });
    const weeksInYear = 52;
    const avgRunsPerWeek = (recentActivities.length / weeksInYear).toFixed(1);
    
    let frequency = 'Runs occasionally';
    if (avgRunsPerWeek >= 3) {
      frequency = 'Runs almost every week';
    } else if (avgRunsPerWeek >= 1) {
      frequency = 'Runs regularly';
    }

    // Find best pace (fastest average speed)
    const bestPaceActivity = activities.reduce((best, activity) => {
      if (!activity.average_speed || activity.average_speed === 0) return best;
      if (!best || activity.average_speed > best.average_speed) return activity;
      return best;
    }, null);

    const bestPace = bestPaceActivity
      ? `${Math.round(1000 / (bestPaceActivity.average_speed * 60))} min`
      : 'N/A';

    // Find longest run
    const longestRunActivity = activities.reduce((longest, activity) => {
      if (!activity.distance) return longest;
      if (!longest || activity.distance > longest.distance) return activity;
      return longest;
    }, null);

    const longestRun = longestRunActivity
      ? `${(longestRunActivity.distance / 1000).toFixed(1)} km`
      : 'N/A';

    // Check for past races (marathons, half marathons, etc.)
    const raceActivities = activities.filter(activity => {
      const distance = activity.distance || 0;
      // Consider activities over 20km as potential races
      return distance >= 20000;
    });

    const pastRaces = raceActivities.length > 0
      ? `Completed ${raceActivities.length} long distance run${raceActivities.length > 1 ? 's' : ''}`
      : 'Never ran a marathon before';

    return {
      frequency,
      bestPace,
      longestRun,
      pastRaces,
    };
  };

  const runningExperience = calculateRunningExperience();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-700 dark:text-gray-300">Loading your information...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-4xl m-0 mb-8 text-gray-900 dark:text-white">About Me</h1>

      <div className="space-y-8">
        {/* Personal Information Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Personal information</h2>
          <div className="space-y-3">
            {/* TODO: Fetch birthday from user profile or data source */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Birthday:</span>
              <span className="text-gray-900 dark:text-white font-medium">TODO: Fetch from data source</span>
            </div>
            {/* TODO: Fetch gender from user profile or data source */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Gender:</span>
              <span className="text-gray-900 dark:text-white font-medium">TODO: Fetch from data source</span>
            </div>
            {/* TODO: Fetch location from user profile or Strava data */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Based in:</span>
              <span className="text-gray-900 dark:text-white font-medium">TODO: Fetch from data source</span>
            </div>
          </div>
        </div>

        {/* Running Experience Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Running experience</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Frequency:</span>
              <span className="text-gray-900 dark:text-white font-medium">{runningExperience.frequency}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Best pace:</span>
              <span className="text-gray-900 dark:text-white font-medium">{runningExperience.bestPace}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Longest run:</span>
              <span className="text-gray-900 dark:text-white font-medium">{runningExperience.longestRun}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Past races:</span>
              <span className="text-gray-900 dark:text-white font-medium">{runningExperience.pastRaces}</span>
            </div>
          </div>
        </div>

        {/* Everything Else Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Everything else</h2>
          <div className="space-y-3">
            {/* TODO: Fetch injuries from conversations/data */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Injuries:</span>
              <span className="text-gray-900 dark:text-white font-medium">TODO: Fetch from conversations/data</span>
            </div>
            {/* TODO: Fetch environment from conversations/data */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Environment:</span>
              <span className="text-gray-900 dark:text-white font-medium">TODO: Fetch from conversations/data</span>
            </div>
          </div>
        </div>

        {/* Information Message */}
        <div className="bg-yale-blue-50 dark:bg-yale-blue-900/20 border border-yale-blue-200 dark:border-yale-blue-800 rounded-xl p-6">
          <p className="text-gray-700 dark:text-gray-300 m-0">
            This is what I learned about you based on your Strava account and our conversations. If you want to update any information, just let me know!
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutMePage;

