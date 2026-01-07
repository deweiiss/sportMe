/**
 * Badge Component
 *
 * Reusable badge for displaying workout completion status
 *
 * Variants:
 * - auto-matched: Green - automatically matched via sync
 * - manual: Blue - manually linked or completed by user
 * - suggested_accepted: Blue - user accepted a suggestion
 * - missed: Red - workout past grace period, not completed
 * - unmatched: Gray - default state
 */

const Badge = ({ variant = 'unmatched', children, className = '' }) => {
  const variantStyles = {
    'auto-matched': 'bg-green-100 text-green-800 border-green-200',
    'manual': 'bg-blue-100 text-blue-800 border-blue-200',
    'suggested_accepted': 'bg-blue-100 text-blue-800 border-blue-200',
    'missed': 'bg-red-100 text-red-800 border-red-200',
    'unmatched': 'bg-gray-100 text-gray-600 border-gray-200',
    'pending': 'bg-yellow-100 text-yellow-800 border-yellow-200'
  };

  const style = variantStyles[variant] || variantStyles.unmatched;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
