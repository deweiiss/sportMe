import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { sendChatMessage } from '../services/ollamaApi';
import { getChatHistory, saveChatMessage } from '../services/supabase';
import { extractProfileData } from '../services/profileExtraction';

const ChatPanel = ({ width = 320 }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

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

      // Call Ollama API (it will add the userMessage to the history)
      const assistantResponse = await sendChatMessage(messageHistory, userMessage);

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

