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
      days: week.days.map(dayData => {
        // Check if day is already an object (not a string)
        if (typeof dayData === 'object' && dayData !== null) {
          console.log('📋 Day is already object:', dayData.day_name);
          console.log('   - workout_structure:', dayData.workout_structure?.length || 0);
          console.log('   - workouts:', dayData.workouts?.length || 0);
          console.log('   - segments:', dayData.segments?.length || 0);
          console.log('   - All keys:', Object.keys(dayData).join(', '));

          // Try to find segments in various possible fields
          let segments = dayData.workout_structure || dayData.workouts || dayData.segments || [];

          // If segments is not an array, try to convert it
          if (segments && !Array.isArray(segments)) {
            console.warn('   - Segments is not an array, converting:', typeof segments);
            segments = [segments];
          }

          console.log('   - Final segments count:', segments.length);

          // If we have very few segments for a run workout, log a warning
          if (dayData.activity_category === 'RUN' && segments.length < 3) {
            console.warn(`   ⚠️ RUN workout has only ${segments.length} segments! Expected minimum 3 (WARMUP, MAIN, COOLDOWN)`);
          }

          return {
            ...dayData,
            workout_structure: segments
          };
        }
        
        // It's a string - parse it
        const dayString = dayData;
        // Format: "day_name|day_index|is_rest_day|is_completed|activity_category|activity_title|total_duration_min|workout_segments"
        // workout_segments format: "SEGMENT_TYPE:description,duration_value duration_unit,Zone intensity_zone||SEGMENT_TYPE:..."

        // CRITICAL: We need to split only on the first 7 pipes, not ALL pipes
        // Because segments use || as separators, split('|') would break them apart
        // Extract the first 7 fields manually
        const firstPipeIndex = dayString.indexOf('|');
        const secondPipeIndex = dayString.indexOf('|', firstPipeIndex + 1);
        const thirdPipeIndex = dayString.indexOf('|', secondPipeIndex + 1);
        const fourthPipeIndex = dayString.indexOf('|', thirdPipeIndex + 1);
        const fifthPipeIndex = dayString.indexOf('|', fourthPipeIndex + 1);
        const sixthPipeIndex = dayString.indexOf('|', fifthPipeIndex + 1);
        const seventhPipeIndex = dayString.indexOf('|', sixthPipeIndex + 1);

        if (seventhPipeIndex === -1) {
          // Invalid format - not enough fields
          console.warn('Invalid day format (not enough pipes), using defaults:', dayString);
          const parts = dayString.split('|');
          return {
            day_name: parts[0] || 'Monday',
            day_index: parseInt(parts[1] || '0'),
            is_rest_day: parts[2] === 'true',
            is_completed: parts[3] === 'true',
            activity_category: parts[4] || 'REST',
            activity_title: parts[5] || 'Rest day',
            total_estimated_duration_min: parseInt(parts[6] || '0'),
            workout_structure: []
          };
        }

        // Extract fields manually
        const day_name = dayString.substring(0, firstPipeIndex);
        const day_index = dayString.substring(firstPipeIndex + 1, secondPipeIndex);
        const is_rest_day = dayString.substring(secondPipeIndex + 1, thirdPipeIndex);
        const is_completed = dayString.substring(thirdPipeIndex + 1, fourthPipeIndex);
        const activity_category = dayString.substring(fourthPipeIndex + 1, fifthPipeIndex);
        const activity_title = dayString.substring(fifthPipeIndex + 1, sixthPipeIndex);
        const total_duration_min = dayString.substring(sixthPipeIndex + 1, seventhPipeIndex);
        const rawSegments = dayString.substring(seventhPipeIndex + 1).trim();
        console.log('📋 Raw segments for', day_name, ':', rawSegments ? rawSegments.substring(0, 150) : '(empty)');

        // Check if || separator is present for multi-segment workouts (expected format)
        if (rawSegments && rawSegments.length > 0 && !rawSegments.includes('||') && activity_category === 'RUN') {
          console.warn('⚠️ RUN workout has segments but missing || separator! Raw:', rawSegments.substring(0, 200));
          console.warn('   This suggests Gemini is not following the schema format.');
        }

        const workoutSegments = rawSegments
          ? rawSegments.split('||').map(segmentStr => {
              // Format: "SEGMENT_TYPE:description,duration_value duration_unit,Zone intensity_zone"
              const trimmed = segmentStr.trim();
              if (!trimmed) return null;
              
              console.log('  → Parsing segment:', trimmed);
              
              const [typeAndDesc, duration, zone] = trimmed.split(',');
              if (!typeAndDesc || !duration || !zone) {
                console.warn('  ⚠️ Invalid segment format (missing parts):', segmentStr);
                return null;
              }
              
              const [segmentType, ...descParts] = typeAndDesc.split(':');
              const description = descParts.join(':').trim();
              
              // Parse duration: "30 min" or "5 km" or "400 m"
              const durationMatch = duration.trim().match(/(\d+(?:\.\d+)?)\s*(min|km|m)/);
              if (!durationMatch) {
                console.warn('  ⚠️ Invalid duration format:', duration);
                return null;
              }
              
              // Parse zone: "Zone 2" or "Zone 5"
              const zoneMatch = zone.trim().match(/Zone\s*(\d+)/i);
              if (!zoneMatch) {
                console.warn('  ⚠️ Invalid zone format:', zone);
                return null;
              }
              
              const segment = {
                segment_type: segmentType.trim(),
                description: description,
                duration_value: parseFloat(durationMatch[1]),
                duration_unit: durationMatch[2],
                intensity_zone: parseInt(zoneMatch[1])
              };
              console.log('  ✅ Parsed segment:', segment.segment_type, segment.description);
              return segment;
            }).filter(segment => segment !== null)
          : [];

        console.log('📋 Total segments for', day_name, ':', workoutSegments.length);

        return {
          day_name: day_name,
          day_index: parseInt(day_index || '0'),
          is_rest_day: is_rest_day === 'true',
          is_completed: is_completed === 'true',
          activity_category: activity_category,
          activity_title: activity_title,
          total_estimated_duration_min: parseInt(total_duration_min || '0'),
          workout_structure: workoutSegments
        };
      })
    }))
  };

  return parsed;
};

