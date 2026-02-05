 import { Navigation } from '@/components/Navigation';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Progress } from '@/components/ui/progress';
 import { useGoalAchievements, WeeklyAchievement } from '@/hooks/useGoalAchievements';
 import { Trophy, Medal, Star, Crown, Flame, Zap, Rocket, Award, Target, TrendingUp, Check, X } from 'lucide-react';
 import { format } from 'date-fns';
 
 const iconMap: Record<string, React.ElementType> = {
   trophy: Trophy,
   medal: Medal,
   star: Star,
   crown: Crown,
   flame: Flame,
   zap: Zap,
   rocket: Rocket,
   award: Award,
 };
 
 const categoryColors = {
   calories: 'text-orange-500',
   workouts: 'text-blue-500',
   sleep: 'text-purple-500',
 };
 
 const categoryLabels = {
   calories: 'Calories',
   workouts: 'Workouts',
   sleep: 'Sleep',
 };
 
 const Achievements = () => {
   const { stats, loading } = useGoalAchievements();
 
   if (loading) {
     return (
       <div className="min-h-screen bg-background">
         <Navigation />
         <main className="container py-6">
           <div className="flex items-center justify-center py-12">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
           </div>
         </main>
       </div>
     );
   }
 
   const earnedBadges = stats.badges.filter(b => b.earned);
   const unearnedBadges = stats.badges.filter(b => !b.earned);
 
   return (
     <div className="min-h-screen bg-background">
       <Navigation />
       <main className="container py-6 space-y-6">
         <div className="flex items-center gap-3">
           <Trophy className="h-8 w-8 text-primary" />
           <h1 className="text-3xl font-bold">Achievements</h1>
         </div>
 
         {/* Stats Overview */}
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <Card>
             <CardContent className="p-4 text-center">
               <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
               <p className="text-2xl font-bold">{stats.totalGoalsSet}</p>
               <p className="text-sm text-muted-foreground">Goals Set</p>
             </CardContent>
           </Card>
           <Card>
             <CardContent className="p-4 text-center">
               <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
               <p className="text-2xl font-bold">{stats.goalsMetCount}</p>
               <p className="text-sm text-muted-foreground">Goals Met</p>
             </CardContent>
           </Card>
           <Card>
             <CardContent className="p-4 text-center">
               <Flame className="h-8 w-8 mx-auto mb-2 text-orange-500" />
               <p className="text-2xl font-bold">{stats.currentStreak}</p>
               <p className="text-sm text-muted-foreground">Current Streak</p>
             </CardContent>
           </Card>
           <Card>
             <CardContent className="p-4 text-center">
               <TrendingUp className="h-8 w-8 mx-auto mb-2 text-primary" />
               <p className="text-2xl font-bold">{stats.longestStreak}</p>
               <p className="text-sm text-muted-foreground">Longest Streak</p>
             </CardContent>
           </Card>
         </div>
 
         {/* Badges */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Medal className="h-5 w-5 text-primary" />
               Badges ({earnedBadges.length}/{stats.badges.length})
             </CardTitle>
           </CardHeader>
           <CardContent>
             {earnedBadges.length > 0 && (
               <div className="mb-6">
                 <h3 className="text-sm font-medium text-muted-foreground mb-3">Earned</h3>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                   {earnedBadges.map((badge) => {
                     const IconComponent = iconMap[badge.icon] || Trophy;
                     return (
                       <div
                         key={badge.id}
                         className="flex flex-col items-center p-4 rounded-lg bg-primary/10 border border-primary/20"
                       >
                         <IconComponent className="h-10 w-10 text-primary mb-2" />
                         <p className="font-medium text-sm text-center">{badge.name}</p>
                         <p className="text-xs text-muted-foreground text-center mt-1">
                           {badge.description}
                         </p>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}
 
             {unearnedBadges.length > 0 && (
               <div>
                 <h3 className="text-sm font-medium text-muted-foreground mb-3">Locked</h3>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                   {unearnedBadges.map((badge) => {
                     const IconComponent = iconMap[badge.icon] || Trophy;
                     return (
                       <div
                         key={badge.id}
                         className="flex flex-col items-center p-4 rounded-lg bg-muted/50 border border-border opacity-50"
                       >
                         <IconComponent className="h-10 w-10 text-muted-foreground mb-2" />
                         <p className="font-medium text-sm text-center">{badge.name}</p>
                         <p className="text-xs text-muted-foreground text-center mt-1">
                           {badge.description}
                         </p>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}
 
             {stats.badges.length === 0 && (
               <p className="text-muted-foreground text-center py-4">
                 Set and complete goals to earn badges!
               </p>
             )}
           </CardContent>
         </Card>
 
         {/* Weekly History */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Target className="h-5 w-5 text-primary" />
               Recent Goal History
             </CardTitle>
           </CardHeader>
           <CardContent>
             {stats.weeklyHistory.length === 0 ? (
               <p className="text-muted-foreground text-center py-4">
                 No goal history yet. Set weekly goals to start tracking!
               </p>
             ) : (
               <div className="space-y-3">
                 {stats.weeklyHistory.map((week, index) => (
                   <div
                     key={`${week.week_start}-${week.category}-${index}`}
                     className={`p-4 rounded-lg border ${
                       week.met ? 'bg-green-500/10 border-green-500/20' : 'bg-muted/50 border-border'
                     }`}
                   >
                     <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-2">
                         {week.met ? (
                           <Check className="h-5 w-5 text-green-500" />
                         ) : (
                           <X className="h-5 w-5 text-muted-foreground" />
                         )}
                         <span className={`font-medium ${categoryColors[week.category]}`}>
                           {categoryLabels[week.category]}
                         </span>
                       </div>
                       <Badge variant={week.met ? 'default' : 'secondary'}>
                         {week.percentage}%
                       </Badge>
                     </div>
                     <div className="text-sm text-muted-foreground mb-2">
                       {format(new Date(week.week_start), 'MMM d')} -{' '}
                       {format(new Date(week.week_end), 'MMM d, yyyy')}
                     </div>
                     <Progress value={week.percentage} className="h-2" />
                     <div className="text-xs text-muted-foreground mt-1">
                       {week.achieved_value} / {week.target_value}{' '}
                       {week.category === 'calories' ? 'cal' : week.category === 'workouts' ? 'sessions' : 'hours'}
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </CardContent>
         </Card>
       </main>
     </div>
   );
 };
 
 export default Achievements;