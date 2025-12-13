import { GoogleGenAI } from "@google/genai";
import { BASE_COACH_PROMPT } from "../prompts/prompts";
import { parseFlattenedTrainingPlan } from '../utils/parseTrainingPlan';

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
 * Generate JSON Schema for training plan structure (max 4 levels of nesting)
 * This schema is used with Gemini's structured output feature to guarantee valid JSON
 * Days are flattened to strings to stay within nesting limit
 * @returns {Object} JSON Schema object
 */
export const getTrainingPlanJsonSchema = () => {
  return {
    type: "object",
    properties: {
      meta: {
        type: "object",
        properties: {
          plan_id: { 
            type: "string", 
            description: "Unique identifier for the plan (UUID format)" 
          },
          plan_name: { 
            type: "string", 
            description: "Name of the training plan" 
          },
          plan_type: { 
            type: "string", 
            enum: ["BEGINNER", "FITNESS", "WEIGHT_LOSS", "COMPETITION"],
            description: "Type of training plan: BEGINNER (Einsteiger/Wiedereinstieg), FITNESS (Gesundheit/Fitness), WEIGHT_LOSS (Gewichtsmanagement), COMPETITION (Wettkampf-orientiert)"
          },
          athlete_level: { 
            type: "string", 
            enum: ["Novice", "Intermediate", "Advanced"],
            description: "Athlete's experience level: Novice (Neu dabei), Intermediate (Regelmäßiger Läufer), Advanced (Erfahren/Leistungsstark)"
          },
          total_duration_weeks: { 
            type: "integer", 
            description: "Total number of weeks in the training plan",
            minimum: 1
          },
          created_at: { 
            type: "string", 
            format: "date", 
            description: "Creation date in YYYY-MM-DD format" 
          },
          start_date: { 
            type: "string", 
            format: "date", 
            description: "Plan start date in YYYY-MM-DD format" 
          }
        },
        required: ["plan_name", "plan_type", "athlete_level", "total_duration_weeks", "start_date"]
      },
      periodization_overview: {
        type: "object",
        properties: {
          macrocycle_goal: { 
            type: "string", 
            description: "Overall goal of the training plan (e.g., 'Complete a sub-4 hour marathon')" 
          },
          phases: { 
            type: "array", 
            items: { type: "string" },
            description: "List of training phases (e.g., ['Base', 'Build', 'Peak', 'Taper'] for competition plans)",
            minItems: 1
          }
        },
        required: ["macrocycle_goal", "phases"]
      },
      schedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            week_number: { 
              type: "integer", 
              description: "Week number in the plan (1-based)",
              minimum: 1
            },
            phase_name: { 
              type: "string", 
              description: "Name of the current training phase" 
            },
            weekly_focus: { 
              type: "string", 
              description: "Focus or goal for this specific week" 
            },
            // Flatten days to array of strings to stay within 4 levels of nesting
            // Format: "day_name|day_index|is_rest_day|is_completed|activity_category|activity_title|total_duration_min|workout_segments"
            // workout_segments format: "SEGMENT_TYPE:description,duration_value duration_unit,Zone intensity_zone||SEGMENT_TYPE:description,..."
            // Use || to separate multiple segments within a day
            days: {
              type: "array",
              items: { 
                type: "string",
                description: "Day information in pipe-delimited format: 'day_name|day_index|is_rest_day|is_completed|activity_category|activity_title|total_duration_min|workout_segments'. For rest days, workout_segments is empty. Example: 'Monday|1|false|false|RUN|Easy Run|30|MAIN:Run easy pace,30 min,Zone 2'. Multiple segments separated by ||: 'WARMUP:5 min easy,5 min,Zone 1||MAIN:Run 20 min,20 min,Zone 2||COOLDOWN:5 min walk,5 min,Zone 1'"
              },
              description: "Array of days in the week. Each day is a pipe-delimited string containing: day name (Monday-Sunday), day index (1-7), is_rest_day (true/false), is_completed (true/false), activity category (RUN/WALK/STRENGTH/CROSS_TRAIN/REST/MOBILITY), activity title, duration in minutes, and workout segments (separated by ||, each segment: SEGMENT_TYPE:description,duration_value duration_unit,Zone intensity_zone)"
            }
          },
          required: ["week_number", "phase_name", "weekly_focus", "days"]
        },
        minItems: 1
      }
    },
    required: ["meta", "periodization_overview", "schedule"]
  };
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

    // Determine if we should use structured output (for generate-plan step)
    const useStructuredOutput = sequenceStep?.id === 'generate-plan';
    const jsonSchema = useStructuredOutput ? getTrainingPlanJsonSchema() : null;

    // Retry logic with exponential backoff for 503 errors
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Prepare config for structured output if needed
        const config = {};
        if (useStructuredOutput && jsonSchema) {
          config.responseMimeType = "application/json";
          config.responseJsonSchema = jsonSchema;
        }

        // Call Gemini API with system instruction
        const response = await client.models.generateContent({
          model: modelToUse,
          contents: contents,
          systemInstruction: !hasSystemPrompt ? {
            parts: [{ text: systemPromptToUse }]
          } : undefined,
          config: Object.keys(config).length > 0 ? config : undefined,
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

        // If using structured output, parse JSON and return separately from display text
        if (useStructuredOutput && responseText) {
          try {
            const planData = JSON.parse(responseText);
            // Parse flattened format to structured format
            const structuredPlan = parseFlattenedTrainingPlan(planData);
            // Return object with text (follow-up question only) and planData (for saving)
            return {
              text: 'Would you like to save this training plan, or would you like me to make any adjustments to it?',
              planData: structuredPlan
            };
          } catch (parseError) {
            console.error('Error parsing structured output JSON:', parseError);
            console.error('Raw response:', responseText);
            // Fallback: return raw response (shouldn't happen with structured output, but handle gracefully)
            return responseText;
          }
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
 * Send a chat message to Gemini LLM with streaming support
 * @param {Array} messageHistory - Array of previous messages in format [{ role: 'user'|'assistant', content: string }, ...]
 * @param {string} userMessage - The new user message to send
 * @param {Function} onChunk - Callback function called with each chunk of text as it arrives
 * @param {string} model - Model name (optional, uses default if not provided)
 * @param {string} context - Optional user context (profile, workouts, plans) to include
 * @param {Object} sequenceStep - Optional sequence step configuration
 * @returns {Promise<string>} Full assistant's response text
 */
export const sendChatMessageStreaming = async (
  messageHistory = [],
  userMessage,
  onChunk = null,
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

    // Build contents array for Gemini API (same as non-streaming)
    const contents = [];
    
    const hasSystemPrompt = messageHistory.some(msg => msg.role === 'system');
    
    if (context && context.trim()) {
      const hasContext = messageHistory.some(msg => 
        msg.role === 'system' && msg.content.includes('=== ATHLETE PROFILE ===')
      );
      
      if (!hasContext) {
        contents.push({
          role: 'user',
          parts: [{ text: `=== USER CONTEXT ===\n${context}\n\nUse this information about the athlete to provide personalized coaching and training plans.` }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'I understand. I have the athlete context and will use it to provide personalized coaching.' }]
        });
      }
    }
    
    messageHistory.forEach(msg => {
      if (msg.role !== 'system') {
        if (msg.role === 'user' || msg.role === 'assistant') {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        }
      }
    });

    const combinedUserMessage = sequenceStep?.userPrompt
      ? `${sequenceStep.userPrompt}\n\n${userMessage || ''}`.trim()
      : userMessage;

    contents.push({
      role: 'user',
      parts: [{ text: combinedUserMessage }]
    });

    // Determine if we should use structured output (for generate-plan step)
    const useStructuredOutput = sequenceStep?.id === 'generate-plan';
    const jsonSchema = useStructuredOutput ? getTrainingPlanJsonSchema() : null;

    // Prepare config for structured output if needed
    const config = {};
    if (useStructuredOutput && jsonSchema) {
      config.responseMimeType = "application/json";
      config.responseJsonSchema = jsonSchema;
    }

    // Note: Streaming with structured output may not be supported by all models
    // If structured output is required, we'll accumulate the full response first
    let fullText = '';
    
    try {
      // Call streaming API
      const response = await client.models.streamGenerateContent({
        model: modelToUse,
        contents: contents,
        systemInstruction: !hasSystemPrompt ? {
          parts: [{ text: systemPromptToUse }]
        } : undefined,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      // Stream chunks
      for await (const chunk of response) {
        const chunkText = chunk.text || '';
        fullText += chunkText;
        if (onChunk && typeof onChunk === 'function') {
          onChunk(chunkText);
        }
      }

      // If using structured output, parse JSON and return separately from display text
      if (useStructuredOutput && fullText) {
        try {
          const planData = JSON.parse(fullText);
          // Parse flattened format to structured format
          const structuredPlan = parseFlattenedTrainingPlan(planData);
          const displayText = 'Would you like to save this training plan, or would you like me to make any adjustments to it?';
          
          // If we have an onChunk callback, send the display text as a final chunk
          if (onChunk) {
            // Send the display text (follow-up question) as the final chunk
            onChunk(displayText);
          }
          
          // Return object with text and planData
          return {
            text: displayText,
            planData: structuredPlan
          };
        } catch (parseError) {
          console.error('Error parsing structured output JSON in streaming:', parseError);
          return fullText;
        }
      }

      return fullText;
    } catch (streamError) {
      // If streaming fails and we're using structured output, fall back to non-streaming
      if (useStructuredOutput) {
        console.warn('Streaming failed with structured output, falling back to non-streaming:', streamError);
        return await sendChatMessage(messageHistory, userMessage, model, context, sequenceStep);
      }
      throw streamError;
    }
  } catch (error) {
    console.error('Error sending streaming chat message to Gemini:', error);
    
    if (error.message?.includes('API key')) {
      throw new Error('Gemini API key is invalid or not configured. Please check your .env file.');
    }
    
    if (error.message?.includes('network') || error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Gemini API. Please check your internet connection.');
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

