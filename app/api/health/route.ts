/**
 * GET /api/health - Public health check endpoint
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

