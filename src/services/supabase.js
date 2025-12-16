import { createClient } from '@supabase/supabase-js';
import { getAthlete as getAthleteFromStrava } from './stravaApi';

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
 * Get athlete profile data for the current authenticated user
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const getAthleteProfile = async () => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // Get the athlete profile for the current user
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (athleteError) {
      return { error: athleteError.message };
    }

    if (!athlete) {
      return { error: 'Athlete not found for this user' };
    }

    return { data: athlete };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Update athlete profile data for the current authenticated user
 * @param {Object} profileData - Profile data to update (all fields optional and nullable)
 * @param {string} profileData.firstname - First name
 * @param {string} profileData.lastname - Last name
 * @param {number} profileData.weight - Weight in kg
 * @param {string} profileData.city - City
 * @param {string} profileData.state - State
 * @param {string} profileData.country - Country
 * @param {string} profileData.sex - Gender ("M" or "F")
 * @param {string} profileData.birthday - Birthday (YYYY-MM-DD format)
 * @param {Array} profileData.bikes - Bikes array (JSONB)
 * @param {Array} profileData.shoes - Shoes array (JSONB)
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const updateAthleteProfile = async (profileData) => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // Prepare update data - only include fields that are provided
    // Convert empty strings to null to allow clearing fields
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (profileData.firstname !== undefined) {
      updateData.firstname = profileData.firstname || null;
    }
    if (profileData.lastname !== undefined) {
      updateData.lastname = profileData.lastname || null;
    }
    if (profileData.weight !== undefined) {
      updateData.weight = profileData.weight === '' || profileData.weight === null ? null : profileData.weight;
    }
    if (profileData.city !== undefined) {
      updateData.city = profileData.city || null;
    }
    if (profileData.state !== undefined) {
      updateData.state = profileData.state || null;
    }
    if (profileData.country !== undefined) {
      updateData.country = profileData.country || null;
    }
    if (profileData.sex !== undefined) {
      updateData.sex = profileData.sex || null;
    }
    if (profileData.birthday !== undefined) {
      updateData.birthday = profileData.birthday || null;
    }
    if (profileData.bikes !== undefined) {
      updateData.bikes = profileData.bikes && profileData.bikes.length > 0 ? profileData.bikes : null;
    }
    if (profileData.shoes !== undefined) {
      updateData.shoes = profileData.shoes && profileData.shoes.length > 0 ? profileData.shoes : null;
    }

    // Update the athlete profile
    const { data, error } = await supabase
      .from('athletes')
      .update(updateData)
      .eq('user_id', user.id)
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
 * Sync athlete profile from Strava API with selective update logic
 * - Only updates NULL/empty fields (preserves user edits)
 * - Always updates bikes and shoes arrays (gear section)
 * @returns {Promise<{data?: Object, error?: string}>}
 */
export const syncAthleteProfileFromStrava = async () => {
  try {
    // Get current authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    // Get current profile from database
    const { data: currentProfile, error: profileError } = await supabase
      .from('athletes')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      return { error: profileError.message };
    }

    if (!currentProfile) {
      return { error: 'No Strava account connected. Please connect your Strava account first.' };
    }

    // Fetch latest data from Strava API
    let stravaAthlete;
    try {
      stravaAthlete = await getAthleteFromStrava();
    } catch (stravaError) {
      // Provide more helpful error message for missing access token
      if (stravaError.message && stravaError.message.includes('No access token')) {
        return { error: 'Strava access token not found. Please reconnect your Strava account.' };
      }
      return { error: `Failed to fetch from Strava: ${stravaError.message}` };
    }

    // Prepare update data with selective merge logic
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Only update fields that are NULL/empty in database (preserve user edits)
    if (!currentProfile.firstname && stravaAthlete.firstname) {
      updateData.firstname = stravaAthlete.firstname;
    }
    if (!currentProfile.lastname && stravaAthlete.lastname) {
      updateData.lastname = stravaAthlete.lastname;
    }
    if ((currentProfile.weight === null || currentProfile.weight === undefined) && stravaAthlete.weight) {
      updateData.weight = stravaAthlete.weight;
    }
    if (!currentProfile.city && stravaAthlete.city) {
      updateData.city = stravaAthlete.city;
    }
    if (!currentProfile.state && stravaAthlete.state) {
      updateData.state = stravaAthlete.state;
    }
    if (!currentProfile.country && stravaAthlete.country) {
      updateData.country = stravaAthlete.country;
    }
    if (!currentProfile.sex && stravaAthlete.sex) {
      updateData.sex = stravaAthlete.sex;
    }
    if (!currentProfile.birthday && stravaAthlete.birthday) {
      updateData.birthday = stravaAthlete.birthday;
    }

    // Always update bikes and shoes (gear section) regardless of existing data
    // Always sync gear, even if empty arrays (to ensure we have latest data from Strava)
    // Handle cases where bikes/shoes might be undefined, null, or empty arrays
    // If they exist as arrays (even empty), use them; otherwise set to null
    const bikesData = (stravaAthlete.bikes !== undefined && stravaAthlete.bikes !== null)
      ? (Array.isArray(stravaAthlete.bikes) ? stravaAthlete.bikes : null)
      : null;
    const shoesData = (stravaAthlete.shoes !== undefined && stravaAthlete.shoes !== null)
      ? (Array.isArray(stravaAthlete.shoes) ? stravaAthlete.shoes : null)
      : null;
    
    // Always update gear (even if it's the same, to ensure we have latest data)
    updateData.bikes = bikesData;
    updateData.shoes = shoesData;

    // Log for debugging - log the raw Strava response too
    console.log('Syncing gear from Strava:', { 
      rawStravaBikes: stravaAthlete.bikes,
      rawStravaShoes: stravaAthlete.shoes,
      bikesData: bikesData,
      shoesData: shoesData,
      bikesCount: bikesData?.length || 0, 
      shoesCount: shoesData?.length || 0,
      bikesType: typeof stravaAthlete.bikes,
      shoesType: typeof stravaAthlete.shoes,
      isBikesArray: Array.isArray(stravaAthlete.bikes),
      isShoesArray: Array.isArray(stravaAthlete.shoes)
    });

    // Always update (gear is always synced, and we have updated_at)
    // Don't skip update even if only gear changed

    // Update the athlete profile
    console.log('Updating athlete profile with data:', updateData);
    const { data: updated, error: updateError } = await supabase
      .from('athletes')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating athlete profile:', updateError);
      return { error: updateError.message };
    }

    console.log('Athlete profile updated successfully:', {
      bikes: updated.bikes,
      shoes: updated.shoes,
      bikesType: typeof updated.bikes,
      shoesType: typeof updated.shoes
    });

    return { data: updated };
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

    // Get current date for active status calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Transform database format to frontend format
    const transformedPlans = (plans || []).map(plan => {
      const startDate = plan.start_date ? new Date(plan.start_date) : null;
      const endDate = plan.end_date ? new Date(plan.end_date) : null;
      
      // Calculate is_active: current date is between start_date and end_date (inclusive)
      let isActive = false;
      if (startDate && endDate) {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        isActive = today >= startDate && today <= endDate;
      }

      const transformed = {
        id: plan.id,
        planType: plan.plan_type,
        startDate: plan.start_date,
        endDate: plan.end_date,
        weeklyHours: plan.weekly_hours,
        createdAt: plan.created_at,
        updatedAt: plan.updated_at,
        isActive: isActive
      };

      // Include plan_data
      transformed.planData = plan.plan_data;

      return transformed;
    });

    return { data: transformedPlans };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Save or update a training plan for the current authenticated user
 * @param {Object} planData - Training plan data
 * @param {Object} planData.planData - Training plan in new format with meta, periodization_overview, and schedule
 * @param {string} planData.planType - Type of plan (optional, extracted from planData if not provided)
 * @param {string} planData.startDate - Start date (YYYY-MM-DD)
 * @param {string} planData.endDate - End date (YYYY-MM-DD)
 * @param {string} planData.weeklyHours - Weekly hours (optional)
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

    // Validate that planData.planData exists (new format is required)
    if (!planData.planData || !planData.planData.meta || !planData.planData.schedule) {
      return { error: 'Invalid plan data format. planData.planData with meta and schedule is required.' };
    }

    const newPlanData = planData.planData;
    
    // Prepare data for database
    const dbData = {
      athlete_id: athlete.id,
      plan_data: newPlanData,
      plan_type: newPlanData.meta?.plan_type || planData.planType || 'FITNESS',
      start_date: planData.startDate || newPlanData.meta?.start_date || new Date().toISOString().split('T')[0],
      end_date: planData.endDate,
      weekly_hours: planData.weeklyHours || null,
      updated_at: new Date().toISOString()
    };
    
    // Calculate end_date from schedule if not provided
    if (!dbData.end_date && newPlanData.schedule && newPlanData.schedule.length > 0) {
      const start = new Date(dbData.start_date);
      const weeks = newPlanData.schedule.length;
      start.setDate(start.getDate() + (weeks * 7) - 1);
      dbData.end_date = start.toISOString().split('T')[0];
    }

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
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      planData: result.plan_data
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
 * Calculate compliance and missed workouts for a training plan
 * @param {Object} planData - Training plan data with schedule array
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @param {Array} completedWorkouts - Array of completed workout dates (optional)
 * @returns {Object} Delta analysis with compliance, missed workouts, etc.
 */
export const calculatePlanDelta = (planData, currentDate, completedWorkouts = []) => {
  try {
    const schedule = planData.schedule || [];
    const currentDateObj = new Date(currentDate);
    
    // Find all workouts up to current date
    const pastWorkouts = [];
    const futureWorkouts = [];
    let totalPlanned = 0;
    let totalCompleted = 0;
    const missedWorkouts = [];

    schedule.forEach(week => {
      if (!week.days) return;
      
      week.days.forEach(day => {
        if (!day.is_rest_day && day.activity_category !== 'REST') {
          totalPlanned++;
          
          // Calculate day date (simplified - would need proper date calculation from start_date)
          // For now, we'll use day_index to approximate
          const dayDate = new Date(currentDateObj);
          dayDate.setDate(dayDate.getDate() + (day.day_index || 0) - 1);
          
          const dayDateStr = dayDate.toISOString().split('T')[0];
          
          if (dayDate <= currentDateObj) {
            pastWorkouts.push({
              date: dayDateStr,
              dayIndex: day.day_index,
              weekNumber: week.week_number,
              activityTitle: day.activity_title,
              isCompleted: day.is_completed || completedWorkouts.includes(dayDateStr)
            });
            
            if (day.is_completed || completedWorkouts.includes(dayDateStr)) {
              totalCompleted++;
            } else {
              missedWorkouts.push({
                date: dayDateStr,
                weekNumber: week.week_number,
                activityTitle: day.activity_title,
                activityCategory: day.activity_category
              });
            }
          } else {
            futureWorkouts.push({
              date: dayDateStr,
              dayIndex: day.day_index,
              weekNumber: week.week_number,
              activityTitle: day.activity_title
            });
          }
        }
      });
    });

    // Calculate compliance percentage (last 7 days)
    const sevenDaysAgo = new Date(currentDateObj);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentPlanned = pastWorkouts.filter(w => new Date(w.date) >= sevenDaysAgo).length;
    const recentCompleted = pastWorkouts.filter(w => 
      new Date(w.date) >= sevenDaysAgo && w.isCompleted
    ).length;
    
    const complianceLast7Days = recentPlanned > 0 
      ? Math.round((recentCompleted / recentPlanned) * 100) 
      : 100;

    // Overall compliance
    const overallCompliance = totalPlanned > 0 
      ? Math.round((totalCompleted / totalPlanned) * 100) 
      : 100;

    return {
      currentDate,
      totalPlanned,
      totalCompleted,
      overallCompliance: `${overallCompliance}%`,
      complianceLast7Days: `${complianceLast7Days}%`,
      missedWorkouts,
      pastWorkouts,
      futureWorkouts,
      nextWorkout: futureWorkouts.length > 0 ? futureWorkouts[0] : null
    };
  } catch (err) {
    console.error('Error calculating plan delta:', err);
    return {
      currentDate,
      totalPlanned: 0,
      totalCompleted: 0,
      overallCompliance: '0%',
      complianceLast7Days: '0%',
      missedWorkouts: [],
      pastWorkouts: [],
      futureWorkouts: [],
      nextWorkout: null,
      error: err.message
    };
  }
};

/**
 * Extract remaining schedule from a training plan starting from a specific date
 * @param {Object} planData - Full training plan data
 * @param {string} startDate - Date to start from (YYYY-MM-DD)
 * @returns {Object} Plan data with only remaining schedule
 */
export const getRemainingSchedule = (planData, startDate) => {
  try {
    const schedule = planData.schedule || [];
    const startDateObj = new Date(startDate);
    
    // Filter weeks and days that are on or after start date
    const remainingSchedule = schedule.map(week => {
      const remainingDays = (week.days || []).filter(day => {
        if (day.is_rest_day || day.activity_category === 'REST') {
          return true; // Keep rest days
        }
        
        // Calculate day date (simplified - would need proper date calculation)
        const dayDate = new Date(startDateObj);
        dayDate.setDate(dayDate.getDate() + (day.day_index || 0) - 1);
        
        return dayDate >= startDateObj;
      });
      
      return {
        ...week,
        days: remainingDays
      };
    }).filter(week => week.days.length > 0);

    return {
      ...planData,
      schedule: remainingSchedule
    };
  } catch (err) {
    console.error('Error extracting remaining schedule:', err);
    return planData;
  }
};

/**
 * Create execution summary for adaptation prompt
 * @param {Object} deltaAnalysis - Result from calculatePlanDelta
 * @param {string} userFeedback - User's feedback/reason
 * @returns {Object} Execution summary object
 */
export const createExecutionSummary = (deltaAnalysis, userFeedback = '') => {
  const missedCount = deltaAnalysis.missedWorkouts?.length || 0;
  const recentMissed = deltaAnalysis.missedWorkouts?.filter(w => {
    const workoutDate = new Date(w.date);
    const sevenDaysAgo = new Date(deltaAnalysis.currentDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return workoutDate >= sevenDaysAgo;
  }).length || 0;

  return {
    compliance: deltaAnalysis.complianceLast7Days,
    overallCompliance: deltaAnalysis.overallCompliance,
    missedWorkoutsCount: missedCount,
    recentMissedCount: recentMissed,
    missedWorkouts: deltaAnalysis.missedWorkouts?.slice(0, 5) || [], // Last 5 missed
    nextWorkout: deltaAnalysis.nextWorkout,
    reason: userFeedback || 'No reason provided',
    completedWorkouts: deltaAnalysis.totalCompleted,
    plannedWorkouts: deltaAnalysis.totalPlanned
  };
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
        // Skip plans that don't have the new format (planData)
        if (!plan.planData || !plan.planData.meta || !plan.planData.schedule) {
          console.log('Skipping plan without new format:', plan.planType);
          continue;
        }

        // Check if plan already exists (by checking createdAt and planType combination)
        // Since we don't have a unique constraint, we'll try to insert and handle duplicates
        const dbData = {
          athlete_id: athlete.id,
          plan_type: plan.planData.meta?.plan_type || plan.planType,
          start_date: plan.startDate || plan.planData.meta?.start_date,
          end_date: plan.endDate,
          weekly_hours: plan.weeklyHours || null,
          plan_data: plan.planData,
          created_at: plan.createdAt || plan.planData.meta?.created_at || new Date().toISOString(),
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

/**
 * Create a new chat session for the current user
 * @param {string} title
 */
export const createChatSession = async (title = 'New conversation') => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: 'User not authenticated' };

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title
      })
      .select()
      .single();

    if (error) return { error: error.message };

    return { data };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * List chat sessions for the current user ordered by last_updated desc
 */
export const listChatSessions = async (limit = 50) => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: 'User not authenticated' };

    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_updated', { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };
    return { data };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Delete a chat session and all its messages
 * @param {string} chatId
 */
export const deleteChatSession = async (chatId) => {
  if (!chatId) return { error: 'chatId is required' };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: 'User not authenticated' };

    // First delete all messages in the chat
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('chat_session_id', chatId);

    if (messagesError) {
      console.error('Error deleting chat messages:', messagesError);
      // Continue anyway to try deleting the session
    }

    // Then delete the chat session
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', chatId)
      .eq('user_id', user.id); // Ensure user owns this chat

    if (error) return { error: error.message };
    return { data: true };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Update chat session last_updated and optional title
 */
export const touchChatSession = async (chatId, title) => {
  if (!chatId) return { error: 'chatId is required' };
  try {
    const updates = { last_updated: new Date().toISOString() };
    if (title) updates.title = title;

    const { error } = await supabase
      .from('chat_sessions')
      .update(updates)
      .eq('id', chatId);

    if (error) return { error: error.message };
    return { data: true };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get chat history for a specific chat session
 */
export const getChatHistory = async (chatId, limit = 200) => {
  if (!chatId) return { error: 'chatId is required' };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (messagesError) {
      return { error: messagesError.message };
    }

    const transformedMessages = (messages || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at
    }));

    return { data: transformedMessages };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Save a single chat message for the current authenticated user
 */
export const saveChatMessage = async (role, content, chatId, titleUpdate = null) => {
  if (!chatId) return { error: 'chatId is required' };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        chat_id: chatId,
        role: role,
        content: content
      })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    // Update session timestamp and optional title
    await touchChatSession(chatId, titleUpdate || undefined);

    const transformedMessage = {
      id: data.id,
      role: data.role,
      content: data.content,
      createdAt: data.created_at
    };

    return { data: transformedMessage };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Batch save multiple chat messages for the current authenticated user
 */
export const saveChatMessages = async (messages, chatId, titleUpdate = null) => {
  if (!chatId) return { error: 'chatId is required' };
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { error: 'User not authenticated' };
    }

    const dbData = messages.map(msg => ({
      user_id: user.id,
      chat_id: chatId,
      role: msg.role,
      content: msg.content
    }));

    const { data, error } = await supabase
      .from('chat_messages')
      .insert(dbData)
      .select();

    if (error) {
      return { error: error.message };
    }

    await touchChatSession(chatId, titleUpdate || undefined);

    const transformedMessages = (data || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at
    }));

    return { data: transformedMessages };
  } catch (err) {
    return { error: err.message };
  }
};

export default supabase;

