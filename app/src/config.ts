import { Platform } from 'react-native';

// Where the backend brain lives.
//  - web: the same server hosts the page and the API, so use the page's own
//    origin (relative URLs). This is what runs at wabil.seet.cloud.
//  - native: there's no page origin, so point at the public server. For local
//    native dev against a Mac on the same LAN, swap this for that Mac's LAN IP.
export const API_BASE = Platform.OS === 'web' ? '' : 'https://wabil.seet.cloud';
