import { GoogleGenAI } from "@google/genai";
import { BASE_COACH_PROMPT } from "../prompts/prompts";
import { parseFlattenedTrainingPlan } from '../utils/parseTrainingPlan';

// Get API key from environment variable
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
console.log('API Key loaded:', GEMINI_API_KEY ? 'Yes' : 'No');

// Gemini model fallback chains - different models for different tasks
// For structured output (plan generation), use most capable models
const GEMINI_MODELS_STRUCTURED = [
  'gemini-2.5-pro',        // Primary - most capable, best for complex JSON
  'gemini-2.5-flash',      // Fallback 1 - fast, still good for JSON
  'gemini-2.5-flash-lite', // Fallback 2 - lightest, highest availability
];

// For conversational chat (non-structured), use faster models first
const GEMINI_MODELS_CHAT = [
  'gemini-2.5-flash',      // Primary - fast, great for conversation
  'gemini-2.5-pro',        // Fallback 1 - slower but more capable
  'gemini-2.5-flash-lite', // Fallback 2 - lightest, highest availability
];

const GEMINI_MODEL = GEMINI_MODELS_CHAT[0]; // Default to fast model
const MAX_RETRIES_PER_MODEL = 2;
const INITIAL_RETRY_DELAY_MS = 2000; // Start with 2 seconds
const MAX_RETRY_DELAY_MS = 15000;    // Max 15 seconds between retries

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate a summary of a training plan for the user
 */
const generatePlanSummary = (plan, isModification = false) => {
  if (!plan) return isModification 
    ? 'I\'ve updated the plan. Would you like to save these changes?'
    : 'Your training plan is ready! Would you like to save it?';
  
  const meta = plan.meta || {};
  const schedule = plan.schedule || [];
  
  // Extract running days from the first week
  const firstWeek = schedule[0];
  const runningDays = [];
  if (firstWeek?.days) {
    firstWeek.days.forEach(day => {
      if (day.workouts && day.workouts.length > 0) {
        const hasRun = day.workouts.some(w => 
          w.workout_type?.toLowerCase().includes('run') || 
          w.workout_description?.toLowerCase().includes('run')
        );
        if (hasRun) {
          runningDays.push(day.day_name || `Day ${day.day_index + 1}`);
        }
      }
    });
  }
  
  // Format dates
  const startDate = meta.start_date ? new Date(meta.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';
  
  let summary = isModification 
    ? '✅ **I\'ve updated your training plan!**\n\n'
    : '✅ **Your training plan is ready!**\n\n';
  
  summary += '**Plan overview:**\n';
  summary += `- **Name:** ${meta.plan_name || 'Training Plan'}\n`;
  summary += `- **Type:** ${meta.plan_type?.replace('_', ' ') || 'Training'}\n`;
  summary += `- **Duration:** ${meta.total_duration_weeks || schedule.length} weeks\n`;
  summary += `- **Start date:** ${startDate}\n`;
  
  if (runningDays.length > 0) {
    summary += `- **Training days:** ${runningDays.join(', ')}\n`;
  }
  
  // Add phases if available
  if (plan.periodization_overview?.phases?.length > 0) {
    summary += '\n**Training phases:**\n';
    plan.periodization_overview.phases.forEach(phase => {
      // Phases are stored as strings, not objects
      summary += `- ${phase}\n`;
    });
  }
  
  summary += isModification 
    ? '\nWould you like to **save** these changes, or should I make further adjustments?'
    : '\nWould you like to **save** this plan, or should I make any adjustments first?';
  
  return summary;
};

/**
 * Check if error is a retryable 503/overloaded error
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
 * Check if we should try the next model (overloaded, not found, etc.)
 */
const shouldTryNextModel = (error) => {
  const status = error?.status || error?.code;
  const message = error?.message || '';
  
  return (
    isRetryableError(error) ||
    status === 404 ||
    status === 'NOT_FOUND' ||
    message.includes('not found') ||
    message.includes('NOT_FOUND') ||
    message.includes('not supported')
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
        description: "Array of training weeks. WEEK ALIGNMENT RULES: 1) All weeks end on Sunday. 2) If start_date is not Monday, Week 1 is a partial week (starts on start_date, ends Sunday). 3) Weeks 2+ are full Monday-Sunday weeks. 4) Last week ends 1 day before goal date.",
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
                description: `FORMAT: day_name|day_index|is_rest_day|is_completed|activity_category|activity_title|total_duration_min|SEGMENTS

SEGMENTS FORMAT (use || between segments):
SEGMENT_TYPE:description,duration_value unit,Zone N

SEGMENT TYPES: WARMUP, MAIN, COOLDOWN, INTERVAL, RECOVERY

⚠️ EVERY RUN MUST HAVE 3+ SEGMENTS: WARMUP||MAIN||COOLDOWN

COPY THESE EXAMPLES EXACTLY:

REST: 'Monday|1|true|false|REST|Rest Day|0|'

EASY RUN: 'Tuesday|2|false|false|RUN|Easy Run|40|WARMUP:Easy jog,5 min,Zone 1||MAIN:Steady run,30 min,Zone 2||COOLDOWN:Walk,5 min,Zone 1'

TEMPO: 'Wednesday|3|false|false|RUN|Tempo|50|WARMUP:Jog,10 min,Zone 2||MAIN:Tempo pace,30 min,Zone 4||COOLDOWN:Jog,10 min,Zone 2'

LONG RUN: 'Sunday|7|false|false|RUN|Long Run|90|WARMUP:Easy,10 min,Zone 1||MAIN:Steady,70 min,Zone 2||COOLDOWN:Walk,10 min,Zone 1'`
              },
              description: "Array of days. CRITICAL: Use || to separate segments. Every run needs WARMUP||MAIN||COOLDOWN minimum."
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
        // Add context as a user message - make clear this is REAL synced data from their Strava account
        contents.push({
          role: 'user',
          parts: [{ text: `=== SYNCED STRAVA DATA ===
The following is REAL data synced from this athlete's Strava account to this app. This is NOT hypothetical - these are their actual workouts and stats:

${context}

You have direct access to this data. Use it to personalize your coaching.` }]
        });
        // Add a model response to acknowledge this is real synced data
        contents.push({
          role: 'model',
          parts: [{ text: 'I can see your synced Strava data above. I will use your actual training history, weekly averages, and workout details to personalize my recommendations. I won\'t ask you about information that\'s already visible in your Strava data.' }]
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

    // Determine if we should use structured output (for generate-plan step or plan modification)
    const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';
    const jsonSchema = useStructuredOutput ? getTrainingPlanJsonSchema() : null;

    // Select appropriate model chain based on task complexity
    const modelChain = useStructuredOutput ? GEMINI_MODELS_STRUCTURED : GEMINI_MODELS_CHAT;

    console.log('📋 Sequence step:', sequenceStep?.id || 'none');
    console.log('📋 Using structured output:', useStructuredOutput);
    console.log('📋 Model chain:', useStructuredOutput ? 'STRUCTURED (pro first)' : 'CHAT (flash first)');

    // Model fallback chain with retries per model
    let lastError;

    for (let modelIndex = 0; modelIndex < modelChain.length; modelIndex++) {
      const currentModel = modelChain[modelIndex];
      
      for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          if (modelIndex > 0 || attempt > 1) {
            console.log(`🔄 Trying ${currentModel} (model ${modelIndex + 1}/${modelChain.length}, attempt ${attempt}/${MAX_RETRIES_PER_MODEL})...`);
          }
          
          // Prepare config for structured output if needed
          const config = {};
          if (useStructuredOutput && jsonSchema) {
            config.responseMimeType = "application/json";
            config.responseJsonSchema = jsonSchema;
          }

          // Call Gemini API with system instruction
          const response = await client.models.generateContent({
            model: currentModel,
            contents: contents,
            systemInstruction: !hasSystemPrompt ? {
              parts: [{ text: systemPromptToUse }]
            } : undefined,
            config: Object.keys(config).length > 0 ? config : undefined,
          });

          // Extract text from response
          let responseText = '';
          if (response.text) {
            responseText = response.text;
          } else if (response.response && response.response.text) {
            responseText = response.response.text();
          } else if (typeof response === 'string') {
            responseText = response;
          }

          // Log success
          if (modelIndex > 0) {
            console.log(`✅ Success with fallback model: ${currentModel}`);
          } else if (attempt > 1) {
            console.log(`✅ Success on retry ${attempt}`);
          }

          // If using structured output, parse JSON and return separately from display text
          if (useStructuredOutput && responseText) {
            console.log('📋 Parsing structured output, response length:', responseText.length);
            console.log('📋 First 500 chars:', responseText.substring(0, 500));
            try {
              const planData = JSON.parse(responseText);
              console.log('✅ JSON parsed successfully, plan name:', planData.meta?.plan_name);
              
              // Debug: Check what format days are in
              if (planData.schedule?.[0]?.days?.[0]) {
                const firstDay = planData.schedule[0].days[0];
                console.log('🔍 First day type:', typeof firstDay);
                console.log('🔍 First day value:', typeof firstDay === 'string' ? firstDay.substring(0, 200) : JSON.stringify(firstDay).substring(0, 200));
              }
              
              const structuredPlan = parseFlattenedTrainingPlan(planData);
              
              // Debug: Check parsed structure
              if (structuredPlan.schedule?.[0]?.days?.[0]) {
                const parsedFirstDay = structuredPlan.schedule[0].days[0];
                console.log('🔍 Parsed first day segments:', parsedFirstDay.workout_structure?.length || 0);
                console.log('🔍 Segments:', JSON.stringify(parsedFirstDay.workout_structure || []));
              }
              
              // Generate appropriate message based on whether this is a new plan or modification
              const isModification = sequenceStep?.id === 'modify-plan';
              const displayText = generatePlanSummary(structuredPlan, isModification);
              
              return {
                text: displayText,
                planData: structuredPlan
              };
            } catch (parseError) {
              console.error('Error parsing structured output JSON:', parseError);
              console.error('Raw response:', responseText);
              return responseText;
            }
          }
          
          return responseText;
        } catch (error) {
          lastError = error;
          const errorMsg = error.message || String(error);
          console.log(`⚠️ ${currentModel} error:`, errorMsg.substring(0, 100));
          
          // Check if we should try again or move to next model
          if (shouldTryNextModel(error)) {
            // For retryable errors, retry same model with backoff
            if (isRetryableError(error) && attempt < MAX_RETRIES_PER_MODEL) {
              const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
              const jitter = Math.random() * 1000;
              const delay = Math.min(baseDelay + jitter, MAX_RETRY_DELAY_MS);
              console.log(`⏳ Waiting ${Math.round(delay/1000)}s before retry...`);
              await sleep(delay);
              continue;
            }


            // Move to next model if available
            if (modelIndex < modelChain.length - 1) {
              console.log(`➡️ Switching to ${modelChain[modelIndex + 1]}...`);
              break; // Break inner loop to try next model
            }
          }

          // Last model exhausted, throw error
          if (modelIndex === modelChain.length - 1) {
            throw new Error(`All Gemini models failed. Last error: ${errorMsg}`);
          }
        }
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
        // Add context as a user message - make clear this is REAL synced data from their Strava account
        contents.push({
          role: 'user',
          parts: [{ text: `=== SYNCED STRAVA DATA ===
The following is REAL data synced from this athlete's Strava account to this app. This is NOT hypothetical - these are their actual workouts and stats:

${context}

You have direct access to this data. Use it to personalize your coaching.` }]
        });
        // Add a model response to acknowledge this is real synced data
        contents.push({
          role: 'model',
          parts: [{ text: 'I can see your synced Strava data above. I will use your actual training history, weekly averages, and workout details to personalize my recommendations. I won\'t ask you about information that\'s already visible in your Strava data.' }]
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

    // Determine if we should use structured output (for generate-plan step or plan modification)
    const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';
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
          
          // Generate appropriate message based on whether this is a new plan or modification
          const isModification = sequenceStep?.id === 'modify-plan';
          const displayText = generatePlanSummary(structuredPlan, isModification);
          
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

