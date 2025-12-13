import axios from 'axios';
import { getDefaultModel } from './ollamaApi';

// Default Ollama URL - can be configured via environment variable
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';

/**
 * Extract profile data from conversation history using LLM
 * @param {Array} conversationHistory - Array of messages in format [{ role: 'user'|'assistant', content: string }, ...]
 * @returns {Promise<Object>} Extracted profile data with profileFields and freeTextInfo
 */
export const extractProfileData = async (conversationHistory = []) => {
  try {
    // Get model to use
    const modelToUse = await getDefaultModel();

    // Build the conversation context for extraction
    const conversationText = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    // System prompt for extraction
    const systemPrompt = `You are a data extraction assistant. Your task is to analyze a conversation between a user and an assistant to extract structured information about the user.

Extract ONLY explicit information that is clearly stated in the conversation. Do not make assumptions or inferences.

Return a valid JSON object with the following structure:
{
  "profileFields": {
    "firstname": string or null,
    "lastname": string or null,
    "weight": number or null (in kg),
    "city": string or null,
    "state": string or null,
    "country": string or null,
    "sex": "M" or "F" or null,
    "birthday": string in YYYY-MM-DD format or null,
    "bikes": array of bike names/descriptions or null,
    "shoes": array of shoe names/descriptions or null
  },
  "freeTextInfo": [
    array of strings containing important information not directly mapping to profile fields
  ]
}

Rules:
- Only extract information explicitly mentioned in the conversation
- Use null for fields where no information was found
- For weight, extract numeric value in kg (e.g., if user says "70kg" or "70 kg", extract 70)
- For birthday, use YYYY-MM-DD format if full date is given, or null if incomplete
- For sex/gender, extract "M" or "F" only if explicitly stated
- For bikes and shoes, extract as arrays of names if mentioned

CRITICAL: freeTextInfo extraction rules:
- ONLY include information directly relevant to creating safe and effective training plans
- ONLY include:
  * Training-related: training history, preferences, goals, plans, workout patterns, training frequency, training load
  * Sport-related: running experience, race history, performance data, athletic background, PRs, race distances
  * Health-related: injuries, medical conditions, physical limitations, recovery needs, health constraints, pain points
- DO NOT include:
  * General conversation or casual chat
  * Personal details unrelated to training (hobbies, work details, family info unless they directly impact training availability)
  * Off-topic information
  * Small talk or social conversation
  * Information that does not help in creating or adjusting training plans

- Return ONLY valid JSON, no additional text or explanation`;

    // User prompt with conversation
    const userPrompt = `Analyze the following conversation and extract structured profile information:\n\n${conversationText}\n\nReturn the JSON object with extracted data.`;

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      stream: false,
      format: 'json' // Request JSON format if supported by the model
    });

    // Parse the response - handle both JSON format response and text response
    let extractedData;
    const responseContent = response.data.message.content;

    try {
      // Try to parse as JSON directly
      extractedData = JSON.parse(responseContent);
    } catch (parseError) {
      // If direct parse fails, try to extract JSON from markdown code blocks or text
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from LLM response');
      }
    }

    // Validate and normalize the extracted data structure
    const normalizedData = {
      profileFields: {
        firstname: extractedData.profileFields?.firstname || null,
        lastname: extractedData.profileFields?.lastname || null,
        weight: extractedData.profileFields?.weight ? parseFloat(extractedData.profileFields.weight) : null,
        city: extractedData.profileFields?.city || null,
        state: extractedData.profileFields?.state || null,
        country: extractedData.profileFields?.country || null,
        sex: extractedData.profileFields?.sex === 'M' || extractedData.profileFields?.sex === 'F' 
          ? extractedData.profileFields.sex 
          : null,
        birthday: extractedData.profileFields?.birthday || null,
        bikes: Array.isArray(extractedData.profileFields?.bikes) 
          ? extractedData.profileFields.bikes.filter(Boolean)
          : null,
        shoes: Array.isArray(extractedData.profileFields?.shoes)
          ? extractedData.profileFields.shoes.filter(Boolean)
          : null
      },
      freeTextInfo: Array.isArray(extractedData.freeTextInfo)
        ? extractedData.freeTextInfo.filter(Boolean)
        : []
    };

    // Remove null/empty fields from profileFields to keep output clean
    const cleanedProfileFields = {};
    Object.keys(normalizedData.profileFields).forEach(key => {
      const value = normalizedData.profileFields[key];
      if (value !== null && value !== undefined && value !== '' && 
          !(Array.isArray(value) && value.length === 0)) {
        cleanedProfileFields[key] = value;
      }
    });

    return {
      profileFields: cleanedProfileFields,
      freeTextInfo: normalizedData.freeTextInfo
    };

  } catch (error) {
    console.error('Error extracting profile data:', error);
    
    // Return empty structure on error
    return {
      profileFields: {},
      freeTextInfo: [],
      error: error.message
    };
  }
};

