import axios from 'axios';

// Default Ollama URL - can be configured via environment variable
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';

/**
 * Generate a training plan using Ollama
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

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: 'You are an expert cycling coach specializing in structured training plans for FTP (Functional Threshold Power) improvements, base building, VO2max training, and endurance training. Provide detailed, science-based training recommendations.'
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
const getDefaultModel = async () => {
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

