import { useEffect, useState } from 'react';
import { getCurrentUser } from '../services/auth';
import { getActivitiesFromSupabase, getAthleteProfile, updateAthleteProfile, syncAthleteProfileFromStrava } from '../services/supabase';
import { getActivities, getStravaAthleteId, getAthlete } from '../services/stravaApi';

const AboutMePage = () => {
  const [user, setUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch user info
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);

      // Fetch athlete profile data
      try {
        // First, try to get from database (prefers user edits)
        const profileResult = await getAthleteProfile();
        
        if (profileResult.data) {
          setAthleteProfile(profileResult.data);
        } else {
          // If no profile in DB, fetch from Strava and save to DB
          try {
            const stravaAthlete = await getAthlete();
            if (stravaAthlete) {
              // Save to database
              const stravaId = getStravaAthleteId();
              if (stravaId) {
                await updateAthleteProfile({
                  firstname: stravaAthlete.firstname || null,
                  lastname: stravaAthlete.lastname || null,
                  weight: stravaAthlete.weight || null,
                  city: stravaAthlete.city || null,
                  state: stravaAthlete.state || null,
                  country: stravaAthlete.country || null,
                  sex: stravaAthlete.sex || null,
                  bikes: stravaAthlete.bikes || null,
                  shoes: stravaAthlete.shoes || null,
                });
                // Reload profile from DB
                const updatedProfile = await getAthleteProfile();
                if (updatedProfile.data) {
                  setAthleteProfile(updatedProfile.data);
                }
              }
            }
          } catch (stravaError) {
            console.error('Error fetching athlete from Strava:', stravaError);
          }
        }
      } catch (err) {
        console.error('Error fetching athlete profile:', err);
      }

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

  // Handle field edit
  const handleEditField = (fieldName, currentValue) => {
    setEditingField(fieldName);
    setEditValues({ [fieldName]: currentValue || '' });
  };

  // Handle input change
  const handleInputChange = (fieldName, value) => {
    setEditValues({ [fieldName]: value });
  };

  // Handle save
  const handleSave = async (fieldName) => {
    setSaving(true);
    try {
      const value = editValues[fieldName];
      // Convert empty string to null for database
      const updateData = { [fieldName]: value === '' ? null : value };
      
      const result = await updateAthleteProfile(updateData);
      
      if (result.error) {
        console.error('Error updating profile:', result.error);
        alert('Failed to save. Please try again.');
      } else {
        // Update local state
        setAthleteProfile({ ...athleteProfile, ...updateData });
        setEditingField(null);
        setEditValues({});
      }
    } catch (err) {
      console.error('Error saving:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setEditingField(null);
    setEditValues({});
  };

  // Handle sync from Strava
  const handleSyncFromStrava = async () => {
    setSyncing(true);
    try {
      const result = await syncAthleteProfileFromStrava();
      
      if (result.error) {
        console.error('Error syncing from Strava:', result.error);
        // Show user-friendly error message
        if (result.error.includes('not found') || result.error.includes('not connected') || result.error.includes('reconnect')) {
          alert(`Unable to sync: ${result.error}\n\nPlease connect or reconnect your Strava account.`);
        } else {
          alert(`Failed to sync from Strava: ${result.error}`);
        }
      } else {
        // Update local state with synced data
        if (result.data) {
          console.log('Updating athlete profile state with synced data:', {
            bikes: result.data.bikes,
            shoes: result.data.shoes,
            bikesType: typeof result.data.bikes,
            shoesType: typeof result.data.shoes,
            isBikesArray: Array.isArray(result.data.bikes),
            isShoesArray: Array.isArray(result.data.shoes),
            fullData: result.data
          });
          setAthleteProfile(result.data);
        }
        // Show success feedback (optional - could be a toast notification)
        console.log('Profile synced successfully from Strava');
      }
    } catch (err) {
      console.error('Error during sync:', err);
      alert('Failed to sync from Strava. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  // Handle reconnect Strava account
  const handleReconnectStrava = () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI;
    const scope = 'activity:read_all';
    
    // Validate environment variables
    if (!clientId || clientId === 'your_client_id_here') {
      alert('Error: Please set VITE_STRAVA_CLIENT_ID in your .env file with your actual Strava Client ID');
      console.error('VITE_STRAVA_CLIENT_ID is not set or is using placeholder value');
      return;
    }
    
    if (!redirectUri || redirectUri === 'your_redirect_uri_here') {
      alert('Error: Please set VITE_STRAVA_REDIRECT_URI in your .env file');
      console.error('VITE_STRAVA_REDIRECT_URI is not set');
      return;
    }
    
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    
    console.log('Redirecting to Strava OAuth:', { clientId, redirectUri });
    window.location.href = authUrl;
  };

  // Format display value (handle NULL)
  const formatValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return 'Not set';
    }
    return value;
  };

  // Format weight display
  const formatWeight = (weight) => {
    if (weight === null || weight === undefined || weight === '') {
      return 'Not set';
    }
    return `${weight} kg`;
  };

  // Format location display
  const formatLocation = (city, state, country) => {
    const parts = [city, state, country].filter(Boolean);
    if (parts.length === 0) {
      return 'Not set';
    }
    return parts.join(', ');
  };

  // Format gender display
  const formatGender = (sex) => {
    if (!sex) return 'Not set';
    return sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : sex;
  };

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

  // Render editable field
  const renderEditableField = (label, fieldName, value, inputType = 'text', options = null) => {
    const isEditing = editingField === fieldName;
    const displayValue = fieldName === 'weight' ? formatWeight(value) : 
                        fieldName === 'sex' ? formatGender(value) :
                        formatValue(value);

    return (
      <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <span className="font-semibold text-gray-600 dark:text-gray-300">{label}:</span>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              {inputType === 'select' && options ? (
                <select
                  value={editValues[fieldName] || ''}
                  onChange={(e) => handleInputChange(fieldName, e.target.value)}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={saving}
                >
                  <option value="">Not set</option>
                  {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={inputType}
                  value={editValues[fieldName] || ''}
                  onChange={(e) => handleInputChange(fieldName, e.target.value)}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[200px]"
                  disabled={saving}
                />
              )}
              <button
                onClick={() => handleSave(fieldName)}
                disabled={saving}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className={`text-gray-900 dark:text-white font-medium ${!value ? 'italic text-gray-500' : ''}`}>
                {displayValue}
              </span>
              <button
                onClick={() => handleEditField(fieldName, value)}
                className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
                title="Edit"
              >
                ✏️
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl m-0 text-gray-900 dark:text-white">About Me</h1>
        <button
          onClick={handleSyncFromStrava}
          disabled={syncing}
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Sync profile from Strava"
        >
          {syncing ? (
            <span className="inline-block w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin"></span>
          ) : (
            <span className="text-xl">🔄</span>
          )}
        </button>
      </div>

      <div className="space-y-8">
        {/* Personal Information Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Personal information</h2>
          <div className="space-y-3">
            {renderEditableField('First name', 'firstname', athleteProfile?.firstname)}
            {renderEditableField('Last name', 'lastname', athleteProfile?.lastname)}
            {renderEditableField('Weight', 'weight', athleteProfile?.weight, 'number')}
            {renderEditableField('Birthday', 'birthday', athleteProfile?.birthday, 'date')}
            {renderEditableField('Gender', 'sex', athleteProfile?.sex, 'select', [
              { value: 'M', label: 'Male' },
              { value: 'F', label: 'Female' }
            ])}
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Based in:</span>
              <div className="flex items-center gap-2">
                {editingField === 'location' ? (
                  <>
                    <input
                      type="text"
                      placeholder="City"
                      value={editValues.city || ''}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
                      disabled={saving}
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={editValues.state || ''}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
                      disabled={saving}
                    />
                    <input
                      type="text"
                      placeholder="Country"
                      value={editValues.country || ''}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[150px]"
                      disabled={saving}
                    />
                    <button
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const result = await updateAthleteProfile({
                            city: editValues.city || null,
                            state: editValues.state || null,
                            country: editValues.country || null,
                          });
                          if (result.error) {
                            alert('Failed to save. Please try again.');
                          } else {
                            setAthleteProfile({ ...athleteProfile, ...result.data });
                            setEditingField(null);
                            setEditValues({});
                          }
                        } catch (err) {
                          alert('Failed to save. Please try again.');
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`text-gray-900 dark:text-white font-medium ${!formatLocation(athleteProfile?.city, athleteProfile?.state, athleteProfile?.country) || formatLocation(athleteProfile?.city, athleteProfile?.state, athleteProfile?.country) === 'Not set' ? 'italic text-gray-500' : ''}`}>
                      {formatLocation(athleteProfile?.city, athleteProfile?.state, athleteProfile?.country)}
                    </span>
                    <button
                      onClick={() => {
                        setEditingField('location');
                        setEditValues({
                          city: athleteProfile?.city || '',
                          state: athleteProfile?.state || '',
                          country: athleteProfile?.country || '',
                        });
                      }}
                      className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
                      title="Edit"
                    >
                      ✏️
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Gear Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Gear</h2>
          
          {/* Bikes */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Bikes</h3>
            {athleteProfile?.bikes && Array.isArray(athleteProfile.bikes) && athleteProfile.bikes.length > 0 ? (
              <div className="space-y-2">
                {athleteProfile.bikes.map((bike, index) => (
                  <div key={bike.id || index} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">{bike.name || 'Unnamed bike'}</span>
                      {bike.distance && (
                        <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                          ({(bike.distance / 1000).toFixed(0)} km)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">No bikes registered</p>
            )}
          </div>

          {/* Shoes */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Shoes</h3>
            {athleteProfile?.shoes && Array.isArray(athleteProfile.shoes) && athleteProfile.shoes.length > 0 ? (
              <div className="space-y-2">
                {athleteProfile.shoes.map((shoe, index) => (
                  <div key={shoe.id || index} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">{shoe.name || 'Unnamed shoes'}</span>
                      {shoe.distance && (
                        <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                          ({(shoe.distance / 1000).toFixed(0)} km)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">No shoes registered</p>
            )}
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

        {/* Reconnect Strava Button */}
        <div className="flex justify-center">
          <button
            onClick={handleReconnectStrava}
            className="bg-gradient-to-br from-orange to-orange-light text-white border-none py-3 px-6 text-base font-semibold rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
          >
            Reconnect Strava Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutMePage;
