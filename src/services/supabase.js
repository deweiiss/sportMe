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
 * Get or create athlete by Strava ID, linked to current authenticated user
 * @param {number} stravaId - Strava athlete ID
 * @param {Object} athleteData - Athlete data from Strava
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const getOrCreateAthlete = async (stravaId, athleteData = {}) => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // First, try to find existing athlete for this user
    const { data: existing, error: findError } = await supabase
      .from('athletes')
      .select('*')
      .eq('strava_id', stravaId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (findError) {
      console.error('Error finding existing athlete:', findError);
    }

    if (existing && !findError) {
      console.log('Found existing athlete:', existing.id);
      // Update tokens if provided
      if (athleteData.access_token || athleteData.refresh_token) {
        const { data: updated, error: updateError } = await supabase
          .from('athletes')
          .update({
            access_token: athleteData.access_token || existing.access_token,
            refresh_token: athleteData.refresh_token || existing.refresh_token,
            token_expires_at: athleteData.expires_at 
              ? new Date(athleteData.expires_at * 1000).toISOString()
              : existing.token_expires_at,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (updateError) {
          console.warn('Failed to update athlete tokens:', updateError);
        } else if (updated) {
          return { data: updated };
        }
      }
      
      return { data: existing };
    }

    // If not found, create new athlete linked to current user
    console.log('Creating new athlete for user:', { stravaId, userId: user.id });
    const { data: created, error: createError } = await supabase
      .from('athletes')
      .insert({
        strava_id: stravaId,
        user_id: user.id, // Link to authenticated user
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
      console.error('Failed to create athlete:', {
        error: createError,
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        stravaId,
        userId: user.id
      });
      return { error: createError.message };
    }

    console.log('✅ Athlete created successfully:', created.id);
    return { data: created };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Update athlete tokens for the current authenticated user
 * @param {number} stravaId - Strava athlete ID
 * @param {Object} tokenData - Token data
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const updateAthleteTokens = async (stravaId, tokenData) => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

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
      .eq('user_id', user.id) // Ensure we only update the current user's athlete
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
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    return { data };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get activities from Supabase for the current authenticated user
 * @param {number} stravaId - Strava athlete ID (optional, for backward compatibility)
 * @param {number} limit - Maximum number of activities to fetch (default: 100)
 * @param {number} offset - Offset for pagination (default: 0)
 * @returns {Promise<{data?: Array, error?: string}>}
 */
export const getActivitiesFromSupabase = async (stravaId = null, limit = 100, offset = 0) => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // Get the athlete UUID for the current user
    let athleteQuery = supabase
      .from('athletes')
      .select('id')
      .eq('user_id', user.id);
    
    // If stravaId provided, also filter by it (for backward compatibility)
    if (stravaId) {
      athleteQuery = athleteQuery.eq('strava_id', stravaId);
    }
    
    const { data: athlete, error: athleteError } = await athleteQuery.maybeSingle();

    if (athleteError || !athlete) {
      return { error: athleteError?.message || 'Athlete not found for this user' };
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

/**
 * Check if the current user has a Strava connection
 * @returns {Promise<{hasStrava: boolean, athlete?: Object, error?: string}>}
 */
export const checkUserStravaConnection = async () => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { hasStrava: false };
    }

    // Check if user has an athlete record
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (athleteError || !athlete) {
      return { hasStrava: false };
    }

    return { hasStrava: true, athlete };
  } catch (err) {
    return { hasStrava: false, error: err.message };
  }
};

/**
 * Delete all Strava data for the current user
 * This will delete the athlete record, which will cascade delete:
 * - All activities
 * - All sync logs
 * - All training plans
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteUserStravaData = async () => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Delete the athlete record (CASCADE will delete all related data)
    const { error: deleteError } = await supabase
      .from('athletes')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Get all training plans for the current authenticated user
 * @returns {Promise<{data?: Array, error?: string}>}
 */
export const getTrainingPlans = async () => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // Get the athlete UUID for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (athleteError || !athlete) {
      return { error: athleteError?.message || 'Athlete not found for this user' };
    }

    // Fetch training plans from Supabase
    const { data: plans, error: plansError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athlete.id)
      .order('created_at', { ascending: false });

    if (plansError) {
      return { error: plansError.message };
    }

    // Transform database format to frontend format
    const transformedPlans = (plans || []).map(plan => ({
      id: plan.id,
      planType: plan.plan_type,
      startDate: plan.start_date,
      endDate: plan.end_date,
      weeklyHours: plan.weekly_hours,
      weeks: {
        week1: plan.week1,
        week2: plan.week2,
        week3: plan.week3,
        week4: plan.week4
      },
      createdAt: plan.created_at,
      updatedAt: plan.updated_at
    }));

    return { data: transformedPlans };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Save or update a training plan for the current authenticated user
 * @param {Object} planData - Training plan data
 * @param {string} planData.planType - Type of plan ('ftp', 'base', 'vo2max')
 * @param {string} planData.startDate - Start date (YYYY-MM-DD)
 * @param {string} planData.endDate - End date (YYYY-MM-DD)
 * @param {string} planData.weeklyHours - Weekly hours (optional)
 * @param {Object} planData.weeks - Weeks object with week1-4
 * @param {string} planData.id - Plan ID for updates (optional, if not provided creates new)
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const saveTrainingPlan = async (planData) => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // Get the athlete UUID for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (athleteError || !athlete) {
      return { error: athleteError?.message || 'Athlete not found for this user' };
    }

    // Prepare data for database
    const dbData = {
      athlete_id: athlete.id,
      plan_type: planData.planType,
      start_date: planData.startDate,
      end_date: planData.endDate,
      weekly_hours: planData.weeklyHours || null,
      week1: planData.weeks.week1,
      week2: planData.weeks.week2,
      week3: planData.weeks.week3,
      week4: planData.weeks.week4,
      updated_at: new Date().toISOString()
    };

    let result;
    if (planData.id) {
      // Update existing plan
      const { data, error } = await supabase
        .from('training_plans')
        .update(dbData)
        .eq('id', planData.id)
        .eq('athlete_id', athlete.id) // Ensure user owns this plan
        .select()
        .single();

      if (error) {
        return { error: error.message };
      }
      result = data;
    } else {
      // Create new plan
      // Preserve createdAt if provided, otherwise use current time
      if (planData.createdAt) {
        dbData.created_at = planData.createdAt;
      }
      
      const { data, error } = await supabase
        .from('training_plans')
        .insert(dbData)
        .select()
        .single();

      if (error) {
        return { error: error.message };
      }
      result = data;
    }

    // Transform to frontend format
    const transformedPlan = {
      id: result.id,
      planType: result.plan_type,
      startDate: result.start_date,
      endDate: result.end_date,
      weeklyHours: result.weekly_hours,
      weeks: {
        week1: result.week1,
        week2: result.week2,
        week3: result.week3,
        week4: result.week4
      },
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };

    return { data: transformedPlan };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Delete a training plan for the current authenticated user
 * @param {string} planId - Plan ID to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteTrainingPlan = async (planId) => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get the athlete UUID for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (athleteError || !athlete) {
      return { success: false, error: athleteError?.message || 'Athlete not found for this user' };
    }

    // Delete the plan (RLS will ensure user can only delete their own plans)
    const { error: deleteError } = await supabase
      .from('training_plans')
      .delete()
      .eq('id', planId)
      .eq('athlete_id', athlete.id); // Ensure user owns this plan

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Migrate training plans from localStorage to database
 * This is a one-time migration helper that can be called on app initialization
 * @returns {Promise<{migrated: number, error?: string}>}
 */
export const migrateTrainingPlansFromLocalStorage = async () => {
  try {
    // Check if migration flag exists in localStorage
    const migrationFlag = localStorage.getItem('trainingPlans_migrated');
    if (migrationFlag === 'true') {
      return { migrated: 0, message: 'Migration already completed' };
    }

    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { migrated: 0, error: 'User not authenticated' };
    }

    // Get the athlete UUID for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (athleteError || !athlete) {
      return { migrated: 0, error: athleteError?.message || 'Athlete not found for this user' };
    }

    // Get plans from localStorage
    const storedPlans = localStorage.getItem('trainingPlans');
    if (!storedPlans) {
      // No plans to migrate, mark as done
      localStorage.setItem('trainingPlans_migrated', 'true');
      return { migrated: 0, message: 'No plans to migrate' };
    }

    let plans;
    try {
      plans = JSON.parse(storedPlans);
    } catch (parseError) {
      return { migrated: 0, error: 'Failed to parse localStorage plans' };
    }

    if (!Array.isArray(plans) || plans.length === 0) {
      localStorage.setItem('trainingPlans_migrated', 'true');
      return { migrated: 0, message: 'No plans to migrate' };
    }

    // Migrate each plan
    let migratedCount = 0;
    const errors = [];

    for (const plan of plans) {
      try {
        // Check if plan already exists (by checking createdAt and planType combination)
        // Since we don't have a unique constraint, we'll try to insert and handle duplicates
        const dbData = {
          athlete_id: athlete.id,
          plan_type: plan.planType,
          start_date: plan.startDate,
          end_date: plan.endDate,
          weekly_hours: plan.weeklyHours || null,
          week1: plan.weeks.week1,
          week2: plan.weeks.week2,
          week3: plan.weeks.week3,
          week4: plan.weeks.week4,
          created_at: plan.createdAt || new Date().toISOString(),
          updated_at: plan.updatedAt || new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('training_plans')
          .insert(dbData);

        if (insertError) {
          // If it's a duplicate or constraint error, skip it
          if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
            console.log('Plan already exists, skipping:', plan.planType, plan.createdAt);
            continue;
          }
          errors.push(insertError.message);
        } else {
          migratedCount++;
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    // Mark migration as complete
    if (migratedCount > 0 || errors.length === 0) {
      localStorage.setItem('trainingPlans_migrated', 'true');
      // Optionally remove old localStorage data after successful migration
      // localStorage.removeItem('trainingPlans');
    }

    return {
      migrated: migratedCount,
      total: plans.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err) {
    return { migrated: 0, error: err.message };
  }
};

export default supabase;

