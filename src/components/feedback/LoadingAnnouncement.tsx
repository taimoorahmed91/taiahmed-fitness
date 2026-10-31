interface LoadingAnnouncementProps {
  loading: boolean;
  /** Short and specific, e.g. "Loading dashboard". */
  label: string;
}

/**
 * One concise status message for a whole screen. It says the label while loading and
 * nothing once done (the finished content speaks for itself), so screen readers
 * are not flooded by per-card messages.
 */
export const LoadingAnnouncement = ({ loading, label }: LoadingAnnouncementProps) => (
  <span role="status" className="sr-only">
    {loading ? label : ''}
  </span>
);
