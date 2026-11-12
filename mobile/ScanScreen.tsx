import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { verifyTicket, checkInTicket, Ticket } from './services/ticketService';

interface ScanScreenProps {
  authToken?: string;
  onBack: () => void;
  onScanSuccess?: (code: string) => void;
}

export default function ScanScreen({ authToken, onBack, onScanSuccess }: ScanScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [qrInput, setQrInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannedTicket, setScannedTicket] = useState<Ticket | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'warning' | null>(null);

  const processQrCode = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) return;
    setLoading(true);
    setStatusMessage(null);
    setScannedTicket(null);

    if (onScanSuccess) {
      onScanSuccess(tokenToVerify);
    }

    try {
      // Direct API verification against backend
      const result = await verifyTicket(tokenToVerify, authToken || 'dev-token');
      setScannedTicket(result.ticket);

      if (result.valid && result.ticket.status === 'valid') {
        setStatusMessage('Ticket Verified! Ready for Check-In.');
        setStatusType('success');
      } else {
        setStatusMessage(`Ticket Status: ${result.ticket.status.toUpperCase()}`);
        setStatusType('warning');
      }
    } catch (err: any) {
      // Graceful fallback for offline / mock testing
      setStatusMessage(err.message || 'Verification error or offline QR');
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCheckIn = async () => {
    if (!qrInput) return;
    setLoading(true);

    try {
      const updatedTicket = await checkInTicket(
        qrInput,
        authToken || 'dev-token',
        scannedTicket?.id
      );
      setScannedTicket(updatedTicket);
      setStatusMessage('Check-In Confirmed Successfully!');
      setStatusType('success');
    } catch (err: any) {
      setStatusMessage(err.message || 'Check-in failed');
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Scan Ticket QR</Text>

      {/* Camera View for native mobile devices */}
      {Platform.OS !== 'web' && permission?.granted ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={({ data }) => {
              if (data && data !== qrInput) {
                setQrInput(data);
                processQrCode(data);
              }
            }}
          />
        </View>
      ) : (
        <View style={styles.webFallbackContainer}>
          <Text style={styles.webFallbackText}>
            {Platform.OS === 'web'
              ? '📷 Camera active on mobile device'
              : 'Permission needed for camera'}
          </Text>
          {!permission?.granted && Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
              <Text style={styles.permButtonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Manual Input Controls for development and automated testing */}
      <View style={styles.inputContainer}>
        <TextInput
          testID="manual-input"
          style={styles.input}
          placeholder="e.g. TICKET-UUID-12345"
          value={qrInput}
          onChangeText={setQrInput}
        />
        <TouchableOpacity
          testID="simulate-button"
          style={styles.button}
          onPress={() => processQrCode(qrInput)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify / Simulate Scan</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Real-time Status Feedback Banner */}
      {statusMessage && (
        <View style={[styles.badge, styles[statusType || 'warning']]}>
          <Text style={styles.badgeText}>{statusMessage}</Text>
        </View>
      )}

      {/* Confirm Check-in Action */}
      {scannedTicket && scannedTicket.status === 'valid' && (
        <TouchableOpacity
          style={[styles.button, styles.checkInButton]}
          onPress={handleConfirmCheckIn}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Confirm Check-In</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  backText: { fontSize: 16, color: '#007AFF', fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, marginTop: 40 },
  cameraContainer: { height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  camera: { flex: 1 },
  webFallbackContainer: {
    height: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    padding: 10,
  },
  webFallbackText: { color: '#666', fontSize: 14, textAlign: 'center' },
  permButton: { marginTop: 10, backgroundColor: '#007AFF', padding: 8, borderRadius: 6 },
  permButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  inputContainer: { marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 10 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  checkInButton: { backgroundColor: '#28a745', marginTop: 15 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  badge: { padding: 12, borderRadius: 8, marginTop: 10, alignItems: 'center' },
  success: { backgroundColor: '#d4edda' },
  warning: { backgroundColor: '#fff3cd' },
  error: { backgroundColor: '#f8d7da' },
  badgeText: { fontWeight: '600', textAlign: 'center' },
});