/**
 * Extract training plan JSON from text/markdown response
 * Looks for JSON code blocks or raw JSON objects matching the training plan schema
 * @param {string} text - The text to search for JSON
 * @returns {Object|null} - Parsed training plan object or null if not found/invalid
 */
export const extractTrainingPlanJSON = (text) => {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // First, try to find JSON in code blocks (```json ... ```)
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    let jsonString = null;

    // Try to find JSON in code blocks
    while ((match = codeBlockRegex.exec(text)) !== null) {
      jsonString = match[1];
      break; // Take the first match
    }

    // If no code block found, try to find raw JSON object
    if (!jsonString) {
      // Look for JSON object starting with { and containing "meta" and "schedule"
      const jsonObjectRegex = /\{[\s\S]*?"meta"[\s\S]*?"schedule"[\s\S]*?\}/;
      const objectMatch = text.match(jsonObjectRegex);
      if (objectMatch) {
        jsonString = objectMatch[0];
      }
    }

    if (!jsonString) {
      console.log('No JSON found in response text');
      return null;
    }

    // Parse the JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Error parsing extracted JSON string:', parseError);
      console.error('Extracted JSON string (first 500 chars):', jsonString.substring(0, 500));
      return null;
    }

    // Validate that it matches the training plan schema
    if (isValidTrainingPlan(parsed)) {
      console.log('Successfully extracted and validated training plan JSON');
      return parsed;
    }

    console.warn('Extracted JSON does not match training plan schema structure');
    return null;
  } catch (error) {
    console.error('Error extracting training plan JSON:', error);
    return null;
  }
};

/**
 * Validate that an object matches the training plan schema structure
 * @param {Object} obj - Object to validate
 * @returns {boolean} - True if valid training plan structure
 */
const isValidTrainingPlan = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // Check for required top-level fields
  if (!obj.meta || typeof obj.meta !== 'object') {
    return false;
  }

  if (!obj.schedule || !Array.isArray(obj.schedule)) {
    return false;
  }

  // Check meta has required fields
  if (!obj.meta.plan_name || !obj.meta.plan_type || !obj.meta.start_date) {
    return false;
  }

  // Check schedule has at least one week
  if (obj.schedule.length === 0) {
    return false;
  }

  // Check first week has days array
  if (!obj.schedule[0].days || !Array.isArray(obj.schedule[0].days)) {
    return false;
  }

  return true;
};

