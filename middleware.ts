import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Handle CORS
  const origin = request.headers.get('origin')
  const allowedOrigins = [
    'http://localhost:3001', // Frontend dev server
    'http://localhost:3000', // Same origin (if needed)
    process.env.NEXT_PUBLIC_APP_URL || '', // Production frontend
  ].filter(Boolean)

  // Allow requests from allowed origins or same origin
  const isAllowedOrigin = 
    !origin || // Same-origin request (no origin header)
    allowedOrigins.includes(origin) ||
    origin.startsWith('http://localhost:') // Allow all localhost in dev

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 })
    
    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin || '*')
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      response.headers.set('Access-Control-Max-Age', '86400') // 24 hours
    }
    
    return response
  }

  // Add CORS headers to all responses
  const response = NextResponse.next()
  
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}

