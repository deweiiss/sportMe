import { useState } from 'react';
import NavigationSidebar from './NavigationSidebar';
import ChatPanel from './ChatPanel';
import { useStravaSync } from '../hooks/useStravaSync';

const MainLayout = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
      {/* Left Column - Navigation Sidebar */}
      <NavigationSidebar 
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Middle Column - Main Content */}
      <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} mr-80`}>
        <div className="p-6">
          {children}
        </div>
      </div>

      {/* Right Column - Chat Panel */}
      <ChatPanel />
    </div>
  );
};

export default MainLayout;

