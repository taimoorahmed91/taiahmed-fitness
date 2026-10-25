Use semantic chart role tokens in global CSS for actual intake and minimum/maximum target series; this keeps chart contrast consistent in both themes.
Sort workout presentation through original exercise indexes, never reorder index-keyed workout data; this preserves sets, weights, timestamps and recovery.
Dashboard fetch freshness comes from a successful meals query, not mount time or a swallowed batch error; manual refresh reuses the auto-refresh single-flight guard.
Keep meal nutrient matching in a pure shared helper with boundary tests; exact and inclusive range filters must treat missing macros as unknown, not zero.
Use shared chart view controls for dashboard trends, with 7/30-day calendar filtering and persisted line/bar preferences; this keeps timeframes consistent across metrics.
Use the shared range-only chart control for categorical charts and aggregate meals over inclusive UTC calendar dates; this avoids presenting inapplicable line/bar modes while matching trend timeframes.