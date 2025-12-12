import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { sendChatMessage as sendOllamaMessage } from '../services/ollamaApi';
import { sendChatMessage as sendGeminiMessage } from '../services/geminiApi';
import { getChatHistory, saveChatMessage } from '../services/supabase';
import { extractProfileData } from '../services/profileExtraction';
import { getUserContext } from '../services/contextRetrieval';

const ChatPanel = ({ width = 320 }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [userContext, setUserContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    // Load from localStorage, default to 'gemini'
    const saved = localStorage.getItem('chatModel');
    const model = saved || 'gemini';
    console.log('🔧 Initializing selectedModel from localStorage:', saved, '→ using:', model);
    return model;
  });

  // Save model preference when it changes
  useEffect(() => {
    console.log('💾 Saving model preference to localStorage:', selectedModel);
    localStorage.setItem('chatModel', selectedModel);
  }, [selectedModel]);

  // Load chat history on component mount
  useEffect(() => {
    loadChatHistory();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      const { data, error } = await getChatHistory();
      if (error) {
        console.error('Error loading chat history:', error);
        return;
      }
      if (data) {
        setMessages(data);
      }
    } catch (err) {
      console.error('Error loading chat history:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Check if message needs context based on keywords
  const needsContext = (message) => {
    if (!message || typeof message !== 'string') return false;
    const lowerMessage = message.toLowerCase();
    const contextKeywords = [
      'plan', 'training', 'workout', 'adjust', 'modify', 'change', 'update',
      'create', 'new plan', 'training plan', 'schedule', 'program',
      'my workouts', 'my activities', 'past runs', 'previous',
      'based on', 'considering', 'using my', 'my profile', 'my data',
      'improve', 'faster', 'marathon', 'race', 'goal'
    ];
    return contextKeywords.some(keyword => lowerMessage.includes(keyword));
  };

  // Fetch user context with caching
  const fetchUserContext = async (forceRefresh = false) => {
    // Return cached context if available and not forcing refresh
    if (userContext && !forceRefresh) {
      return userContext;
    }

    // If already loading, return null to avoid duplicate requests
    if (contextLoading) {
      return null;
    }

    try {
      setContextLoading(true);
      const context = await getUserContext();
      setUserContext(context);
      return context;
    } catch (error) {
      console.error('Error fetching user context:', error);
      return null;
    } finally {
      setContextLoading(false);
    }
  };

  // Background profile extraction function
  const extractProfileDataInBackground = async (conversationHistory) => {
    try {
      // Only extract from recent conversation (last 20 messages for context)
      const recentHistory = conversationHistory.slice(-20);
      
      const extractedData = await extractProfileData(recentHistory);
      
      // Log extracted profile fields
      if (Object.keys(extractedData.profileFields).length > 0) {
        console.log('📝 Profile fields to save:', extractedData.profileFields);
      }
      
      // Log free text information
      if (extractedData.freeTextInfo && extractedData.freeTextInfo.length > 0) {
        console.log('💬 Free text information to save:', extractedData.freeTextInfo);
      }
      
      // Log if nothing was extracted
      if (Object.keys(extractedData.profileFields).length === 0 && 
          (!extractedData.freeTextInfo || extractedData.freeTextInfo.length === 0)) {
        console.log('ℹ️ No profile information extracted from this conversation.');
      }
    } catch (error) {
      // Silently handle errors - extraction shouldn't affect chat UX
      console.error('Background profile extraction failed:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) {
      return;
    }

    const userMessage = inputValue.trim();
    setInputValue('');
    
    // Add user message to local state immediately
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // Save user message to database
      await saveChatMessage('user', userMessage);

      // Prepare message history for Ollama (include all previous messages)
      // The sendChatMessage function will add the new user message, so we pass the history
      const messageHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Check if we need context and fetch it if necessary
      let context = null;
      if (needsContext(userMessage) || messages.length === 0) {
        // Fetch context on first message or when keywords detected
        context = await fetchUserContext();
      }

      // Call appropriate API based on selected model
      // Debug: Log the selected model to verify it's being read correctly
      const currentModel = selectedModel?.toLowerCase()?.trim();
      console.log('🔍 Selected model (raw):', selectedModel);
      console.log('🔍 Selected model (normalized):', currentModel);
      console.log('🔍 Model comparison (gemini):', currentModel === 'gemini');
      console.log('🔍 Model comparison (ollama):', currentModel === 'ollama');
      
      let assistantResponse;
      // Explicit check: use Gemini if explicitly 'gemini', otherwise use Ollama
      if (currentModel === 'gemini') {
        console.log('✅ Calling Gemini API');
        try {
          assistantResponse = await sendGeminiMessage(messageHistory, userMessage, null, context);
          console.log('✅ Gemini response received, length:', assistantResponse?.length);
        } catch (geminiError) {
          console.error('❌ Gemini API error:', geminiError);
          
          // Fallback to Ollama if Gemini is unavailable (503 error)
          if (geminiError.isUnavailable || geminiError.message?.includes('overloaded') || geminiError.message?.includes('unavailable')) {
            console.log('🔄 Gemini unavailable, falling back to Ollama...');
            try {
              assistantResponse = await sendOllamaMessage(messageHistory, userMessage, null, context);
              console.log('✅ Ollama fallback response received, length:', assistantResponse?.length);
              
              // Add a note to the response that we used fallback
              assistantResponse = `*[Note: Gemini API was temporarily unavailable, using Ollama instead]*\n\n${assistantResponse}`;
            } catch (ollamaError) {
              console.error('❌ Ollama fallback also failed:', ollamaError);
              // If Ollama also fails, throw the original Gemini error
              throw geminiError;
            }
          } else {
            // For non-503 errors, throw immediately
            throw geminiError;
          }
        }
      } else {
        console.log('✅ Calling Ollama API (selectedModel is not "gemini")');
        try {
          assistantResponse = await sendOllamaMessage(messageHistory, userMessage, null, context);
          console.log('✅ Ollama response received, length:', assistantResponse?.length);
        } catch (ollamaError) {
          console.error('❌ Ollama API error:', ollamaError);
          throw ollamaError;
        }
      }

      // Add assistant response to local state
      const newAssistantMessage = {
        role: 'assistant',
        content: assistantResponse,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, newAssistantMessage]);

      // Save assistant response to database
      await saveChatMessage('assistant', assistantResponse);

      // Trigger background profile extraction (non-blocking)
      // Include the new messages in the conversation history for extraction
      const updatedMessageHistory = [...messages, newUserMessage, newAssistantMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Run extraction in background without blocking
      extractProfileDataInBackground(updatedMessageHistory);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Show error message in chat
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to send message. Please try again.'}`,
        createdAt: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div 
      className="bg-lavender-blush-50 dark:bg-lavender-blush-900 border-l border-lavender-blush-200 dark:border-lavender-blush-800 flex flex-col h-screen fixed right-0 top-0"
      style={{ width: `${width}px` }}
    >
      {/* Chat Header */}
      <div className="p-4 border-b border-lavender-blush-200 dark:border-lavender-blush-800">
        <h3 className="text-lg font-semibold text-lavender-blush-900 dark:text-lavender-blush-50 m-0">Chat</h3>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-sm text-lavender-blush-600 dark:text-lavender-blush-400 text-center italic">
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id || index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-yale-blue-500 text-white'
                    : message.isError
                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                    : 'bg-lavender-blush-200 dark:bg-lavender-blush-700 text-lavender-blush-900 dark:text-lavender-blush-100'
                }`}
              >
                {message.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap break-words m-0">{message.content}</p>
                ) : (
                  <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none m-0
                    prose-headings:mt-2 prose-headings:mb-2
                    prose-p:my-2 prose-p:leading-relaxed
                    prose-ul:my-2 prose-ol:my-2
                    prose-li:my-1
                    prose-code:text-sm prose-code:bg-black/10 dark:prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                    prose-pre:bg-black/10 dark:prose-pre:bg-white/10 prose-pre:rounded prose-pre:p-3 prose-pre:overflow-x-auto
                    prose-strong:font-semibold
                    prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline
                    prose-blockquote:border-l-4 prose-blockquote:border-gray-400 dark:prose-blockquote:border-gray-500 prose-blockquote:pl-4 prose-blockquote:italic
                    prose-table:border-collapse prose-table:w-full
                    prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-600 prose-th:px-2 prose-th:py-1 prose-th:bg-gray-100 dark:prose-th:bg-gray-800
                    prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-600 prose-td:px-2 prose-td:py-1
                    [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
                {message.createdAt && (
                  <p
                    className={`text-xs mt-1 mb-0 ${
                      message.role === 'user'
                        ? 'text-yale-blue-100'
                        : message.isError
                        ? 'text-red-600 dark:text-red-300'
                        : 'text-lavender-blush-600 dark:text-lavender-blush-400'
                    }`}
                  >
                    {formatTime(message.createdAt)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-lavender-blush-200 dark:bg-lavender-blush-700 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-lavender-blush-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-lavender-blush-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-lavender-blush-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t border-lavender-blush-200 dark:border-lavender-blush-800">
        <div className="flex gap-2">
          {/* Model Switcher - Left side of input */}
          <select
            value={selectedModel}
            onChange={(e) => {
              const newModel = e.target.value;
              console.log('🔄 Model changed from', selectedModel, 'to', newModel);
              setSelectedModel(newModel);
            }}
            disabled={isLoading}
            className="px-3 py-3 border-2 border-lavender-blush-200 dark:border-lavender-blush-600 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:border-yale-blue-500 dark:bg-lavender-blush-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
          </select>
          
          <input
            type="text"
            placeholder="Ask anything..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1 px-4 py-3 border-2 border-lavender-blush-200 dark:border-lavender-blush-600 rounded-lg text-base transition-colors focus:outline-none focus:border-yale-blue-500 dark:bg-lavender-blush-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-3 bg-yale-blue-500 text-white rounded-lg font-medium transition-colors hover:bg-yale-blue-600 focus:outline-none focus:ring-2 focus:ring-yale-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

