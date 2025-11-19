interface ActivitiesDumpProps {
  activities: unknown;
}

export function ActivitiesDump({ activities }: ActivitiesDumpProps) {
  return (
    <pre
      style={{
        padding: 20,
        background: '#eee',
        whiteSpace: 'pre-wrap',
        borderRadius: 8,
        overflow: 'auto',
      }}
    >
      {JSON.stringify(activities, null, 2)}
    </pre>
  );
}

