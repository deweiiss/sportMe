import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { sendChatMessage as sendOllamaMessage } from '../services/ollamaApi';
import { sendChatMessage as sendGeminiMessage } from '../services/geminiApi';
import { 
  getChatHistory, 
  saveChatMessage,
  createChatSession,
  listChatSessions,
  deleteChatSession,
  touchChatSession
} from '../services/supabase';
import { extractProfileData } from '../services/profileExtraction';
import { getUserContext } from '../services/contextRetrieval';
import { getTrainingPlanStep, getDefaultTrainingPlanStep } from '../prompts/prompts';
import { getTrainingPlans, saveTrainingPlan } from '../services/supabase';
import { extractTrainingPlanJSON } from '../utils/jsonExtraction';

/**
 * Generate a meaningful chat title from the first user message
 */
const generateChatTitle = (message) => {
  if (!message || typeof message !== 'string') return 'New conversation';
  
  // Clean up the message
  let title = message.trim();
  
  // Remove markdown formatting
  title = title.replace(/[*_#`]/g, '');
  
  // Take first sentence or first 50 chars
  const firstSentence = title.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length > 5) {
    title = firstSentence;
  }
  
  // Truncate if too long
  if (title.length > 50) {
    title = title.substring(0, 47) + '...';
  }
  
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  
  return title || 'New conversation';
};

/**
 * Generate a brief summary message for a training plan
 */
const generatePlanSummary = (planData) => {
  if (!planData) return 'Training plan generated. Would you like to save it?';
  
  const meta = planData.meta || {};
  const weeks = meta.total_duration_weeks || planData.schedule?.length || '?';
  const planName = meta.plan_name || 'Your training plan';
  const planType = meta.plan_type?.replace('_', ' ').toLowerCase() || 'training';
  const startDate = meta.start_date ? new Date(meta.start_date).toLocaleDateString() : null;
  
  let summary = `✅ **${planName}** is ready!\n\n`;
  summary += `📋 **Overview:**\n`;
  summary += `- Duration: ${weeks} weeks\n`;
  summary += `- Type: ${planType.charAt(0).toUpperCase() + planType.slice(1)} plan\n`;
  if (startDate) summary += `- Start date: ${startDate}\n`;
  
  if (planData.periodization_overview?.phases?.length > 0) {
    summary += `\n📈 **Phases:**\n`;
    planData.periodization_overview.phases.forEach(phase => {
      summary += `- ${phase.phase_name}: ${phase.duration_weeks} weeks\n`;
    });
  }
  
  summary += `\nWould you like to **save** this plan, or should I make any adjustments?`;
  
  return summary;
};

const ChatPanel = ({ width = 320 }) => {
  const [messages, setMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [currentChatTitle, setCurrentChatTitle] = useState('New conversation');
  const [showSessions, setShowSessions] = useState(false);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [activeSequenceStepId, setActiveSequenceStepId] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [userContext, setUserContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [detectedPlan, setDetectedPlan] = useState(null); // Store detected training plan JSON
  const [savingPlan, setSavingPlan] = useState(false);
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

  // Load chat sessions on mount
  useEffect(() => {
    const initializeChats = async () => {
      const sessionsResult = await listChatSessions();
      if (sessionsResult.error) {
        console.error('Error loading chat sessions:', sessionsResult.error);
        return;
      }

      const sessions = sessionsResult.data || [];
      setChatSessions(sessions);

      if (sessions.length > 0) {
        const first = sessions[0];
        setCurrentChatId(first.id);
        setCurrentChatTitle(first.title || 'Conversation');
        await loadChatHistory(first.id);
      } else {
        await startNewChat('New conversation');
      }
    };

    initializeChats();
  }, []);

  // Listen for training plan sequence trigger
  useEffect(() => {
    const handler = async () => {
      await startTrainingPlanFlow();
    };
    window.addEventListener('startTrainingPlanSequence', handler);
    return () => window.removeEventListener('startTrainingPlanSequence', handler);
  }, []);

  // Load active plan on mount
  useEffect(() => {
    const loadActivePlan = async () => {
      try {
        const result = await getTrainingPlans();
        if (result.error || !result.data) return;
        
        const plans = result.data || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Find active plan (currently running) or newest plan
        const active = plans.find(plan => {
          if (!plan.startDate || !plan.endDate) return false;
          const startDate = new Date(plan.startDate);
          const endDate = new Date(plan.endDate);
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(23, 59, 59, 999);
          return today >= startDate && today <= endDate;
        }) || (plans.length > 0 ? plans[0] : null);
        
        setActivePlan(active);
      } catch (err) {
        console.error('Error loading active plan:', err);
      }
    };
    
    loadActivePlan();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const loadChatHistory = async (chatId) => {
    if (!chatId) return;
    try {
      const { data, error } = await getChatHistory(chatId);
      if (error) {
        console.error('Error loading chat history:', error);
        return;
      }
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading chat history:', err);
    }
  };

  const refreshSessions = async () => {
    const sessionsResult = await listChatSessions();
    if (!sessionsResult.error) {
      setChatSessions(sessionsResult.data || []);
    }
  };

  const startNewChat = async (title = 'New conversation') => {
    const { data, error } = await createChatSession(title);
    if (error) {
      console.error('Error creating chat session:', error);
      return null;
    }
    setChatSessions(prev => [data, ...prev]);
    setCurrentChatId(data.id);
    setCurrentChatTitle(data.title || title);
    setMessages([]);
    setActiveSequenceStepId(null);
    setDetectedPlan(null); // Clear detected plan when starting new chat
    await refreshSessions();
    return data.id;
  };

  const selectChat = async (session) => {
    if (!session) return;
    setCurrentChatId(session.id);
    setCurrentChatTitle(session.title || 'Conversation');
    setActiveSequenceStepId(null);
    setShowSessions(false);
    setShowHistoryView(false);
    setDetectedPlan(null); // Clear detected plan when switching chats
    await loadChatHistory(session.id);
  };

  const startAdaptPlanFlow = async () => {
    if (!activePlan) return;
    
    const newChatId = await startNewChat('Adjust training plan');
    if (!newChatId) return;
    
    // TODO: Load adaptation prompt and send as first message
    // For now, just start a chat with a message about adjusting the plan
    const initialMessage = {
      role: 'assistant',
      content: `I'll help you adjust your training plan "${activePlan.planName || 'Training Plan'}". What would you like to change? For example:\n\n- "I missed some workouts this week"\n- "I was sick for 3 days"\n- "The workouts are too hard/easy"`,
      createdAt: new Date().toISOString()
    };
    setMessages([initialMessage]);
    await saveChatMessage('assistant', initialMessage.content, newChatId);
  };

  const startTrainingPlanFlow = async () => {
    const newChatId = await startNewChat('Training plan');
    if (!newChatId) return;
    const firstStep = getDefaultTrainingPlanStep();
    setActiveSequenceStepId(firstStep.id);
    
    // Set loading state
    setIsLoading(true);
    
    try {
      // Fetch context for the intake start
      const context = await fetchUserContext();

      // Call LLM API with the sequence step prompt (empty message history for new chat)
      const emptyMessageHistory = [];
      const currentModel = selectedModel?.toLowerCase()?.trim();
      
      let assistantResponse;
      if (currentModel === 'gemini') {
        assistantResponse = await sendGeminiMessage(emptyMessageHistory, '', null, context, firstStep);
      } else {
        assistantResponse = await sendOllamaMessage(emptyMessageHistory, '', null, context, firstStep);
      }
      
      // Handle structured output response (object with text and planData)
      let messageContent = assistantResponse;
      let planDataFromResponse = null;
      
      if (assistantResponse && typeof assistantResponse === 'object' && assistantResponse.planData) {
        // Structured output: extract planData and use only text for display
        planDataFromResponse = assistantResponse.planData;
        messageContent = assistantResponse.text || 'Training plan generated. Would you like to save it?';
      } else if (typeof assistantResponse === 'string') {
        // Regular response: try to extract plan JSON from text
        const extractedPlan = extractTrainingPlanJSON(assistantResponse);
        if (extractedPlan) {
          planDataFromResponse = extractedPlan;
          // Replace raw JSON with a user-friendly summary
          messageContent = generatePlanSummary(extractedPlan);
        }
      }
      
      // Display the LLM's response as the assistant message
      const assistantMessage = {
        role: 'assistant',
        content: messageContent,
        createdAt: new Date().toISOString()
      };
      setMessages([assistantMessage]);
      await saveChatMessage('assistant', messageContent, newChatId);
      
      // Store detected plan if available
      if (planDataFromResponse) {
        setDetectedPlan(planDataFromResponse);
      }
    } catch (error) {
      console.error('Error starting training plan flow:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to start training plan flow. Please try again.'}`,
        createdAt: new Date().toISOString(),
        isError: true
      };
      setMessages([errorMessage]);
      await saveChatMessage('assistant', errorMessage.content, newChatId);
    } finally {
      setIsLoading(false);
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
    
    const chatId = currentChatId || await startNewChat('New conversation');
    if (!chatId) return;

      const newUserMessage = {
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, newUserMessage]);
      setIsLoading(true);
      
      // Clear detected plan when user sends a new message (will be re-detected if response contains plan)
      setDetectedPlan(null);

    try {
      // Auto-generate title from first user message
      const isFirstMessage = messages.length === 0;
      let newTitle = currentChatTitle;
      
      if (isFirstMessage && currentChatTitle === 'New conversation') {
        newTitle = generateChatTitle(userMessage);
        setCurrentChatTitle(newTitle);
        // Update session title in database
        await touchChatSession(chatId, newTitle);
        // Refresh sessions to show updated title in history
        await refreshSessions();
      }
      
      await saveChatMessage('user', userMessage, chatId, newTitle);

      const messageHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      let context = null;
      if (needsContext(userMessage) || messages.length === 0) {
        context = await fetchUserContext();
      }

      const currentModel = selectedModel?.toLowerCase()?.trim();
      const sequenceStep = activeSequenceStepId ? getTrainingPlanStep(activeSequenceStepId) : null;
      
      let assistantResponse;
      if (currentModel === 'gemini') {
        console.log('✅ Calling Gemini API');
        try {
          assistantResponse = await sendGeminiMessage(messageHistory, userMessage, null, context, sequenceStep);
          console.log('✅ Gemini response received, length:', assistantResponse?.length);
        } catch (geminiError) {
          console.error('❌ Gemini API error:', geminiError);
          // Disable Ollama fallback while testing Gemini path
          // If you want fallback back on, restore the block below:
          /*
          if (geminiError.isUnavailable || geminiError.message?.includes('overloaded') || geminiError.message?.includes('unavailable')) {
            console.log('🔄 Gemini unavailable, falling back to Ollama...');
            try {
              assistantResponse = await sendOllamaMessage(messageHistory, userMessage, null, context, sequenceStep);
              console.log('✅ Ollama fallback response received, length:', assistantResponse?.length);
              
              assistantResponse = `*[Note: Gemini API was temporarily unavailable, using Ollama instead]*\n\n${assistantResponse}`;
            } catch (ollamaError) {
              console.error('❌ Ollama fallback also failed:', ollamaError);
              throw geminiError;
            }
          } else {
            throw geminiError;
          }
          */
          throw geminiError;
        }
      } else {
        // Temporarily disable Ollama to ensure Gemini is the only path
        // If you want to re-enable Ollama direct calls, restore the block below:
        /*
        console.log('✅ Calling Ollama API (selectedModel is not "gemini")');
        try {
          assistantResponse = await sendOllamaMessage(messageHistory, userMessage, null, context, sequenceStep);
          console.log('✅ Ollama response received, length:', assistantResponse?.length);
        } catch (ollamaError) {
          console.error('❌ Ollama API error:', ollamaError);
          throw ollamaError;
        }
        */
        throw new Error('Ollama is temporarily disabled while testing Gemini.');
      }

      // Handle structured output response (object with text and planData)
      let messageContent = assistantResponse;
      let planDataFromResponse = null;
      
      if (assistantResponse && typeof assistantResponse === 'object' && assistantResponse.planData) {
        // Structured output: extract planData and use only text for display
        planDataFromResponse = assistantResponse.planData;
        messageContent = assistantResponse.text || 'Training plan generated. Would you like to save it?';
      } else if (typeof assistantResponse === 'string') {
        // Regular response: try to extract plan JSON from text
        const extractedPlan = extractTrainingPlanJSON(assistantResponse);
        if (extractedPlan) {
          planDataFromResponse = extractedPlan;
          // Replace raw JSON with a user-friendly summary
          messageContent = generatePlanSummary(extractedPlan);
        }
      }

      const newAssistantMessage = {
        role: 'assistant',
        content: messageContent,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, newAssistantMessage]);
      await saveChatMessage('assistant', messageContent, chatId, currentChatTitle);

      // Store detected plan if available
      if (planDataFromResponse) {
        setDetectedPlan(planDataFromResponse);
      } else {
        setDetectedPlan(null);
      }

      // Update sequence step for next message (prompts are sent to LLM internally, not shown to user)
      if (sequenceStep?.nextId) {
        const nextStep = getTrainingPlanStep(sequenceStep.nextId);
        if (nextStep) {
          setActiveSequenceStepId(nextStep.id);
        } else {
          setActiveSequenceStepId(null);
        }
      } else {
        setActiveSequenceStepId(null);
      }

      await refreshSessions();

      const updatedMessageHistory = [...messages, newUserMessage, newAssistantMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      extractProfileDataInBackground(updatedMessageHistory);
    } catch (error) {
      console.error('Error sending message:', error);
      
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

  const handleDeleteChat = async (e, sessionId) => {
    e.stopPropagation(); // Prevent selecting the chat when clicking delete
    
    if (!confirm('Delete this chat? This cannot be undone.')) return;
    
    const { error } = await deleteChatSession(sessionId);
    if (error) {
      console.error('Error deleting chat:', error);
      alert('Failed to delete chat');
      return;
    }
    
    // Refresh sessions list
    await refreshSessions();
    
    // If we deleted the current chat, start a new one
    if (sessionId === currentChatId) {
      setCurrentChatId(null);
      setCurrentChatTitle('New conversation');
      setMessages([]);
      setDetectedPlan(null);
    }
  };

  const handleSavePlan = async () => {
    if (!detectedPlan || savingPlan) return;

    setSavingPlan(true);
    try {
      // Calculate start_date and end_date from schedule
      const schedule = detectedPlan.schedule || [];
      if (schedule.length === 0) {
        alert('Invalid plan: no schedule data');
        return;
      }

      // Get start_date from meta or calculate from first week
      let startDate = detectedPlan.meta?.start_date;
      if (!startDate && schedule[0]?.days && schedule[0].days.length > 0) {
        // Try to find the first non-rest day
        const firstDay = schedule[0].days.find(d => !d.is_rest_day);
        if (firstDay) {
          // Use today's date as fallback, or calculate from day_index
          startDate = new Date().toISOString().split('T')[0];
        }
      }
      if (!startDate) {
        startDate = new Date().toISOString().split('T')[0];
      }

      // Calculate end_date from last week
      const lastWeek = schedule[schedule.length - 1];
      let endDate = startDate;
      if (lastWeek?.days && lastWeek.days.length > 0) {
        // Add (schedule.length * 7) days to start_date
        const start = new Date(startDate);
        const daysToAdd = schedule.length * 7;
        start.setDate(start.getDate() + daysToAdd - 1);
        endDate = start.toISOString().split('T')[0];
      }

      const planToSave = {
        planData: detectedPlan,
        planType: detectedPlan.meta?.plan_type || 'FITNESS',
        startDate: startDate,
        endDate: endDate,
        planName: detectedPlan.meta?.plan_name || 'Training Plan'
      };

      const result = await saveTrainingPlan(planToSave);
      
      if (result.error) {
        alert(`Failed to save plan: ${result.error}`);
        return;
      }

      // Show success message
      const successMessage = {
        role: 'assistant',
        content: `✅ Training plan "${detectedPlan.meta?.plan_name || 'Training Plan'}" has been saved! You can view it in the Training Plan page.`,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, successMessage]);
      await saveChatMessage('assistant', successMessage.content, currentChatId, currentChatTitle);
      
      // Clear detected plan
      setDetectedPlan(null);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert(`Failed to save plan: ${error.message}`);
    } finally {
      setSavingPlan(false);
    }
  };

  const getPlanTypeLabel = (planType) => {
    const labels = {
      BEGINNER: 'Beginner',
      FITNESS: 'Fitness',
      WEIGHT_LOSS: 'Weight Loss',
      COMPETITION: 'Competition'
    };
    return labels[planType] || planType;
  };

  return (
    <div 
      className="bg-lavender-blush-50 dark:bg-lavender-blush-900 border-l border-lavender-blush-200 dark:border-lavender-blush-800 flex flex-col h-screen fixed right-0 top-0"
      style={{ width: `${width}px` }}
    >
      {/* Chat Header */}
      <div className="p-4 border-b border-lavender-blush-200 dark:border-lavender-blush-800 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-lavender-blush-900 dark:text-lavender-blush-50 m-0">{currentChatTitle}</h3>
          <p className="text-xs text-lavender-blush-600 dark:text-lavender-blush-400 m-0">Model: {selectedModel}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await startNewChat('New conversation');
              setShowHistoryView(false); // Switch to chat view
            }}
            className="px-3 py-2 rounded-md bg-yale-blue-500 text-white text-sm font-medium hover:bg-yale-blue-600"
          >
            New chat
          </button>
          <button
            onClick={() => setShowHistoryView(prev => !prev)}
            className="px-3 py-2 rounded-md border border-lavender-blush-300 dark:border-lavender-blush-700 text-sm font-medium text-lavender-blush-900 dark:text-lavender-blush-50"
          >
            {showHistoryView ? 'Back to Chat' : 'Previous Chats'}
          </button>
        </div>
      </div>

      {/* History View or Chat Messages Area */}
      {showHistoryView ? (
        <div className="flex-1 overflow-y-auto p-4">
          <h4 className="text-sm font-semibold text-lavender-blush-900 dark:text-lavender-blush-50 mb-3">Previous Chats</h4>
          {chatSessions.length === 0 ? (
            <div className="text-sm text-lavender-blush-600 dark:text-lavender-blush-400 text-center italic py-8">
              No chats yet.
            </div>
          ) : (
            <div className="space-y-2">
              {chatSessions.map(session => (
                <div
                  key={session.id}
                  className={`group relative w-full text-left px-4 py-3 pr-10 rounded-lg border border-lavender-blush-200 dark:border-lavender-blush-700 hover:bg-lavender-blush-100 dark:hover:bg-lavender-blush-800 transition-colors cursor-pointer ${
                    session.id === currentChatId ? 'bg-lavender-blush-100 dark:bg-lavender-blush-800 border-yale-blue-500' : ''
                  }`}
                  onClick={() => selectChat(session)}
                >
                  <div className="font-medium text-lavender-blush-900 dark:text-lavender-blush-50 truncate pr-2">
                    {session.title || 'Conversation'}
                  </div>
                  <div className="text-xs text-lavender-blush-600 dark:text-lavender-blush-400 mt-1">
                    {session.last_updated ? new Date(session.last_updated).toLocaleString() : ''}
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(e, session.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-lavender-blush-400 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
                    title="Delete chat"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
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
      )}

      {/* Quick Action Buttons */}
      {!showHistoryView && messages.length === 0 && (
        <div className="px-4 pt-2 pb-2 border-t border-lavender-blush-200 dark:border-lavender-blush-800">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={startTrainingPlanFlow}
              className="px-3 py-1.5 rounded-full bg-yale-blue-100 dark:bg-yale-blue-900 text-yale-blue-700 dark:text-yale-blue-200 text-xs font-medium hover:bg-yale-blue-200 dark:hover:bg-yale-blue-800 transition-colors"
            >
              + New Training Plan
            </button>
            {activePlan && (
              <button
                onClick={startAdaptPlanFlow}
                className="px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
              >
                ✏️ Adjust Active Plan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save Plan Button - Above Input */}
      {!showHistoryView && detectedPlan && (
        <div className="px-4 pt-2 pb-2 border-t border-lavender-blush-200 dark:border-lavender-blush-800">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-lavender-blush-900 dark:text-lavender-blush-50 m-0 mb-1">
                ✅ Training Plan Generated
              </p>
              <p className="text-xs text-lavender-blush-600 dark:text-lavender-blush-400 m-0">
                {detectedPlan.meta?.plan_name || 'Training Plan'} • {getPlanTypeLabel(detectedPlan.meta?.plan_type)} • {detectedPlan.meta?.total_duration_weeks || 0} weeks
              </p>
            </div>
            <button
              onClick={handleSavePlan}
              disabled={savingPlan}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPlan ? 'Saving...' : 'Save Plan'}
            </button>
          </div>
        </div>
      )}

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
          
          <textarea
            ref={textareaRef}
            placeholder="Ask anything..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            className="flex-1 px-4 py-3 border-2 border-lavender-blush-200 dark:border-lavender-blush-600 rounded-lg text-base transition-colors focus:outline-none focus:border-yale-blue-500 dark:bg-lavender-blush-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
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

