/**
 * Backend authentication module
 * Fetches access token from server-side endpoint
 */

export interface TokenResponse {
  access_token: string;
  project_id: string;
  expires_in: number;
}

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get access token from backend
 */
export async function getAccessToken(): Promise<TokenResponse> {
  const now = Date.now();

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    console.log('Using cached access token');
    return {
      access_token: cachedToken,
      project_id: localStorage.getItem('project_id') || '',
      expires_in: Math.floor((tokenExpiry - now) / 1000),
    };
  }

  console.log('Fetching new access token from backend...');

  try {
    const response = await fetch('/api/token');

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.statusText}`);
    }

    const data: TokenResponse = await response.json();

    // Cache the token
    cachedToken = data.access_token;
    tokenExpiry = now + data.expires_in * 1000;

    // Save project ID to localStorage
    localStorage.setItem('project_id', data.project_id);

    console.log('Access token received from backend');
    return data;
  } catch (error) {
    console.error('Error fetching access token:', error);
    throw error;
  }
}

/**
 * Clear cached token
 */
export function clearToken() {
  cachedToken = null;
  tokenExpiry = 0;
}
