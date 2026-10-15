import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import ScanScreen from './ScanScreen';
import { API_BASE_URL } from './config';

const MOCK_ASSIGNED_EVENTS = [
  { id: '1', title: 'Tech Conference 2026', date: 'Oct 12, 2026', venue: 'Main Hall A' },
  { id: '2', title: 'BiletFlow Launch Party', date: 'Nov 05, 2026', venue: 'Auditorium' },
  { id: '3', title: 'Developer Meetup', date: 'Dec 01, 2026', venue: 'Room 302' },
];

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'LOGIN' | 'EVENTS' | 'SCAN'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password }),
      });

      if (response.ok) {
        setCurrentScreen('EVENTS');
      } else {
        const data = await response.json().catch(() => ({}));
        showAlert('Login Failed', data.message || 'Invalid credentials');
      }
    } catch (err) {
      showAlert('Network Error', 'Could not reach server. Use "Dev Bypass Login" below to test navigation.');
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = () => {
    setCurrentScreen('EVENTS');
  };

  const handleOpenScanner = (eventName: string) => {
    setSelectedEvent(eventName);
    setCurrentScreen('SCAN');
  };

  const handleScanSuccess = (code: string) => {
    setLastScannedCode(code);
    showAlert('QR Code Scanned', `Payload: ${code}\nEvent: ${selectedEvent}`);
  };

  if (currentScreen === 'SCAN') {
    return (
      <ScanScreen
        onBack={() => setCurrentScreen('EVENTS')}
        onScanSuccess={handleScanSuccess}
      />
    );
  }

  if (currentScreen === 'EVENTS') {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Assigned Events</Text>
          <TouchableOpacity onPress={() => setCurrentScreen('LOGIN')}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {lastScannedCode && (
          <View style={styles.scanBanner}>
            <Text style={styles.scanBannerText}>Last Scanned QR: {lastScannedCode}</Text>
          </View>
        )}

        <FlatList
          data={MOCK_ASSIGNED_EVENTS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventDetails}>{item.date} • {item.venue}</Text>
              </View>
              <TouchableOpacity
                style={styles.scanButton}
                onPress={() => handleOpenScanner(item.title)}
              >
                <Text style={styles.scanButtonText}>Scan QR</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Admin Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email / Username"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.devButton} onPress={handleDevBypass}>
        <Text style={styles.devButtonText}>⚡ Dev Bypass Login (Test Navigation)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  logoutText: { color: '#FF3B30', fontWeight: 'bold', fontSize: 16 },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  devButton: { marginTop: 20, padding: 10, alignItems: 'center' },
  devButtonText: { color: '#6c757d', fontSize: 14, textDecorationLine: 'underline' },
  eventCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  eventDetails: { color: '#666', fontSize: 14 },
  scanButton: { backgroundColor: '#34C759', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginLeft: 10 },
  scanButtonText: { color: '#fff', fontWeight: 'bold' },
  scanBanner: { backgroundColor: '#E3F2FD', padding: 10, borderRadius: 6, marginBottom: 15 },
  scanBannerText: { color: '#0D47A1', fontWeight: 'bold', fontSize: 12 },
});