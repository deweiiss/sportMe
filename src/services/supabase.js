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

export default supabase;

