import { getActivities } from './stravaApi';
import { supabase } from './supabase';
import { getAccessToken } from './stravaApi';

/**
 * Sync Strava activities to Supabase
 * @param {number} athleteId - UUID of the athlete in Supabase
 * @param {number} stravaId - Strava athlete ID
 * @param {Object} options - Sync options
 * @param {number} options.perPage - Number of activities per page (default: 200, max: 200)
 * @param {number} options.maxPages - Maximum number of pages to sync (default: 10)
 * @param {boolean} options.forceUpdate - Force update existing activities (default: false)
 * @returns {Promise<{success: boolean, synced: number, created: number, updated: number, error?: string}>}
 */
export const syncActivities = async (athleteId, stravaId, options = {}) => {
  const {
    perPage = 200,
    maxPages = 10,
    forceUpdate = false
  } = options;

  let synced = 0;
  let created = 0;
  let updated = 0;
  let errors = [];

  try {
    // Create sync log entry
    const { data: syncLog, error: logError } = await supabase
      .from('sync_logs')
      .insert({
        athlete_id: athleteId,
        sync_type: 'activities',
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to create sync log:', logError);
    }

    const syncLogId = syncLog?.id;

    // Fetch activities from Strava
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        const activities = await getActivities(perPage, page);

        if (!activities || activities.length === 0) {
          hasMore = false;
          break;
        }

        // Process each activity
        for (const activity of activities) {
          try {
            // Check if activity already exists
            const { data: existing, error: checkError } = await supabase
              .from('activities')
              .select('id, synced_at')
              .eq('strava_id', activity.id)
              .single();

            // If check fails due to RLS or other DB issues, log and skip this activity
            if (checkError && checkError.code !== 'PGRST116') {
              // PGRST116 means "not found" which is fine, but other errors are problematic
              errors.push(`Failed to check activity ${activity.id}: ${checkError.message}`);
              continue;
            }

            // Skip if exists and not forcing update
            if (existing && !forceUpdate) {
              synced++;
              continue;
            }

            // Prepare activity data
            const activityData = {
              strava_id: activity.id,
              athlete_id: athleteId,
              name: activity.name || null,
              type: activity.type || null,
              start_date: activity.start_date ? new Date(activity.start_date).toISOString() : null,
              start_date_local: activity.start_date_local ? new Date(activity.start_date_local).toISOString() : null,
              distance: activity.distance || null,
              moving_time: activity.moving_time || null,
              elapsed_time: activity.elapsed_time || null,
              total_elevation_gain: activity.total_elevation_gain || null,
              average_speed: activity.average_speed || null,
              max_speed: activity.max_speed || null,
              average_cadence: activity.average_cadence || null,
              average_watts: activity.average_watts || null,
              weighted_average_watts: activity.weighted_average_watts || null,
              kilojoules: activity.kilojoules || null,
              device_watts: activity.device_watts || null,
              has_heartrate: activity.has_heartrate || null,
              average_heartrate: activity.average_heartrate || null,
              max_heartrate: activity.max_heartrate || null,
              calories: activity.calories || null,
              description: activity.description || null,
              raw_data: activity, // Store full response
              synced_at: new Date().toISOString()
            };

            if (existing) {
              // Update existing activity
              const { error: updateError } = await supabase
                .from('activities')
                .update(activityData)
                .eq('strava_id', activity.id);

              if (updateError) {
                errors.push(`Failed to update activity ${activity.id}: ${updateError.message}`);
              } else {
                updated++;
                synced++;
              }
            } else {
              // Insert new activity
              const { error: insertError } = await supabase
                .from('activities')
                .insert(activityData);

              if (insertError) {
                errors.push(`Failed to insert activity ${activity.id}: ${insertError.message}`);
              } else {
                created++;
                synced++;
              }
            }
          } catch (activityError) {
            errors.push(`Error processing activity ${activity.id}: ${activityError.message}`);
          }
        }

        // If we got fewer activities than perPage, we've reached the end
        if (activities.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (pageError) {
        errors.push(`Error fetching page ${page}: ${pageError.message}`);
        hasMore = false;
      }
    }

    // Update sync log
    const status = errors.length > 0 && synced === 0 ? 'error' : errors.length > 0 ? 'partial' : 'success';
    
    if (syncLogId) {
      await supabase
        .from('sync_logs')
        .update({
          status,
          activities_synced: synced,
          activities_created: created,
          activities_updated: updated,
          error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
          completed_at: new Date().toISOString(),
          metadata: {
            total_errors: errors.length,
            pages_synced: page - 1
          }
        })
        .eq('id', syncLogId);
    }

    return {
      success: errors.length === 0 || synced > 0,
      synced,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err) {
    return {
      success: false,
      synced,
      created,
      updated,
      error: err.message
    };
  }
};

/**
 * Get the last sync time for an athlete
 * @param {number} athleteId - UUID of the athlete
 * @returns {Promise<Date|null>}
 */
export const getLastSyncTime = async (athleteId) => {
  try {
    const { data, error } = await supabase
      .from('sync_logs')
      .select('completed_at')
      .eq('athlete_id', athleteId)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return new Date(data.completed_at);
  } catch (err) {
    console.error('Error getting last sync time:', err);
    return null;
  }
};

/**
 * Check if sync is needed (e.g., if last sync was more than X hours ago)
 * @param {number} athleteId - UUID of the athlete
 * @param {number} hoursThreshold - Hours threshold (default: 1)
 * @returns {Promise<boolean>}
 */
export const shouldSync = async (athleteId, hoursThreshold = 1) => {
  const lastSync = await getLastSyncTime(athleteId);
  
  if (!lastSync) {
    return true; // Never synced, should sync
  }

  const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
  return hoursSinceSync >= hoursThreshold;
};

/**
 * Auto-sync activities in the background
 * This should be called periodically (e.g., every hour)
 * @param {number} stravaId - Strava athlete ID
 * @returns {Promise<{success: boolean, synced?: number, error?: string}>}
 */
export const autoSyncActivities = async (stravaId) => {
  try {
    // Check if we have an access token
    const token = getAccessToken();
    if (!token) {
      return {
        success: false,
        error: 'No access token found. Please authenticate with Strava first.'
      };
    }

    // Get athlete from database
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('strava_id', stravaId)
      .single();

    if (athleteError || !athlete) {
      return {
        success: false,
        error: `Athlete not found in database: ${athleteError?.message || 'Unknown error'}`
      };
    }

    // Check if sync is needed
    const needsSync = await shouldSync(athlete.id, 1); // Sync if last sync was > 1 hour ago
    if (!needsSync) {
      return {
        success: true,
        message: 'Sync not needed yet',
        synced: 0
      };
    }

    // Perform sync
    const result = await syncActivities(athlete.id, stravaId, {
      perPage: 200,
      maxPages: 5, // Sync last 1000 activities
      forceUpdate: false
    });

    return result;
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
};

