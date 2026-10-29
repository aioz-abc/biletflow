import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, TouchableOpacity, Pressable, TextInput, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface ScanScreenProps {
  onBack: () => void;
  onScanSuccess: (data: string) => void;
}

export default function ScanScreen({ onBack, onScanSuccess }: ScanScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    onScanSuccess(data);
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    setScanned(true);
    onScanSuccess(manualCode.trim());
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera access is required to scan QR tickets.</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
        <View style={styles.spacer} />
        <Button title="Back to Events" onPress={onBack} color="#666" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={15}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Scan Ticket QR</Text>
      </View>

      {/* Render camera on native mobile; show fallback message on web */}
      {Platform.OS !== 'web' ? (
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            <View style={styles.targetFrame} />
          </View>
        </CameraView>
      ) : (
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackText}>
            Camera preview disabled in web browser. Use manual payload entry below to simulate QR scans.
          </Text>
        </View>
      )}

      {/* Manual Fallback for testing */}
      <View style={styles.controlsContainer}>
        <Text style={styles.subLabel}>Test QR Payload / Manual Entry:</Text>
        <View style={styles.inputRow}>
          <TextInput
            testID="manual-input"
            style={styles.input}
            placeholder="e.g. TICKET-UUID-12345"
            value={manualCode}
            onChangeText={setManualCode}
          />
          <TouchableOpacity
            testID="simulate-button"
            style={styles.simulateButton}
            onPress={handleManualSubmit}
          >
            <Text style={styles.simulateButtonText}>Simulate Scan</Text>
          </TouchableOpacity>
        </View>

        {scanned && (
          <TouchableOpacity style={styles.rescanButton} onPress={() => setScanned(false)}>
            <Text style={styles.rescanButtonText}>Tap to Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10, zIndex: 10 },
  backButton: { marginRight: 15, padding: 5, cursor: 'pointer' as any },
  backButtonText: { color: '#2196F3', fontSize: 16, fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  text: { color: '#fff', textAlign: 'center', marginVertical: 20 },
  spacer: { height: 10 },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  targetFrame: { width: 220, height: 220, borderWidth: 2, borderColor: '#00FF00', backgroundColor: 'transparent' },
  webFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#222' },
  webFallbackText: { color: '#aaa', textAlign: 'center', fontSize: 14 },
  controlsContainer: { backgroundColor: '#111', padding: 20, zIndex: 10 },
  subLabel: { color: '#ccc', fontSize: 12, marginBottom: 5 },
  inputRow: { flexDirection: 'row', marginBottom: 10 },
  input: { flex: 1, backgroundColor: '#fff', padding: 10, borderRadius: 5, marginRight: 10 },
  simulateButton: { backgroundColor: '#2196F3', paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center', borderRadius: 5 },
  simulateButtonText: { color: '#fff', fontWeight: 'bold' },
  rescanButton: { backgroundColor: '#333', padding: 10, borderRadius: 5, alignItems: 'center', marginTop: 5 },
  rescanButtonText: { color: '#2196F3', fontWeight: 'bold' }
});