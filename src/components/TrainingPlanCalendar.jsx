import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './TrainingPlanCalendar.css';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TrainingPlanCalendar = ({ planData, onPlanChange, planType }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [weeks, setWeeks] = useState({});
  const [draggedWorkout, setDraggedWorkout] = useState(null);

  // Initialize dates and weeks from planData
  useEffect(() => {
    if (planData) {
      const start = planData.startdate ? new Date(planData.startdate) : getDefaultStartDate();
      const end = planData.enddate ? new Date(planData.enddate) : getDefaultEndDate(start);
      
      setStartDate(start);
      setEndDate(end);
      
      // Initialize weeks from planData
      const initialWeeks = {
        week1: { ...planData.week1 },
        week2: { ...planData.week2 },
        week3: { ...planData.week3 },
        week4: { ...planData.week4 }
      };
      setWeeks(initialWeeks);
    }
  }, [planData]);

  // Get default start date (current week's Monday or today if Monday)
  const getDefaultStartDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    // Calculate days to go back to Monday (0 = Sunday, 1 = Monday, etc.)
    const daysUntilMonday = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysUntilMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  // Get default end date (4 weeks from start)
  const getDefaultEndDate = (start) => {
    const end = new Date(start);
    end.setDate(start.getDate() + 27); // 4 weeks = 28 days, last day is day 28
    end.setHours(23, 59, 59, 999);
    return end;
  };

  // Handle date changes
  const handleStartDateChange = (date) => {
    setStartDate(date);
    const newEnd = getDefaultEndDate(date);
    setEndDate(newEnd);
    notifyPlanChange(date, newEnd, weeks);
  };

  const handleEndDateChange = (date) => {
    setEndDate(date);
    notifyPlanChange(startDate, date, weeks);
  };

  // Notify parent of plan changes
  const notifyPlanChange = (start, end, weeksData) => {
    if (onPlanChange) {
      onPlanChange({
        startdate: start ? start.toISOString().split('T')[0] : '',
        enddate: end ? end.toISOString().split('T')[0] : '',
        week1: weeksData.week1 || {},
        week2: weeksData.week2 || {},
        week3: weeksData.week3 || {},
        week4: weeksData.week4 || {}
      });
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, weekKey, dayKey) => {
    const workout = weeks[weekKey]?.[dayKey];
    if (workout && workout.trim() !== '' && workout.toLowerCase() !== 'rest') {
      setDraggedWorkout({ weekKey, dayKey, workout });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // Required for Firefox
    } else {
      e.preventDefault();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetWeekKey, targetDayKey) => {
    e.preventDefault();
    
    if (!draggedWorkout) return;
    
    const { weekKey: sourceWeekKey, dayKey: sourceDayKey, workout } = draggedWorkout;
    
    // Only allow moving within the same week
    if (sourceWeekKey !== targetWeekKey) {
      setDraggedWorkout(null);
      return;
    }

    // Swap workouts
    const newWeeks = { ...weeks };
    const sourceWorkout = newWeeks[sourceWeekKey][sourceDayKey];
    newWeeks[sourceWeekKey][sourceDayKey] = newWeeks[targetWeekKey][targetDayKey];
    newWeeks[targetWeekKey][targetDayKey] = sourceWorkout;
    
    setWeeks(newWeeks);
    setDraggedWorkout(null);
    notifyPlanChange(startDate, endDate, newWeeks);
  };

  const handleDragEnd = () => {
    setDraggedWorkout(null);
  };

  // Get date for a specific day in a week
  const getDateForDay = (weekIndex, dayIndex) => {
    if (!startDate) return null;
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex);
    return date;
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return '';
    return date.getDate();
  };

  // Get month/year header
  const getMonthYearHeader = () => {
    if (!startDate) return '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    const startMonth = months[startDate.getMonth()];
    const startYear = startDate.getFullYear();
    
    if (endDate && endDate.getMonth() !== startDate.getMonth()) {
      const endMonth = months[endDate.getMonth()];
      const endYear = endDate.getFullYear();
      return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
    }
    
    return `${startMonth} ${startYear}`;
  };

  if (!planData && !weeks.week1) {
    return <div className="calendar-loading">Loading calendar...</div>;
  }

  return (
    <div className="training-plan-calendar">
      <div className="calendar-header">
        <h2>{getMonthYearHeader()}</h2>
        <div className="date-pickers">
          <div className="date-picker-group">
            <label>Start Date:</label>
            <DatePicker
              selected={startDate}
              onChange={handleStartDateChange}
              dateFormat="MMM dd, yyyy"
              className="date-picker-input"
              calendarStartDay={1}
            />
          </div>
          <div className="date-picker-group">
            <label>End Date:</label>
            <DatePicker
              selected={endDate}
              onChange={handleEndDateChange}
              minDate={startDate}
              dateFormat="MMM dd, yyyy"
              className="date-picker-input"
              calendarStartDay={1}
            />
          </div>
        </div>
      </div>

      <div className="calendar-grid">
        {/* Day headers */}
        <div className="calendar-day-header">
          {DAY_LABELS.map((label) => (
            <div key={label} className="day-header-cell">
              {label}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {['week1', 'week2', 'week3', 'week4'].map((weekKey, weekIndex) => (
          <div key={weekKey} className="calendar-week">
            {DAYS.map((dayKey, dayIndex) => {
              const workout = weeks[weekKey]?.[dayKey] || '';
              const date = getDateForDay(weekIndex, dayIndex);
              const isToday = date && 
                date.toDateString() === new Date().toDateString();
              const isDragging = draggedWorkout?.weekKey === weekKey && 
                                draggedWorkout?.dayKey === dayKey;

              return (
                <div
                  key={`${weekKey}-${dayKey}`}
                  className={`calendar-day ${isToday ? 'today' : ''} ${isDragging ? 'dragging' : ''}`}
                  draggable={workout && workout.trim() !== '' && workout.toLowerCase() !== 'rest'}
                  onDragStart={(e) => handleDragStart(e, weekKey, dayKey)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, weekKey, dayKey)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="day-number">{formatDate(date)}</div>
                  <div className="day-workout">
                    {workout && workout.trim() !== '' ? (
                      <div className="workout-content">{workout}</div>
                    ) : (
                      <div className="workout-empty">Rest</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrainingPlanCalendar;

