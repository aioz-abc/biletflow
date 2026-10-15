import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Pressable, FlatList, ActivityIndicator, Alert, Platform } from 'react-native';
import ScanScreen from './ScanScreen';
import { API_BASE_URL } from './config';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'LOGIN' | 'EVENTS' | 'SCAN'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const mockEvents = [
    { id: '1', name: 'Tech Conference 2026', location: 'Hall A' },
    { id: '2', name: 'BiletFlow Launch Party', location: 'Main Stage' },
  ];

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        setCurrentScreen('EVENTS');
      } else {
        showAlert('Login Failed', 'Invalid credentials');
      }
    } catch (err) {
      showAlert('Network Error', 'Could not reach server');
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
          <Pressable onPress={() => setCurrentScreen('LOGIN')} style={{ padding: 5 }}>
            <Text style={{ color: 'red', fontWeight: 'bold' }}>Logout</Text>
          </Pressable>
        </View>

        {lastScannedCode && (
          <View style={styles.scanBanner}>
            <Text style={styles.scanBannerText}>Last Scanned QR: {lastScannedCode}</Text>
          </View>
        )}

        <FlatList
          data={mockEvents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <View>
                <Text style={styles.eventName}>{item.name}</Text>
                <Text style={styles.eventSub}>{item.location}</Text>
              </View>
              <TouchableOpacity
                style={styles.scanButton}
                onPress={() => handleOpenScanner(item.name)}
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
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
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
      <TouchableOpacity style={styles.bypassButton} onPress={handleDevBypass}>
        <Text style={styles.bypassText}>Dev Bypass →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#ddd' },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  bypassButton: { marginTop: 15, alignItems: 'center' },
  bypassText: { color: '#888', fontSize: 14, textDecorationLine: 'underline' },
  eventCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  eventName: { fontSize: 16, fontWeight: 'bold' },
  eventSub: { color: '#666', fontSize: 12 },
  scanButton: { backgroundColor: '#34C759', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  scanButtonText: { color: '#fff', fontWeight: 'bold' },
  scanBanner: { backgroundColor: '#E3F2FD', padding: 10, borderRadius: 6, marginBottom: 15 },
  scanBannerText: { color: '#0D47A1', fontWeight: 'bold', fontSize: 12 },
});