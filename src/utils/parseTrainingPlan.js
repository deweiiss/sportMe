/**
 * Parse flattened training plan format back to structured format
 * Converts days from pipe-delimited strings to objects with workout_structure arrays
 * @param {Object} flattenedPlan - Plan with days as string arrays
 * @returns {Object} Structured plan with days as object arrays
 */
export const parseFlattenedTrainingPlan = (flattenedPlan) => {
  if (!flattenedPlan || !flattenedPlan.schedule) {
    return flattenedPlan;
  }

  const parsed = {
    ...flattenedPlan,
    schedule: flattenedPlan.schedule.map(week => ({
      ...week,
      days: week.days.map(dayString => {
        // Format: "day_name|day_index|is_rest_day|is_completed|activity_category|activity_title|total_duration_min|workout_segments"
        // workout_segments format: "SEGMENT_TYPE:description,duration_value duration_unit,Zone intensity_zone||SEGMENT_TYPE:..."
        const parts = dayString.split('|');
        
        if (parts.length < 7) {
          // Invalid format, return minimal structure
          console.warn('Invalid day format, using defaults:', dayString);
          return {
            day_name: parts[0] || 'Monday',
            day_index: parseInt(parts[1]) || 1,
            is_rest_day: parts[2] === 'true',
            is_completed: parts[3] === 'true',
            activity_category: parts[4] || 'REST',
            activity_title: parts[5] || 'Rest day',
            total_estimated_duration_min: parseInt(parts[6]) || 0,
            workout_structure: []
          };
        }

        // Parse workout segments if present
        const workoutSegments = parts[7] && parts[7].trim() 
          ? parts[7].split('||').map(segmentStr => {
              // Format: "SEGMENT_TYPE:description,duration_value duration_unit,Zone intensity_zone"
              const trimmed = segmentStr.trim();
              if (!trimmed) return null;
              
              const [typeAndDesc, duration, zone] = trimmed.split(',');
              if (!typeAndDesc || !duration || !zone) {
                console.warn('Invalid segment format:', segmentStr);
                return null;
              }
              
              const [segmentType, ...descParts] = typeAndDesc.split(':');
              const description = descParts.join(':').trim();
              
              // Parse duration: "30 min" or "5 km" or "400 m"
              const durationMatch = duration.trim().match(/(\d+(?:\.\d+)?)\s*(min|km|m)/);
              if (!durationMatch) {
                console.warn('Invalid duration format:', duration);
                return null;
              }
              
              // Parse zone: "Zone 2" or "Zone 5"
              const zoneMatch = zone.trim().match(/Zone\s*(\d+)/i);
              if (!zoneMatch) {
                console.warn('Invalid zone format:', zone);
                return null;
              }
              
              return {
                segment_type: segmentType.trim(),
                description: description,
                duration_value: parseFloat(durationMatch[1]),
                duration_unit: durationMatch[2],
                intensity_zone: parseInt(zoneMatch[1])
              };
            }).filter(segment => segment !== null)
          : [];

        return {
          day_name: parts[0],
          day_index: parseInt(parts[1]) || 1,
          is_rest_day: parts[2] === 'true',
          is_completed: parts[3] === 'true',
          activity_category: parts[4],
          activity_title: parts[5],
          total_estimated_duration_min: parseInt(parts[6]) || 0,
          workout_structure: workoutSegments
        };
      })
    }))
  };

  return parsed;
};

