import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../services/auth';

const NavigationSidebar = ({ collapsed, onToggleCollapse }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);
    };
    fetchUser();
  }, []);

  const navItems = [
    { path: '/workouts', label: 'Workouts' },
    { path: '/training', label: 'Training Plan' },
    { path: '/statistics', label: 'Statistics' },
    { path: '/about', label: 'About Me' },
  ];

  const isActive = (path) => {
    return location.pathname === path;
  };

  const getUserDisplayName = () => {
    if (user?.email) {
      // Extract name from email or use email
      const emailName = user.email.split('@')[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return 'User';
  };

  return (
    <div
      className={`fixed left-0 top-0 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 z-10 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex flex-col h-full">
        {/* Collapse Toggle Button */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center px-4 py-3 mb-2 transition-colors ${
                  collapsed ? 'justify-center' : 'justify-start'
                } ${
                  active
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {!collapsed && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'justify-start'}`}>
            {/* Profile Picture Placeholder - Smiley Face Icon */}
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">😊</span>
            </div>
            {!collapsed && (
              <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
                {getUserDisplayName()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationSidebar;
