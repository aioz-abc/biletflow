import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';

// Mock list of events assigned to this admin
const MOCK_ASSIGNED_EVENTS = [
  { id: '1', title: 'Tech Conference 2026', date: 'Oct 12, 2026', venue: 'Main Hall A' },
  { id: '2', title: 'BiletFlow Launch Party', date: 'Nov 05, 2026', venue: 'Auditorium' },
  { id: '3', title: 'Developer Meetup', date: 'Dec 01, 2026', venue: 'Room 302' },
];

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Navigation state

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password: password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok) {
        setIsLoggedIn(true); // Navigate to events screen
      } else {
        alert(`Login Failed: ${data.message || 'Invalid credentials'}`);
      }
    } catch (error: any) {
      alert('Could not connect to Django server. Use "Dev Bypass Login" below to test navigation.');
    } finally {
      setLoading(false);
    }
  };

  // --- SCREEN 2: Assigned Events List (Rendered when logged in) ---
  if (isLoggedIn) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Assigned Events</Text>
          <TouchableOpacity onPress={() => setIsLoggedIn(false)}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={MOCK_ASSIGNED_EVENTS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventDetails}>{item.date} • {item.venue}</Text>
            </View>
          )}
        />
      </View>
    );
  }

  // --- SCREEN 1: Login Screen ---
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Admin Login</Text>
      
      <TextInput 
        style={styles.input} 
        placeholder="Email / Username" 
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(text) => setEmail(text)}
      />
      
      <TextInput 
        style={styles.input} 
        placeholder="Password" 
        secureTextEntry={true} 
        value={password}
        onChangeText={(text) => setPassword(text)}
      />
      
      <TouchableOpacity 
        style={styles.button} 
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>

      {/* Dev Bypass button for quick UI testing */}
      <TouchableOpacity 
        style={styles.devButton} 
        onPress={() => setIsLoggedIn(true)}
      >
        <Text style={styles.devButtonText}>⚡ Dev Bypass Login (Test Navigation)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  logoutText: { color: '#FF3B30', fontWeight: 'bold', fontSize: 16 },
  input: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  button: { backgroundColor: '#007BFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  devButton: { marginTop: 20, padding: 10, alignItems: 'center' },
  devButtonText: { color: '#6c757d', fontSize: 14, textDecorationLine: 'underline' },
  eventCard: { backgroundColor: 'white', padding: 20, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  eventDetails: { color: '#666', fontSize: 14 }
});
