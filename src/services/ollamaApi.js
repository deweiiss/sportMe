import axios from 'axios';
import { BASE_COACH_PROMPT } from '../prompts/prompts';

// Default Ollama URL - can be configured via environment variable
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';

/**
 * System prompt for running coach persona
 */
const RUNNING_COACH_SYSTEM_PROMPT = BASE_COACH_PROMPT;

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
export const sendChatMessage = async (
  messageHistory = [],
  userMessage,
  model = null,
  context = null,
  sequenceStep = null
) => {
  try {
    // Get model to use (auto-detect if not provided)
    const modelToUse = model || await getDefaultModel();

    // Build messages array for Ollama API
    // Check if system prompt already exists in history
    const hasSystemPrompt = messageHistory.some(msg => msg.role === 'system');
    const systemPromptToUse = sequenceStep?.systemPrompt || RUNNING_COACH_SYSTEM_PROMPT;
    
    const messages = [];
    
    // Add system prompt if not already in history
    if (!hasSystemPrompt) {
      messages.push({
        role: 'system',
        content: systemPromptToUse
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
    const combinedUserMessage = sequenceStep?.userPrompt
      ? `${sequenceStep.userPrompt}\n\n${userMessage || ''}`.trim()
      : userMessage;

    messages.push({
      role: 'user',
      content: combinedUserMessage
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

