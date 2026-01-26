import { Navigation } from '@/components/Navigation';
import { FileText } from 'lucide-react';
import { DailyNoteForm } from '@/components/DailyNoteForm';
import { DailyNotesList } from '@/components/DailyNotesList';
import { useDailyNotes } from '@/hooks/useDailyNotes';

const DailyNotes = () => {
  const { notes, addNote, deleteNote, loading } = useDailyNotes();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Daily Notes</h1>
            <p className="text-muted-foreground">
              Log symptoms, feelings, and events to understand your health trends
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <DailyNoteForm onSubmit={addNote} />
          <DailyNotesList notes={notes} onDelete={deleteNote} />
        </div>
      </main>
    </div>
  );
};

export default DailyNotes;
