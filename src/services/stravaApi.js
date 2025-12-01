import axios from 'axios';
import { getOrCreateAthlete, updateAthleteTokens } from './supabase';

const STRAVA_BASE_URL = 'https://www.strava.com';
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strava_access_token',
  REFRESH_TOKEN: 'strava_refresh_token',
  TOKEN_EXPIRES_AT: 'strava_token_expires_at',
  ACTIVITIES: 'strava_activities',
  STRAVA_ATHLETE_ID: 'strava_athlete_id',
};

/**
 * Exchange authorization code for access token
 * @param {string} code - Authorization code from Strava OAuth callback
 * @returns {Promise<Object>} Token response with access_token and refresh_token
 */
export const exchangeCodeForToken = async (code) => {
  try {
    const response = await axios.post(`${STRAVA_BASE_URL}/oauth/token`, {
      client_id: import.meta.env.VITE_STRAVA_CLIENT_ID,
      client_secret: import.meta.env.VITE_STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, athlete, expires_at } = response.data;
    
    // Calculate expiration timestamp (expires_at is seconds since epoch)
    const expiresAtTimestamp = expires_at ? expires_at * 1000 : null;
    
    // Store tokens in localStorage
    if (access_token) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token);
    }
    if (refresh_token) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
    }
    if (expiresAtTimestamp) {
      localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, expiresAtTimestamp.toString());
    }
    if (athlete?.id) {
      localStorage.setItem(STORAGE_KEYS.STRAVA_ATHLETE_ID, athlete.id.toString());
    }

    // Save athlete to Supabase
    if (athlete?.id) {
      try {
        await getOrCreateAthlete(athlete.id, {
          ...athlete,
          access_token,
          refresh_token,
          expires_at
        });
      } catch (dbError) {
        console.warn('Failed to save athlete to database:', dbError);
        // Don't fail the auth flow if DB save fails
      }
    }

    return response.data;
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
};

/**
 * Check if the access token is expired or about to expire
 * @param {number} bufferSeconds - Buffer time in seconds before expiration (default: 300 = 5 minutes)
 * @returns {boolean} True if token is expired or will expire soon
 */
export const isTokenExpired = (bufferSeconds = 300) => {
  const expiresAt = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  if (!expiresAt) {
    return true; // No expiration time stored, assume expired
  }
  
  const expiresAtTime = parseInt(expiresAt, 10);
  const now = Date.now();
  const buffer = bufferSeconds * 1000;
  
  return now >= (expiresAtTime - buffer);
};

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<{access_token?: string, refresh_token?: string, expires_at?: number, error?: string}>}
 */
export const refreshAccessToken = async () => {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return { error: 'No refresh token found' };
    }

    const response = await axios.post(`${STRAVA_BASE_URL}/oauth/token`, {
      client_id: import.meta.env.VITE_STRAVA_CLIENT_ID,
      client_secret: import.meta.env.VITE_STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const { access_token, refresh_token, expires_at } = response.data;
    
    // Calculate expiration timestamp
    const expiresAtTimestamp = expires_at ? expires_at * 1000 : null;
    
    // Update tokens in localStorage
    if (access_token) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token);
    }
    if (refresh_token) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
    }
    if (expiresAtTimestamp) {
      localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, expiresAtTimestamp.toString());
    }

    // Update tokens in Supabase
    const stravaId = getStravaAthleteId();
    if (stravaId) {
      try {
        await updateAthleteTokens(stravaId, {
          access_token,
          refresh_token,
          expires_at
        });
      } catch (dbError) {
        console.warn('Failed to update tokens in database:', dbError);
        // Don't fail if DB update fails
      }
    }

    return {
      access_token,
      refresh_token,
      expires_at
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return { error: error.response?.data?.message || error.message || 'Failed to refresh token' };
  }
};

/**
 * Get access token from localStorage, refreshing if expired
 * @param {boolean} autoRefresh - Whether to automatically refresh if expired (default: true)
 * @returns {Promise<string|null>} Access token or null if not found
 */
export const getAccessToken = async (autoRefresh = true) => {
  const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  
  if (!token) {
    return null;
  }

  // Check if token is expired and refresh if needed
  if (autoRefresh && isTokenExpired()) {
    console.log('Access token expired, refreshing...');
    const refreshResult = await refreshAccessToken();
    
    if (refreshResult.error) {
      console.error('Failed to refresh token:', refreshResult.error);
      return null; // Return null if refresh fails
    }
    
    return refreshResult.access_token || null;
  }

  return token;
};

/**
 * Get refresh token from localStorage
 * @returns {string|null} Refresh token or null if not found
 */
export const getRefreshToken = () => {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Get Strava athlete ID from localStorage
 * @returns {number|null} Athlete ID or null if not found
 */
export const getStravaAthleteId = () => {
  const id = localStorage.getItem(STORAGE_KEYS.STRAVA_ATHLETE_ID);
  return id ? parseInt(id, 10) : null;
};

/**
 * Clear all stored Strava data
 */
export const clearStravaData = () => {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  localStorage.removeItem(STORAGE_KEYS.ACTIVITIES);
  localStorage.removeItem(STORAGE_KEYS.STRAVA_ATHLETE_ID);
};

/**
 * Get authorization header for API requests
 * @returns {Promise<Object>} Authorization header object
 */
const getAuthHeader = async () => {
  const token = await getAccessToken(true); // Auto-refresh if expired
  if (!token) {
    throw new Error('No access token found');
  }
  return {
    Authorization: `Bearer ${token}`,
  };
};

/**
 * Fetch athlete activities from Strava API
 * @param {number} perPage - Number of activities per page (default: 30, max: 200)
 * @param {number} page - Page number (default: 1)
 * @returns {Promise<Array>} Array of activity objects
 */
export const getActivities = async (perPage = 30, page = 1) => {
  try {
    const headers = await getAuthHeader();
    
    const response = await axios.get(`${STRAVA_BASE_URL}/api/v3/athlete/activities`, {
      headers,
      params: {
        per_page: perPage,
        page: page,
      },
    });

    const activities = response.data;
    
    // Store activities in localStorage
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(activities));

    return activities;
  } catch (error) {
    console.error('Error fetching activities:', error);
    throw error;
  }
};

/**
 * Get stored activities from localStorage
 * @returns {Array} Array of activity objects or empty array
 */
export const getStoredActivities = () => {
  const stored = localStorage.getItem(STORAGE_KEYS.ACTIVITIES);
  return stored ? JSON.parse(stored) : [];
};

