/**
 * Profile information extractor using Gemini AI
 * Analyzes chat messages to extract athlete profile information
 */

import { GoogleGenAI } from "@google/genai";
import { updateAthleteProfile } from './supabase';

// Get API key from environment variable
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Use fast model for profile extraction (simple task)
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Initialize Gemini client
 */
const getGeminiClient = () => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

/**
 * Analyzes a user message for profile information (injuries, environment, etc.)
 * @param {string} userMessage - The user's message to analyze
 * @param {Object} currentProfile - Current athlete profile data
 * @returns {Promise<{extracted: Object, hasData: boolean}>}
 */
export const extractProfileFromMessage = async (userMessage, currentProfile = {}) => {
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length < 10) {
    return { extracted: {}, hasData: false };
  }

  const prompt = `You are analyzing a user's message in a fitness coaching conversation to extract athlete profile information.

Current profile data:
${JSON.stringify({
  injuries: currentProfile.injuries || 'Not set',
  environment: currentProfile.environment || 'Not set'
}, null, 2)}

User message:
"${userMessage}"

Extract ONLY the following information if explicitly mentioned:
1. **Injuries**: Any mention of current or past injuries, pain, or physical limitations
2. **Environment**: Training environment details (terrain, weather, altitude, etc.)

Return a JSON object with this structure:
{
  "injuries": "extracted injury information or null if not mentioned",
  "environment": "extracted environment information or null if not mentioned",
  "hasData": true if any information was found, false otherwise
}

Rules:
- ONLY extract information that is EXPLICITLY stated by the user
- If the user doesn't mention injuries or environment, return null for those fields
- Combine with existing data if user is adding to previous information
- Be concise but preserve important details
- Return hasData: false if no relevant information found

Examples:

User: "I have a bad knee from a running injury last year"
Response: {"injuries": "Bad knee from running injury last year", "environment": null, "hasData": true}

User: "I usually train on hilly terrain"
Response: {"injuries": null, "environment": "Hilly terrain", "hasData": true}

User: "I recovered from plantar fasciitis and now run in a hot climate"
Response: {"injuries": "Recovered from plantar fasciitis", "environment": "Hot climate", "hasData": true}

User: "What should I eat before a run?"
Response: {"injuries": null, "environment": null, "hasData": false}`;

  try {
    const client = getGeminiClient();

    // Define JSON schema for structured output
    const jsonSchema = {
      type: 'object',
      properties: {
        injuries: {
          type: ['string', 'null'],
          description: 'Extracted injury information or null'
        },
        environment: {
          type: ['string', 'null'],
          description: 'Extracted environment information or null'
        },
        hasData: {
          type: 'boolean',
          description: 'Whether any profile information was found'
        }
      },
      required: ['injuries', 'environment', 'hasData']
    };

    // Call Gemini API with structured output
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.1
      }
    });

    // Extract and parse response
    let responseText = '';
    if (response.text) {
      responseText = response.text;
    } else if (response.response && response.response.text) {
      responseText = response.response.text();
    } else if (typeof response === 'string') {
      responseText = response;
    }

    if (responseText) {
      const extracted = JSON.parse(responseText);
      return {
        extracted: extracted,
        hasData: extracted.hasData || false
      };
    }

    return { extracted: {}, hasData: false };
  } catch (error) {
    console.error('Error extracting profile information:', error);
    return { extracted: {}, hasData: false };
  }
};

/**
 * Automatically updates athlete profile if profile information is detected in message
 * @param {string} userMessage - The user's message to analyze
 * @param {Object} currentProfile - Current athlete profile data
 * @returns {Promise<{updated: boolean, fields: Array}>}
 */
export const autoUpdateProfileFromMessage = async (userMessage, currentProfile = {}) => {
  const { extracted, hasData } = await extractProfileFromMessage(userMessage, currentProfile);

  if (!hasData) {
    return { updated: false, fields: [] };
  }

  const updates = {};
  const updatedFields = [];

  // Only update fields that have new data
  if (extracted.injuries && extracted.injuries !== currentProfile.injuries) {
    // Merge with existing injuries if both exist
    if (currentProfile.injuries) {
      updates.injuries = `${currentProfile.injuries}; ${extracted.injuries}`;
    } else {
      updates.injuries = extracted.injuries;
    }
    updatedFields.push('injuries');
  }

  if (extracted.environment && extracted.environment !== currentProfile.environment) {
    // Merge with existing environment if both exist
    if (currentProfile.environment) {
      updates.environment = `${currentProfile.environment}; ${extracted.environment}`;
    } else {
      updates.environment = extracted.environment;
    }
    updatedFields.push('environment');
  }

  if (Object.keys(updates).length === 0) {
    return { updated: false, fields: [] };
  }

  // Update profile with source='chat'
  const result = await updateAthleteProfile(updates, 'chat');

  if (result.error) {
    console.error('Failed to update profile:', result.error);
    return { updated: false, fields: [] };
  }

  console.log(`Auto-updated profile from chat: ${updatedFields.join(', ')}`);
  return { updated: true, fields: updatedFields };
};
