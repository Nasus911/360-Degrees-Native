import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function IdentityVerification() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>IDENTITY VERIFICATION</Text>
        <Text style={styles.title}>Continue in the mobile app</Text>
        <Text style={styles.body}>
          Face capture and verification require native camera features that aren't available in the web app.
          Open 360 Degrees on an Android or iOS device to complete this step.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 36 },
  card: { backgroundColor: '#fff', borderColor: '#e8dfd8', borderWidth: 1, borderRadius: 16, padding: 20 },
  eyebrow: { color: '#936a54', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: '#33241e', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  body: { color: '#594a41', fontSize: 14, lineHeight: 21 },
});
