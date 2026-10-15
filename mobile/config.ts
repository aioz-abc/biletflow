import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2 to access host machine; web uses localhost
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_BASE_URL = `http://${HOST}:8000/api`;