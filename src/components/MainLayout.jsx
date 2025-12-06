import { useState } from 'react';
import NavigationSidebar from './NavigationSidebar';
import ChatPanel from './ChatPanel';

const MainLayout = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

