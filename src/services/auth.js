import { supabase } from './supabase';
import { clearStravaData } from './stravaApi';

/**
 * Sign up a new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{user?: Object, error?: string}>}
 */
export const signUp = async (email, password) => {
  try {
    // Clear any existing Strava data from localStorage for new user
    clearStravaData();
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined, // No email confirmation
      }
    });

    if (error) {
      return { error: error.message };
    }

    return { user: data.user };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Sign in an existing user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{user?: Object, error?: string}>}
 */
export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    return { user: data.user };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Sign out the current user and clear all local data
 * @returns {Promise<{error?: string}>}
 */
export const signOut = async () => {
  try {
    // Clear Strava data from localStorage
    clearStravaData();
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    return {};
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get the current authenticated user
 * @returns {Promise<{user?: Object, error?: string}>}
 */
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      return { error: error.message };
    }

    return { user };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Get the current session
 * @returns {Promise<{session?: Object, error?: string}>}
 */
export const getSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      return { error: error.message };
    }

    return { session };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Listen to authentication state changes
 * @param {Function} callback - Callback function that receives (event, session)
 * @returns {Function} Unsubscribe function
 */
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
};

