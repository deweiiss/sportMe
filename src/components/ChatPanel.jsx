import { useState, useEffect, useRef } from 'react';
import { sendChatMessage } from '../services/ollamaApi';
import { getChatHistory, saveChatMessage } from '../services/supabase';

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
      className="bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-screen fixed right-0 top-0"
      style={{ width: `${width}px` }}
    >
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">Chat</h3>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center italic">
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
                    ? 'bg-blue-500 text-white'
                    : message.isError
                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words m-0">{message.content}</p>
                {message.createdAt && (
                  <p
                    className={`text-xs mt-1 mb-0 ${
                      message.role === 'user'
                        ? 'text-blue-100'
                        : message.isError
                        ? 'text-red-600 dark:text-red-300'
                        : 'text-gray-500 dark:text-gray-400'
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
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask anything..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base transition-colors focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-3 bg-blue-500 text-white rounded-lg font-medium transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

