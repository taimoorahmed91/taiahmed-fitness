import { GymForm } from '@/components/GymForm';
import { GymList } from '@/components/GymList';
import { useGymSessions } from '@/hooks/useGymSessions';

const Gym = () => {
  const { sessions, addSession, deleteSession } = useGymSessions();

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gym Schedule</h1>
        <p className="text-muted-foreground mt-1">Log your workouts and track your progress</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GymForm onSubmit={addSession} />
        <GymList sessions={sessions} onDelete={deleteSession} />
      </div>
    </div>
  );
};

export default Gym;
