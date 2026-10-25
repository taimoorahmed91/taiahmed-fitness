// Sort presentation only: original indexes still own sets, weights and timestamps.
export const workoutExerciseOrder = (exercises: string[], previousSequences: Record<string, number>) =>
  exercises.map((exercise, index) => ({ exercise, index })).sort((a, b) =>
    (previousSequences[a.exercise] ?? Infinity) - (previousSequences[b.exercise] ?? Infinity) || a.index - b.index
  );