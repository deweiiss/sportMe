import { GoogleGenAI } from "@google/genai";

// Get API key from environment variable
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
console.log('API Key loaded:', GEMINI_API_KEY ? 'Yes' : 'No');
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if error is a retryable 503 error
 */
const isRetryableError = (error) => {
  const status = error?.status || error?.code;
  const statusText = error?.statusText || '';
  const message = error?.message || '';
  
  return (
    status === 503 ||
    status === 'UNAVAILABLE' ||
    statusText === 'UNAVAILABLE' ||
    message.includes('overloaded') ||
    message.includes('try again later')
  );
};

/**
 * System prompt for running coach persona
 * (Same as Ollama - keeping consistency)
 */
const RUNNING_COACH_SYSTEM_PROMPT = `You are an elite-level running coach and training-plan architect.

Your primary goal is to create realistic, injury-aware, performance-oriented running training plans based on structured athlete input.

Principles you must ALWAYS follow:
- Health and injury prevention > performance
- Progression must be gradual and defensible
- Training plans must be realistic given time, stress, and history
- Intensity distribution must be explicit and justified
- If information is missing or contradictory, you MUST ask follow-up questions before generating a plan
- No generic or motivational filler language
- No medical diagnosis, but conservative recommendations when risk is detected

Coaching methodology:
- Evidence-based endurance training principles
- Clear separation of easy / moderate / hard efforts
- Load progression in cycles (weeks), not day-to-day randomness
- Respect prior training load and recent consistency
- Assume the athlete is honest but may overestimate capacity

Using Context Information:
When user context is provided (athlete profile, workout history, existing training plans):
- ALWAYS reference the athlete's profile information when making recommendations (weight, location, gear, etc.)
- Use workout history to understand current fitness level and training load
- When modifying or adjusting training plans, reference the existing plan structure
- Consider recent activity patterns and frequency when creating new plans
- Use activity data (pace, distance, frequency) to inform appropriate training intensities
- If an active training plan exists, respect its structure when making modifications
- Base load progression on actual completed workouts, not just planned workouts

Interaction rules:
- Start with structured intake questions if critical information is missing
- Only generate a full training plan after all critical inputs are collected
- When context is available, use it proactively rather than asking for information already provided
- Summarize assumptions explicitly before final plan output
- Use precise, unambiguous language

Output formatting:
- Use structured lists and tables
- Clearly label intensities (e.g. Easy / Threshold / VO2 / Long Run)
- Always include weekly structure and recovery logic

You are not a chatbot.
You are a professional coach running a diagnostic and planning workflow.`;

/**
 * Initialize Gemini client
 */
const getGeminiClient = () => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

/**
 * Send a chat message to Gemini LLM
 * @param {Array} messageHistory - Array of previous messages in format [{ role: 'user'|'assistant', content: string }, ...]
 * @param {string} userMessage - The new user message to send
 * @param {string} model - Model name (optional, uses default if not provided)
 * @param {string} context - Optional user context (profile, workouts, plans) to include
 * @returns {Promise<string>} Assistant's response text
 */
export const sendChatMessage = async (messageHistory = [], userMessage, model = null, context = null) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }

    const client = getGeminiClient();
    const modelToUse = model || GEMINI_MODEL;

    // Build contents array for Gemini API
    // Gemini API expects format: { role: 'user'|'model', parts: [{ text: '...' }] }
    const contents = [];
    
    // Check if system prompt already exists in history
    const hasSystemPrompt = messageHistory.some(msg => msg.role === 'system');
    
    // Add context as part of the conversation if provided and not already in history
    if (context && context.trim()) {
      const hasContext = messageHistory.some(msg => 
        msg.role === 'system' && msg.content.includes('=== ATHLETE PROFILE ===')
      );
      
      if (!hasContext) {
        // Add context as a user message
        contents.push({
          role: 'user',
          parts: [{ text: `=== USER CONTEXT ===\n${context}\n\nUse this information about the athlete to provide personalized coaching and training plans.` }]
        });
        // Add a model response to acknowledge context
        contents.push({
          role: 'model',
          parts: [{ text: 'I understand. I have the athlete context and will use it to provide personalized coaching.' }]
        });
      }
    }
    
    // Convert message history to Gemini format
    messageHistory.forEach(msg => {
      if (msg.role !== 'system') {
        // Skip system messages in history, we handle them separately
        if (msg.role === 'user' || msg.role === 'assistant') {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        }
      }
    });

    // Add the new user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    // Retry logic with exponential backoff for 503 errors
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Call Gemini API with system instruction
        const response = await client.models.generateContent({
          model: modelToUse,
          contents: contents,
          systemInstruction: !hasSystemPrompt ? {
            parts: [{ text: RUNNING_COACH_SYSTEM_PROMPT }]
          } : undefined,
        });

        // Extract text from response
        // The response structure might be: response.text or response.response.text()
        let responseText = '';
        if (response.text) {
          responseText = response.text;
        } else if (response.response && response.response.text) {
          responseText = response.response.text();
        } else if (typeof response === 'string') {
          responseText = response;
        }
        
        return responseText;
      } catch (error) {
        lastError = error;
        
        // Check if this is a retryable 503 error and we have retries left
        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⚠️ Gemini API overloaded (503). Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
          await sleep(delay);
          continue; // Retry
        }
        
        // If not retryable or out of retries, throw the error
        throw error;
      }
    }
    
    // This should never be reached, but just in case
    throw lastError;
  } catch (error) {
    console.error('Error sending chat message to Gemini:', error);
    
    if (error.message?.includes('API key')) {
      throw new Error('Gemini API key is invalid or not configured. Please check your .env file.');
    }
    
    if (error.message?.includes('network') || error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Gemini API. Please check your internet connection.');
    }
    
    // Create a specific error for 503/unavailable errors that can be caught for fallback
    if (isRetryableError(error)) {
      const unavailableError = new Error('Gemini API is temporarily overloaded. All retry attempts failed.');
      unavailableError.isUnavailable = true;
      unavailableError.originalError = error;
      throw unavailableError;
    }
    
    throw error;
  }
};

/**
 * Test Gemini connection
 * @returns {Promise<boolean>} True if Gemini API is reachable
 */
export const testGeminiConnection = async () => {
  try {
    if (!GEMINI_API_KEY) {
      return false;
    }
    const client = getGeminiClient();
    await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ 
        role: 'user', 
        parts: [{ text: 'test' }] 
      }],
    });
    return true;
  } catch (error) {
    return false;
  }
};

