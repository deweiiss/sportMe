import { useState, useRef, useEffect } from 'react';
import NavigationSidebar from './NavigationSidebar';
import ChatPanel from './ChatPanel';
import { useStravaSync } from '../hooks/useStravaSync';

const MainLayout = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(320); // Default width in pixels (w-80 = 320px)
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef(null);

  // Load saved chat width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('chatPanelWidth');
    if (savedWidth) {
      setChatWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Save chat width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('chatPanelWidth', chatWidth.toString());
  }, [chatWidth]);

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      // Constrain width between 250px and 600px
      const constrainedWidth = Math.max(250, Math.min(600, newWidth));
      setChatWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Enable automatic Strava sync in the background (every 15 minutes)
  // Single instance ensures no duplicate syncs
  useStravaSync({
    intervalMinutes: 15,
    enabled: true,
    onSyncComplete: (result) => {
      if (result.synced > 0) {
        console.log(`Background sync completed: ${result.synced} activities synced`);
      }
    },
    onSyncError: (error) => {
      console.warn('Background sync error:', error);
    }
  });

  return (
    <div className="min-h-screen bg-slate-grey-100 dark:bg-slate-grey-900 flex">
      {/* Left Column - Navigation Sidebar */}
      <NavigationSidebar 
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Middle Column - Main Content */}
      <div 
        className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}
        style={{ marginRight: `${chatWidth}px` }}
      >
        <div className="p-6">
          {children}
        </div>
      </div>

      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleResizeStart}
        className="fixed top-0 h-screen z-40 cursor-col-resize"
        style={{ right: `${chatWidth}px`, width: '8px', marginRight: '-4px' }}
      >
        <div
          className={`w-0.5 h-full bg-slate-grey-300 dark:bg-slate-grey-600 hover:bg-yale-blue-500 dark:hover:bg-yale-blue-600 transition-colors ${
            isResizing ? 'bg-yale-blue-500 dark:bg-yale-blue-600' : ''
          }`}
          style={{ marginLeft: '4px' }}
        />
      </div>

      {/* Right Column - Chat Panel */}
      <ChatPanel width={chatWidth} />
    </div>
  );
};

export default MainLayout;

