import { GraduationCap, Presentation, PlayCircle } from 'lucide-react';
import { PageContainer, PageHeader, PageSection } from '@/components/layout/Page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import videoAsset from '@/assets/fittrack-user-guide.mp4.asset.json';

const PRESENTATION_URL = '/presentation/fittrack-user-guide.html';

const HowTo = () => {
  const playerHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>html,body{margin:0;height:100%;background:transparent;display:flex;align-items:center;justify-content:center}video{width:100%;height:100%;object-fit:contain}</style></head><body><video src="${videoAsset.url}" controls playsinline preload="metadata"></video></body></html>`;

  return (
    <PageContainer>
      <PageHeader icon={GraduationCap} title="How-to" description="Learn your way around FitTrack" />

      <PageSection title="Guides" hideTitle>
        <p className="text-muted-foreground">
          Open{' '}
          <a
            href={PRESENTATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 rounded-sm text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
          >
            the presentation
            <Presentation className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PlayCircle className="h-5 w-5 text-primary" aria-hidden="true" />
              Video Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              srcDoc={playerHtml}
              title="FitTrack user guide video"
              className="aspect-video w-full rounded-lg border bg-muted"
              // One fullscreen switch only: `allow` and `allowFullScreen` together make the browser warn.
              allow="fullscreen"
            />
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default HowTo;
