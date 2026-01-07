/**
 * ConfidenceMeter Component
 *
 * Visual progress bar showing match confidence level
 *
 * Color coding:
 * - Red (<50%): Low confidence
 * - Yellow (50-74%): Medium confidence
 * - Green (≥75%): High confidence
 */

const ConfidenceMeter = ({ confidence, showLabel = true, className = '' }) => {
  // Ensure confidence is between 0 and 1
  const normalizedConfidence = Math.max(0, Math.min(1, confidence || 0));
  const percentage = Math.round(normalizedConfidence * 100);

  // Determine color based on percentage
  let barColor = 'bg-red-500';
  let bgColor = 'bg-red-100';

  if (percentage >= 75) {
    barColor = 'bg-green-500';
    bgColor = 'bg-green-100';
  } else if (percentage >= 50) {
    barColor = 'bg-yellow-500';
    bgColor = 'bg-yellow-100';
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 h-2 rounded-full ${bgColor} overflow-hidden`}>
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-gray-600 min-w-[3rem] text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
};

export default ConfidenceMeter;
