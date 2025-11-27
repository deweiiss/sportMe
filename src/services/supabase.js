import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY; // For server-side operations

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please check your .env file.');
}

// Create Supabase client for client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create Supabase client with service role key for admin operations (use carefully!)
// This should only be used in secure server-side contexts
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Test Supabase connection
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const testConnection = async () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
      };
    }

    // Try to query a simple table to test connection
    const { data, error } = await supabase
      .from('athletes')
      .select('count')
      .limit(1);

    if (error) {
      // If table doesn't exist, that's okay - connection works
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          success: true,
          message: 'Connected to Supabase, but tables may not be created yet. Run the migration script first.'
        };
      }
      return {
        success: false,
        error: `Connection test failed: ${error.message}`
      };
    }

    return {
      success: true,
      message: 'Successfully connected to Supabase!'
    };
  } catch (err) {
    return {
      success: false,
      error: `Connection test error: ${err.message}`
    };
  }
};

/**
 * Get or create athlete by Strava ID
 * @param {number} stravaId - Strava athlete ID
 * @param {Object} athleteData - Athlete data from Strava
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const getOrCreateAthlete = async (stravaId, athleteData = {}) => {
  try {
    // First, try to find existing athlete
    const { data: existing, error: findError } = await supabase
      .from('athletes')
      .select('*')
      .eq('strava_id', stravaId)
      .single();

    if (existing && !findError) {
      return { data: existing };
    }

    // If not found, create new athlete
    // Note: This requires service role key or proper RLS policies
    const { data: created, error: createError } = await supabase
      .from('athletes')
      .insert({
        strava_id: stravaId,
        username: athleteData.username,
        firstname: athleteData.firstname,
        lastname: athleteData.lastname,
        profile_medium: athleteData.profile_medium,
        profile: athleteData.profile,
        access_token: athleteData.access_token || '',
        refresh_token: athleteData.refresh_token || '',
        token_expires_at: athleteData.expires_at 
          ? new Date(athleteData.expires_at * 1000).toISOString()
          : null
      })
      .select()
      .single();

    if (createError) {
      return { error: createError.message };
    }

    return { data: created };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Update athlete tokens
 * @param {number} stravaId - Strava athlete ID
 * @param {Object} tokenData - Token data
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const updateAthleteTokens = async (stravaId, tokenData) => {
  try {
    const { data, error } = await supabase
      .from('athletes')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenData.expires_at 
          ? new Date(tokenData.expires_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString()
      })
      .eq('strava_id', stravaId)
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    return { data };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get athlete by Strava ID
 * @param {number} stravaId - Strava athlete ID
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const getAthlete = async (stravaId) => {
  try {
    const { data, error } = await supabase
      .from('athletes')
      .select('*')
      .eq('strava_id', stravaId)
      .single();

    if (error) {
      return { error: error.message };
    }

    return { data };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get activities from Supabase for an athlete
 * @param {number} stravaId - Strava athlete ID
 * @param {number} limit - Maximum number of activities to fetch (default: 100)
 * @param {number} offset - Offset for pagination (default: 0)
 * @returns {Promise<{data?: Array, error?: string}>}
 */
export const getActivitiesFromSupabase = async (stravaId, limit = 100, offset = 0) => {
  try {
    // First, get the athlete UUID from Strava ID
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('strava_id', stravaId)
      .single();

    if (athleteError || !athlete) {
      return { error: athleteError?.message || 'Athlete not found' };
    }

    // Fetch activities from Supabase
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .eq('athlete_id', athlete.id)
      .order('start_date_local', { ascending: false })
      .range(offset, offset + limit - 1);

    if (activitiesError) {
      return { error: activitiesError.message };
    }

    // Transform Supabase data to match Strava API format
    // Map field names and ensure compatibility with existing frontend code
    const transformedActivities = (activities || []).map(activity => ({
      id: activity.strava_id, // Use strava_id as id for frontend compatibility
      name: activity.name,
      type: activity.type,
      start_date: activity.start_date,
      start_date_local: activity.start_date_local,
      distance: activity.distance ? parseFloat(activity.distance) : null,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      total_elevation_gain: activity.total_elevation_gain ? parseFloat(activity.total_elevation_gain) : null,
      average_speed: activity.average_speed ? parseFloat(activity.average_speed) : null,
      max_speed: activity.max_speed ? parseFloat(activity.max_speed) : null,
      average_cadence: activity.average_cadence ? parseFloat(activity.average_cadence) : null,
      average_watts: activity.average_watts ? parseFloat(activity.average_watts) : null,
      weighted_average_watts: activity.weighted_average_watts ? parseFloat(activity.weighted_average_watts) : null,
      kilojoules: activity.kilojoules ? parseFloat(activity.kilojoules) : null,
      device_watts: activity.device_watts,
      has_heartrate: activity.has_heartrate,
      average_heartrate: activity.average_heartrate ? parseFloat(activity.average_heartrate) : null,
      max_heartrate: activity.max_heartrate ? parseFloat(activity.max_heartrate) : null,
      calories: activity.calories,
      description: activity.description,
      // Include raw_data if available for any additional fields
      ...(activity.raw_data && typeof activity.raw_data === 'object' ? activity.raw_data : {})
    }));

    return { data: transformedActivities };
  } catch (err) {
    return { error: err.message };
  }
};

export default supabase;

