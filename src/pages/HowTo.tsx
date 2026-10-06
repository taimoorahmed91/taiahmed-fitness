import { GraduationCap, Presentation, PlayCircle } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import videoAsset from '@/assets/fittrack-user-guide.mp4.asset.json';

const PRESENTATION_URL = '/presentation/fittrack-user-guide.html';

const HowTo = () => {
  const playerHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#09090b;display:flex;align-items:center;justify-content:center}video{width:100%;height:100%;object-fit:contain}</style></head><body><video src="${videoAsset.url}" controls playsinline preload="metadata"></video></body></html>`;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <GraduationCap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">How-to</h1>
        </div>

        <p className="text-muted-foreground mb-6">
          Click{' '}
          <a
            href={PRESENTATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:opacity-80 inline-flex items-center gap-1"
          >
            here to view the presentation
            <Presentation className="h-4 w-4" />
          </a>
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Video Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              srcDoc={playerHtml}
              title="FitTrack user guide video"
              className="w-full aspect-video rounded-lg border bg-black"
              allow="fullscreen"
              allowFullScreen
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default HowTo;
