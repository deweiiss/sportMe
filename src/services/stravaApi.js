import axios from 'axios';

const STRAVA_BASE_URL = 'https://www.strava.com';
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strava_access_token',
  REFRESH_TOKEN: 'strava_refresh_token',
  ACTIVITIES: 'strava_activities',
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

    const { access_token, refresh_token } = response.data;
    
    // Store tokens in localStorage
    if (access_token) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token);
    }
    if (refresh_token) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
    }

    return response.data;
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
};

/**
 * Get access token from localStorage
 * @returns {string|null} Access token or null if not found
 */
export const getAccessToken = () => {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
};

/**
 * Get refresh token from localStorage
 * @returns {string|null} Refresh token or null if not found
 */
export const getRefreshToken = () => {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Clear all stored Strava data
 */
export const clearStravaData = () => {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.ACTIVITIES);
};

/**
 * Get authorization header for API requests
 * @returns {Object} Authorization header object
 */
const getAuthHeader = () => {
  const token = getAccessToken();
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
    const token = getAccessToken();
    if (!token) {
      throw new Error('No access token found');
    }

    const response = await axios.get(`${STRAVA_BASE_URL}/api/v3/athlete/activities`, {
      headers: getAuthHeader(),
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

