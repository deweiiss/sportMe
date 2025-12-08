import axios from 'axios';

// Default Ollama URL - can be configured via environment variable
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';

/**
 * System prompt for running coach persona
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
 * Generate a training plan using Ollama
 * @deprecated Use sendChatMessage instead. This function is kept for backward compatibility.
 * @param {string} prompt - User's prompt/question
 * @param {string} model - Ollama model name (optional, will auto-detect if not provided)
 * @param {Array} context - Optional context (e.g., user's activity data)
 * @returns {Promise<string>} Generated training plan
 */
export const generateTrainingPlan = async (prompt, model = null, context = null) => {
  try {
    // Use prompt directly without activities context
    const fullPrompt = prompt;

    // Get model to use (auto-detect if not provided)
    const modelToUse = model || await getDefaultModel();
    // SYSTEM PROMPT
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: RUNNING_COACH_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      stream: false
    });

    return response.data.message.content;
  } catch (error) {
    console.error('Error generating training plan:', error);
    
    if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
      throw new Error('Cannot connect to Ollama. Make sure Ollama is running on your machine.');
    }
    
    throw error;
  }
};

/**
 * Send a chat message to Ollama LLM
 * @param {Array} messageHistory - Array of previous messages in format [{ role: 'user'|'assistant', content: string }, ...]
 * @param {string} userMessage - The new user message to send
 * @param {string} model - Ollama model name (optional, will auto-detect if not provided)
 * @param {string} context - Optional user context (profile, workouts, plans) to include
 * @returns {Promise<string>} Assistant's response text
 */
export const sendChatMessage = async (messageHistory = [], userMessage, model = null, context = null) => {
  try {
    // Get model to use (auto-detect if not provided)
    const modelToUse = model || await getDefaultModel();

    // Build messages array for Ollama API
    // Check if system prompt already exists in history
    const hasSystemPrompt = messageHistory.some(msg => msg.role === 'system');
    
    const messages = [];
    
    // Add system prompt if not already in history
    if (!hasSystemPrompt) {
      messages.push({
        role: 'system',
        content: RUNNING_COACH_SYSTEM_PROMPT
      });
    }
    
    // Add context as a system message if provided and not already in history
    if (context && context.trim()) {
      const hasContext = messageHistory.some(msg => 
        msg.role === 'system' && msg.content.includes('=== ATHLETE PROFILE ===')
      );
      
      if (!hasContext) {
        messages.push({
          role: 'system',
          content: `=== USER CONTEXT ===\n${context}\n\nUse this information about the athlete to provide personalized coaching and training plans.`
        });
      }
    }
    
    // Convert message history to Ollama format (excluding system if we just added it)
    messageHistory.forEach(msg => {
      if (msg.role !== 'system' || hasSystemPrompt) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    // Add the new user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: modelToUse,
      messages: messages,
      stream: false
    });

    return response.data.message.content;
  } catch (error) {
    console.error('Error sending chat message:', error);
    
    if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
      throw new Error('Cannot connect to Ollama. Make sure Ollama is running on your machine.');
    }
    
    throw error;
  }
};

/**
 * Get list of available Ollama models
 * @returns {Promise<Array>} Array of model names
 */
export const getAvailableModels = async () => {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
    return response.data.models.map(model => model.name);
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    throw error;
  }
};

/**
 * Get default model (first available model or a specific one)
 * @returns {Promise<string>} Model name
 */
export const getDefaultModel = async () => {
  try {
    const models = await getAvailableModels();
    // You can specify your preferred model here
    const preferredModel = import.meta.env.VITE_OLLAMA_MODEL || 'llama3';
    
    // Check if preferred model exists, otherwise use first available
    const modelExists = models.find(m => m.includes(preferredModel));
    return modelExists || models[0] || 'llama3';
  } catch (error) {
    // Fallback to a common model name
    return 'llama3';
  }
};

/**
 * Test Ollama connection
 * @returns {Promise<boolean>} True if Ollama is reachable
 */
export const testOllamaConnection = async () => {
  try {
    await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
};

