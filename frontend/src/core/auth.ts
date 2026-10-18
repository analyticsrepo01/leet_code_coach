import {showMessageModal} from '../demo/ui-helpers';

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

export async function verifyToken(token: string) {
  try {
    const tokenInfoUrl = isLocal
      ? '/tokeninfo'
      : 'https://oauth2.googleapis.com/tokeninfo';
    const response = await fetch(`${tokenInfoUrl}?access_token=${token}`);
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || response.statusText,
        details: data,
      };
    }
    console.log('Token info:', data);
    return {success: true, data};
  } catch (e: any) {
    console.error('Error verifying token:', e);
    return {success: false, error: e.message || 'Unknown error'};
  }
}

export function displayUserProfile(
  name: string,
  pictureUrl: string,
  elements: {
    userName: HTMLSpanElement | null;
    userAvatar: HTMLImageElement | null;
    userProfile: HTMLDivElement | null;
    googleSignInBtn: HTMLButtonElement | null;
  },
) {
  if (elements.userName) elements.userName.textContent = name;
  if (elements.userAvatar) elements.userAvatar.src = pictureUrl;
  if (elements.userProfile) elements.userProfile.classList.remove('hidden');
  if (elements.googleSignInBtn)
    elements.googleSignInBtn.classList.add('hidden');
}

export async function fetchUserProfile(
  token: string,
  elements: {
    userName: HTMLSpanElement | null;
    userAvatar: HTMLImageElement | null;
    userProfile: HTMLDivElement | null;
    googleSignInBtn: HTMLButtonElement | null;
  },
  store: any,
) {
  try {
    const userInfoUrl = isLocal
      ? '/oauth2/v3/userinfo'
      : 'https://www.googleapis.com/oauth2/v3/userinfo';
    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('User info:', data);

    store.userName = data.name;

    const pictureUrl =
      isLocal && data.picture.startsWith('https://lh3.googleusercontent.com')
        ? data.picture.replace('https://lh3.googleusercontent.com', '/lh3')
        : data.picture;

    store.userAvatar = pictureUrl;

    displayUserProfile(data.name, pictureUrl, elements);

    localStorage.setItem('gemini_user_name', data.name);
    localStorage.setItem('gemini_user_avatar', pictureUrl);
  } catch (e) {
    console.error('Error fetching user profile:', e);
  }
}

export function clearAuthData(store: any, elements?: any) {
  store.accessToken = '';
  store.tokenExpiry = 0;
  store.userName = '';
  store.userAvatar = '';

  if (elements) {
    if (elements.tokenInput) elements.tokenInput.value = '';
    if (elements.userProfile) elements.userProfile.classList.add('hidden');
    if (elements.userName) elements.userName.textContent = '';
    if (elements.userAvatar) elements.userAvatar.src = '';
  }

  localStorage.removeItem('gemini_access_token');
  localStorage.removeItem('gemini_token_time');
  localStorage.removeItem('gemini_token_expiry');
  localStorage.removeItem('gemini_user_name');
  localStorage.removeItem('gemini_user_avatar');
}

export async function ensureValidToken(
  store: any,
  tokenClient: any,
  elements?: any,
) {
  const token = store.accessToken;
  const expiry = store.tokenExpiry;
  const now = new Date().getTime();

  if (!token || now >= expiry) {
    console.log('Token missing or expired, requesting new one...');

    clearAuthData(store, elements);

    if (tokenClient) {
      tokenClient.requestAccessToken();
      return false;
    } else {
      showMessageModal(
        'Error',
        'OAuth Client ID is required to acquire a token.',
      );
      return false;
    }
  }
  return true;
}
