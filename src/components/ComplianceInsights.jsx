import React from 'react';

/**
 * ComplianceInsights Component
 * Displays training plan compliance metrics, trends, and warnings
 */
const ComplianceInsights = ({ complianceAnalysis, onRequestAdjustment }) => {
  if (!complianceAnalysis) {
    return null;
  }

  const { overallComplianceRate, trends, warnings } = complianceAnalysis;

  // Don't show if there's no data yet
  if (overallComplianceRate === 0) {
    return null;
  }

  // Determine overall status color
  const getComplianceColor = (rate) => {
    if (rate >= 80) return 'text-green-600 dark:text-green-400';
    if (rate >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getComplianceBackground = (rate) => {
    if (rate >= 80) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    if (rate >= 60) return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
    return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200';
      case 'medium':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200';
      case 'positive':
        return 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200';
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Overall Compliance */}
      <div className={`p-4 rounded-lg border ${getComplianceBackground(overallComplianceRate)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Overall Compliance
            </h3>
            <p className={`text-3xl font-bold ${getComplianceColor(overallComplianceRate)}`}>
              {overallComplianceRate}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {overallComplianceRate >= 80 ? 'Great job! 💪' :
               overallComplianceRate >= 60 ? 'Keep pushing! 🏃' :
               'Need help? 🤔'}
            </p>
          </div>
        </div>
      </div>

      {/* Trends */}
      {trends.length > 0 && (
        <div className="space-y-2">
          {trends.map((trend, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${getSeverityStyle(trend.severity)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">
                  {trend.severity === 'positive' ? '📈' :
                   trend.severity === 'high' ? '⚠️' : 'ℹ️'}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{trend.message}</p>
                  {trend.avgComplianceRate && (
                    <p className="text-xs mt-1 opacity-80">
                      Average: {trend.avgComplianceRate}% over last {trend.weeks} weeks
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Action Items
          </h4>
          {warnings.map((warning, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${getSeverityStyle(warning.severity)}`}
            >
              <div className="space-y-1">
                <p className="font-medium text-sm">{warning.message}</p>
                {warning.action && (
                  <p className="text-xs opacity-80">
                    💡 {warning.action}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Adjustment CTA */}
      {overallComplianceRate < 70 && onRequestAdjustment && (
        <div className="pt-2">
          <button
            onClick={onRequestAdjustment}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Request Plan Adjustment
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
            AI coach can help adapt your plan to your current capacity
          </p>
        </div>
      )}
    </div>
  );
};

export default ComplianceInsights;
