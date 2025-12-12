import { GoogleGenAI } from "@google/genai";
import { BASE_COACH_PROMPT } from "../prompts/prompts";

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
const RUNNING_COACH_SYSTEM_PROMPT = BASE_COACH_PROMPT;

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
export const sendChatMessage = async (
  messageHistory = [],
  userMessage,
  model = null,
  context = null,
  sequenceStep = null
) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }

    const client = getGeminiClient();
    const modelToUse = model || GEMINI_MODEL;
    const systemPromptToUse = sequenceStep?.systemPrompt || RUNNING_COACH_SYSTEM_PROMPT;

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

    // Add the new user message (include sequence user prompt prefix if provided)
    const combinedUserMessage = sequenceStep?.userPrompt
      ? `${sequenceStep.userPrompt}\n\n${userMessage || ''}`.trim()
      : userMessage;

    contents.push({
      role: 'user',
      parts: [{ text: combinedUserMessage }]
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
            parts: [{ text: systemPromptToUse }]
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

