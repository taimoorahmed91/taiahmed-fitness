import { DailyNote } from '@/hooks/useDailyNotes';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

interface ChartNoteIndicatorProps {
  note: DailyNote;
  cx?: number;
  cy?: number;
}

export const ChartNoteIndicator = ({ note, cx, cy }: ChartNoteIndicatorProps) => {
  if (cx === undefined || cy === undefined) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <g>
          {/* Neutral diamond, same marker as every other chart; not a status colour. */}
          <path
            d={`M${cx},4 L${cx + 7},11 L${cx},18 L${cx - 7},11 Z`}
            fill="hsl(var(--foreground))"
            stroke="hsl(var(--card))"
            strokeWidth={2}
            className="cursor-pointer"
          />
        </g>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px]">
        <div className="space-y-1">
          <div className="flex items-center gap-1 font-medium">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Note for this day
          </div>
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          {note.severity && (
            <p className="text-xs">Severity: {note.severity}/5</p>
          )}
          {note.notes && (
            <p className="text-xs text-muted-foreground">{note.notes}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// Custom dot component for Recharts that shows note indicators
export const createNoteDot = (notesMap: Map<string, DailyNote>) => {
  return (props: { cx?: number; cy?: number; payload?: { date?: string } }) => {
    const { cx, cy, payload } = props;
    const note = notesMap.get(payload?.date);
    
    if (!note) return null;
    
    return (
      <ChartNoteIndicator note={note} cx={cx} cy={cy} />
    );
  };
};

// Reference dots component that renders above the chart
export const NoteReferenceDots = ({
  data,
  notesMap,
  xAxisDataKey = 'date',
}: {
  data: { date?: string }[];
  notesMap: Map<string, DailyNote>;
  xAxisDataKey?: string;
}) => {
  // This component is used via ReferenceDot in Recharts
  return null;
};
