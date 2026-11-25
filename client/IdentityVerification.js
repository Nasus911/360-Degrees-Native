import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  FaceCamera,
  useBlinkDetection,
  useCameraPermissions,
  useFaceCamera,
  useFaceFrames,
} from '@rbayuokt/expo-face-vision';
import { requestApi } from './lib/api';
import { supabase } from './lib/supabase';

const CONSENT_VERSION = 'ph-national-id-v2';
const STORAGE_BUCKET = 'identity-verification';
const CAPTURE_PROMPTS = [
  'Look straight at the camera.',
  'Blink once, then keep your eyes open.',
  'Move slightly farther away.',
  'Move a little closer to the camera.',
  'Turn your face slightly left, then right.',
  'Return to center and hold still for the final photo.',
];

const FACE_GUIDE = { width: 0.72, height: 0.48, centerY: 0.45 };
const HOLD_MS = 1800;

function GuidedFaceCamera({ cameraFrameHeight, onCapture, onError, onReady }) {
  const camera = useFaceCamera();
  const [step, setStep] = useState(0);
  const [guidance, setGuidance] = useState('Starting face scan...');
  const stepStartedAt = useRef(null);
  const baselineScale = useRef(null);
  const leftPassed = useRef(false);
  const rightPassed = useRef(false);
  const captureStarted = useRef(false);
  const blink = useBlinkDetection({ camera });

  const finishStep = (nextStep) => {
    stepStartedAt.current = null;
    setStep(nextStep);
  };

  useFaceFrames((frame) => {
    if (captureStarted.current) return;
    if (frame.faces.length !== 1) {
      stepStartedAt.current = null;
      setGuidance(frame.faces.length > 1 ? 'More than one face detected' : 'Center one face in the guide');
      return;
    }

    const face = frame.faces[0];
    const scale = face.headPose?.scale || face.normalizedBounds.width;
    const direction = face.headPose?.direction;
    const centered = Math.abs((face.normalizedBounds.x + face.normalizedBounds.width / 2) - 0.5) <= 0.14;
    const straight = centered && Math.abs(face.headPose?.yaw || 0) <= 15 && Math.abs(face.headPose?.pitch || 0) <= 15;
    let valid = false;
    let message = CAPTURE_PROMPTS[step];

    if (step === 0) {
      valid = straight;
      message = valid ? 'Pose detected — hold still' : 'Look straight and center your face';
      if (valid && baselineScale.current === null) baselineScale.current = scale;
    } else if (step === 1) {
      valid = blink.count > 0;
      message = valid ? 'Blink detected — hold still and keep eyes open' : 'Blink once';
    } else if (step === 2) {
      valid = baselineScale.current !== null && scale <= baselineScale.current * 0.9;
      message = valid ? 'Farther position detected — hold still' : 'Move farther away';
    } else if (step === 3) {
      valid = baselineScale.current !== null && scale >= baselineScale.current * 1.12;
      message = valid ? 'Closer position detected — hold still' : 'Move closer';
    } else if (step === 4) {
      if (direction === 'left') leftPassed.current = true;
      if (direction === 'right') rightPassed.current = true;
      valid = leftPassed.current && rightPassed.current;
      message = valid ? 'Left and right turns detected — return to center' : 'Turn left, then right';
    } else {
      valid = straight;
      message = valid ? 'Pose detected — hold still for the photo' : 'Return to center';
    }

    setGuidance(message);
    if (!valid) {
      stepStartedAt.current = null;
      return;
    }
    if (stepStartedAt.current === null) stepStartedAt.current = frame.timestamp;
    if (frame.timestamp - stepStartedAt.current < HOLD_MS) return;

    if (step >= CAPTURE_PROMPTS.length - 1) {
      captureStarted.current = true;
      setGuidance('Capturing your verified face photo...');
      camera.takePhoto({ quality: 0.8 })
        .then(onCapture)
        .catch(onError);
      return;
    }
    finishStep(step + 1);
  }, camera);

  return (
    <View style={[styles.cameraFrame, { height: cameraFrameHeight }]}>
      <FaceCamera
        camera={camera}
        style={styles.camera}
        facing="front"
        active
        inferenceFps={12}
        detection={{ performanceMode: 'balanced', tracking: true, classification: true }}
        onCameraReady={onReady}
        onCameraError={onError}
      />
      <View pointerEvents="none" style={styles.cameraOverlay}>
        <View style={styles.faceGuide} />
        <View style={styles.overlayPanel}>
          <View style={styles.captureProgress}>
            {CAPTURE_PROMPTS.map((prompt, index) => (
              <View key={prompt} style={[
                styles.captureProgressSegment,
                index < step && styles.captureProgressComplete,
                index === step && styles.captureProgressActive,
              ]} />
            ))}
          </View>
          <Text style={styles.captureStep}>STEP {step + 1} OF {CAPTURE_PROMPTS.length}</Text>
          <Text style={styles.captureInstruction}>{guidance}</Text>
        </View>
      </View>
    </View>
  );
}

function screenForStatus(status) {
  if (status === 'submitted') return 'done';
  if (['id_scan_passed', 'face_match_passed'].includes(status)) return 'review';
  if (['face_uploaded', 'face_match_failed'].includes(status)) return 'face';
  return 'document';
}

function ageFromDate(dateValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const birthDate = new Date(year, month, day);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month || birthDate.getDate() !== day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

function imageExtension(asset) {
  return asset.mimeType === 'image/png' || asset.fileName?.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function imageMimeTypeFromBytes(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

async function uploadPrivateImage(uri, path, base64 = null) {
  if (!supabase) throw new Error('Configure Supabase before uploading an identity image.');
  let uploadBody;
  if (base64) {
    uploadBody = base64ToUint8Array(base64);
  } else {
    let imageResponse;
    try {
      imageResponse = await fetch(uri);
    } catch (error) {
      throw new Error(`Unable to read the selected image: ${error.message || 'invalid local URI'}`);
    }
    if (!imageResponse.ok) throw new Error('Unable to read the selected image.');
    uploadBody = new Uint8Array(await imageResponse.arrayBuffer());
  }
  const contentType = imageMimeTypeFromBytes(uploadBody);
  if (!contentType) throw new Error('The selected or captured file is not a valid JPG or PNG image.');
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, uploadBody, { contentType, cacheControl: '0', upsert: false });
  if (error) throw error;
}

export default function IdentityVerification({ user }) {
  const { height: windowHeight } = useWindowDimensions();
  const [screen, setScreen] = useState('consent');
  const [record, setRecord] = useState(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [draftFields, setDraftFields] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraFrameHeight = Math.min(Math.max(windowHeight * 0.62, 440), 620);

  const applyRecord = (next) => {
    setRecord(next);
    if (!next) {
      setScreen('consent');
      setDraftFields(null);
      return;
    }
    if (next.consentVersion !== CONSENT_VERSION) {
      setScreen('consent');
      setDraftFields(null);
      return;
    }
    setScreen(screenForStatus(next.status));
    if (next.fields) {
      setDraftFields((current) => current ? { ...next.fields, ...current } : next.fields);
    }
  };

  const refreshCurrent = async () => {
    const current = await requestApi('/api/identity-verifications/current');
    applyRecord(current);
    return current;
  };

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    requestApi('/api/identity-verifications/current')
      .then((current) => {
        if (!active) return;
        if (current) {
          setRecord(current);
          if (current.consentVersion === CONSENT_VERSION) {
            setScreen(screenForStatus(current.status));
            if (current.fields) setDraftFields(current.fields);
          } else {
            setScreen('consent');
          }
        } else {
          setScreen('consent');
        }
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(error.message || 'Unable to load verification status.');
        }
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const startVerification = async () => {
    if (!consentAccepted) {
      setErrorMessage('Review and accept the privacy notice to continue.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    setNotice('Preparing your identity-verification session...');
    try {
      const started = await requestApi('/api/identity-verifications', {
        method: 'POST',
        body: JSON.stringify({ consentAccepted: true, consentVersion: CONSENT_VERSION }),
      });
      applyRecord(started);
      setNotice('');
    } catch (error) {
      setNotice('');
      setErrorMessage(error.message || 'Unable to start verification.');
    } finally {
      setBusy(false);
    }
  };

  const scanUploadedId = async () => {
    if (!record) return;
    setBusy(true);
    setErrorMessage('');
    setNotice('Scanning the uploaded ID. Please keep this screen open...');
    try {
      const scanned = await requestApi(`/api/identity-verifications/${record.id}/scan`, { method: 'POST' });
      applyRecord(scanned);
      if (scanned.status === 'id_scan_failed') {
        setErrorMessage((scanned.scanIssues || []).join(' ') || 'The ID could not be read. Upload a clearer image and try again.');
      } else {
        setNotice('Text extracted. Review the fields, correct any mistakes, and continue to guided face capture.');
      }
    } catch (error) {
      let message = error.message || 'Unable to scan the ID.';
      try {
        await refreshCurrent();
      } catch (refreshError) {
        message += ` Status refresh failed: ${refreshError.message}`;
      }
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const chooseAndScanId = async () => {
    if (!record || !supabase) {
      setErrorMessage('Sign in with a connected account before uploading an ID.');
      return;
    }
    let selection;
    try {
      selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });
    } catch (error) {
      setErrorMessage(error.message || 'Unable to open the image picker.');
      return;
    }
    if (selection.canceled || !selection.assets?.[0]) return;

    const asset = selection.assets[0];
    setDraftFields(null);
    const extension = imageExtension(asset);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${user.id}/${record.id}/id-${suffix}.${extension}`;
    let uploaded = false;
    let registered = false;
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await uploadPrivateImage(asset.uri, path, asset.base64);
      uploaded = true;
      const saved = await requestApi(`/api/identity-verifications/${record.id}/document`, {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
      registered = true;
      setRecord(saved);
      await scanUploadedId();
    } catch (error) {
      let message = error.message || 'Unable to upload the ID image.';
      if (uploaded && !registered) {
        try {
          const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
          if (cleanupError) message += ' The temporary image could not be deleted; contact support.';
        } catch {
          message += ' The temporary image could not be deleted; contact support.';
        }
      }
      try {
        await refreshCurrent();
      } catch (refreshError) {
        message += ` Status refresh failed: ${refreshError.message}`;
      }
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const retryScan = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      const scanned = await requestApi(`/api/identity-verifications/${record.id}/scan`, { method: 'POST' });
      applyRecord(scanned);
      if (scanned.status === 'id_scan_failed') {
        setErrorMessage((scanned.scanIssues || []).join(' ') || 'The ID could not be read. Upload a clearer image and try again.');
      }
    } catch (error) {
      setErrorMessage(error.message || 'Unable to scan the ID.');
    } finally {
      setBusy(false);
    }
  };

  const runFaceMatch = async () => {
    if (!record) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const matched = await requestApi(`/api/identity-verifications/${record.id}/match`, { method: 'POST' });
      applyRecord(matched);
      if (matched.status === 'face_match_failed') {
        setErrorMessage((matched.matchIssues || []).join(' ') || 'The faces did not match. Capture a clear, front-facing photo and retry.');
      } else {
        setNotice(matched.cleanupPending
          ? 'Face comparison passed. Secure image cleanup is still pending; try again shortly if submission is blocked.'
          : 'Face comparison passed. Review the extracted information before submitting.');
      }
    } catch (error) {
      let message = error.message || 'Unable to compare the face images.';
      try {
        await refreshCurrent();
      } catch (refreshError) {
        message += ` Status refresh failed: ${refreshError.message}`;
      }
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const captureGuidedFace = async () => {
    if (!cameraPermission?.granted) {
      try {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          setErrorMessage('Camera access is required for face registration.');
          return;
        }
      } catch (error) {
        setErrorMessage(error.message || 'Unable to request camera access.');
        return;
      }
    }
    setCaptureStatus('Starting camera...');
    setCameraActive(true);
    setErrorMessage('');
  };

  const uploadAndMatch = async (uri, base64 = null) => {
    if (!record || !supabase) {
      setErrorMessage('Sign in with a connected account before registering a face.');
      return;
    }
    setBusy(true);
    setCaptureStatus('Uploading your face photo...');
    setErrorMessage('');
    let uploadedPath = null;
    let registered = false;
    try {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${user.id}/${record.id}/selfie-${suffix}.jpg`;
      await uploadPrivateImage(uri, path, base64);
      uploadedPath = path;
      const uploaded = await requestApi(`/api/identity-verifications/${record.id}/selfie`, {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
      registered = true;
      setRecord(uploaded);
      setCaptureStatus('Comparing the face with the ID photo...');
      await runFaceMatch();
      setCaptureStatus('');
    } catch (error) {
      let message = error.message || 'Unable to upload the face image.';
      if (uploadedPath && !registered) {
        try {
          const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKET).remove([uploadedPath]);
          if (cleanupError) message += ' The temporary image could not be deleted; contact support.';
        } catch {
          message += ' The temporary image could not be deleted; contact support.';
        }
      }
      try {
        await refreshCurrent();
      } catch (refreshError) {
        message += ` Status refresh failed: ${refreshError.message}`;
      }
      setErrorMessage(message);
      setCaptureStatus('');
    } finally {
      setBusy(false);
    }
  };

  const submitReviewedFields = async () => {
    if (!record || !draftFields) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const submitted = await requestApi(`/api/identity-verifications/${record.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ fields: draftFields }),
      });
      applyRecord(submitted);
      setNotice('Your verification result and reviewed information have been saved.');
    } catch (error) {
      setErrorMessage(error.message || 'Unable to submit the reviewed information.');
    } finally {
      setBusy(false);
    }
  };

  const setField = (name, value) => {
    setDraftFields((current) => ({ ...current, [name]: value }));
  };
  const faceMatchPassed = record?.status === 'face_match_passed';

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>IDENTITY VERIFICATION</Text>
      <Text style={styles.title}>Philippine National ID</Text>
      <Text style={styles.subtitle}>This service currently supports the Philippine National ID only. OCR and face matching do not prove that an ID is genuine.</Text>
      {statusLoading ? (
        <View style={styles.statusLoading}>
          <ActivityIndicator size="small" color="#7b4b35" />
          <Text style={styles.muted}>Checking verification status...</Text>
        </View>
      ) : null}

      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {busy ? <View style={styles.busy}><ActivityIndicator color="#7b4b35" /><Text style={styles.muted}>Processing securely...</Text></View> : null}

      {screen === 'consent' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Before you begin</Text>
          <Text style={styles.body}>Upload the front of a Philippine National ID, then capture a guided face sequence. The service reads the name, date of birth, address, and PCN, then compares the ID portrait with your frontal capture.</Text>
          <Text style={styles.body}>Images are kept in private storage. A successful face comparison deletes them; incomplete sessions and their images expire after 24 hours. Submitted name, birth date, address, and ID number remain in the verification record, and no automatic deletion period is currently configured. Review this information and continue only if you agree to this processing.</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consentAccepted }}
            onPress={() => setConsentAccepted((accepted) => !accepted)}
            style={styles.consentRow}
          >
            <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]} />
            <Text style={styles.body}>I consent to process my ID image and face image for identity verification.</Text>
          </Pressable>
          <PrimaryButton title="Continue" disabled={busy || !consentAccepted} onPress={startVerification} />
        </View>
      )}

      {screen === 'document' && (
        <View style={styles.card}>
          <StepHeading number="1" title="Upload and scan your ID" />
          <Text style={styles.body}>Use a clear, glare-free image of the front of your Philippine National ID. Required fields are name, date of birth, address, and PCN. Expiration date is not applicable.</Text>
          <PrimaryButton title="Choose ID image" disabled={busy} onPress={chooseAndScanId} />
          {record?.status === 'id_uploaded' && (
            <SecondaryButton title="Retry ID scan" disabled={busy} onPress={retryScan} />
          )}
          {record?.status === 'id_scan_failed' && (
            <Text style={styles.hint}>The scan did not pass. Upload a clearer image to retry.</Text>
          )}
        </View>
      )}

      {screen === 'face' && (
        <View style={styles.card}>
          <StepHeading number="2" title="Guided face capture" />
          {record?.status === 'face_uploaded' ? (
            <>
              <Text style={styles.body}>Your face image is ready. Retry the comparison or capture a new guided sequence.</Text>
              <PrimaryButton title="Retry face comparison" disabled={busy} onPress={runFaceMatch} />
            </>
          ) : cameraActive ? (
            <>
              <GuidedFaceCamera
                cameraFrameHeight={cameraFrameHeight}
                onReady={() => {
                  setCaptureStatus('Camera ready. Follow the live instructions.');
                }}
                onCapture={(photo) => {
                  setCameraActive(false);
                  setCaptureStatus('');
                  uploadAndMatch(photo.uri);
                }}
                onError={(error) => {
                  setCameraActive(false);
                  setCaptureStatus('');
                  setErrorMessage(error.message || 'Unable to start face detection. Rebuild the native app and try again.');
                }}
              />
              {captureStatus ? <Text style={styles.captureStatus}>{captureStatus}</Text> : null}
              <Text style={styles.hint}>Keep exactly one face inside the oval. Each instruction is checked from live camera frames and must be held briefly before the next step.</Text>
              <SecondaryButton title="Cancel capture" disabled={busy} onPress={() => {
                setCameraActive(false);
                setCaptureStatus('');
              }} />
            </>
          ) : (
            <>
              <Text style={styles.body}>Look straight, then follow the on-screen prompts to look left and right and move closer and farther. The frontal image is used for comparison.</Text>
              <PrimaryButton title={record?.status === 'face_match_failed' ? 'Retry face capture' : 'Start face capture'} disabled={busy} onPress={captureGuidedFace} />
            </>
          )}
        </View>
      )}

      {screen === 'review' && draftFields && (
        <View style={styles.card}>
          <StepHeading
            number={faceMatchPassed ? '3' : '1'}
            title={faceMatchPassed ? 'Review your information' : 'Review extracted information'}
          />
          <Text style={styles.body}>
            {faceMatchPassed
              ? 'The ID scan and face comparison passed. Check and correct the extracted fields before final submission.'
              : 'Review and correct the extracted fields. Any unreadable fields can be entered manually; face matching is still required before submission.'}
          </Text>
          {!faceMatchPassed && record?.scanIssues?.length ? (
            <Text style={styles.hint}>{record.scanIssues.join(' ')}</Text>
          ) : null}
          <Field label="Full name" value={draftFields.full_name} onChangeText={(value) => setField('full_name', value)} />
          <Field label="Date of birth (YYYY-MM-DD)" value={draftFields.date_of_birth} onChangeText={(value) => setField('date_of_birth', value)} />
          <Text style={styles.age}>Age: {ageFromDate(draftFields.date_of_birth) ?? 'Check date of birth'}</Text>
          <Field label="Address" value={draftFields.address} onChangeText={(value) => setField('address', value)} multiline />
          <Field label="ID number (PCN)" value={draftFields.id_number} onChangeText={(value) => setField('id_number', value)} />
          <Text style={styles.hint}>Expiration date: Not applicable for this supported ID type.</Text>
          {faceMatchPassed ? (
            <PrimaryButton title="Submit reviewed information" disabled={busy} onPress={submitReviewedFields} />
          ) : (
            <PrimaryButton
              title="Continue to guided face capture"
              disabled={busy}
              onPress={() => {
                setScreen('face');
                captureGuidedFace();
              }}
            />
          )}
          {record?.cleanupPending ? <Text style={styles.hint}>Secure image deletion is pending. Submission will remain blocked until cleanup succeeds.</Text> : null}
        </View>
      )}

      {screen === 'done' && (
        <View style={styles.card}>
          <Text style={styles.successTitle}>Verification submitted</Text>
          <Text style={styles.body}>The ID scan and face comparison passed, and your reviewed information was saved.</Text>
          <Text style={styles.hint}>This result does not verify that the ID was issued by the government or prove that it is authentic.</Text>
          {record?.fields ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{record.fields.full_name}</Text>
              <Text style={styles.resultText}>Date of birth: {record.fields.date_of_birth}</Text>
              <Text style={styles.resultText}>Address: {record.fields.address}</Text>
              <Text style={styles.resultText}>ID number: {record.fields.id_number}</Text>
            </View>
          ) : null}
          <SecondaryButton title="Start a new verification" disabled={busy} onPress={() => {
            setRecord(null);
            setDraftFields(null);
            setConsentAccepted(false);
            setErrorMessage('');
            setNotice('');
            setScreen('consent');
          }} />
        </View>
      )}
    </View>
  );
}

function StepHeading({ number, title }) {
  return <Text style={styles.sectionTitle}>Step {number}: {title}</Text>;
}

function Field({ label, value, onChangeText, multiline = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value || ''}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function PrimaryButton({ title, disabled, onPress }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.buttonDisabled]}>
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, disabled, onPress }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.secondaryButton, disabled && styles.buttonDisabled]}>
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 36 },
  center: { minHeight: 220, justifyContent: 'center', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#936a54', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: '#33241e', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#6e5d53', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderColor: '#e8dfd8', borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionTitle: { color: '#33241e', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  body: { color: '#594a41', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  muted: { color: '#806f64', fontSize: 13 },
  statusLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: '#9b897c', borderRadius: 5, marginTop: 1 },
  checkboxChecked: { backgroundColor: '#7b4b35', borderColor: '#7b4b35' },
  primaryButton: { backgroundColor: '#7b4b35', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', marginTop: 10 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#c9b8ac', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', marginTop: 10 },
  secondaryButtonText: { color: '#634331', fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  error: { color: '#a23424', backgroundColor: '#fff0ed', borderColor: '#f0d0c9', borderWidth: 1, borderRadius: 9, padding: 12, marginBottom: 12, lineHeight: 19 },
  notice: { color: '#315f42', backgroundColor: '#eef7f0', borderColor: '#d3e8d8', borderWidth: 1, borderRadius: 9, padding: 12, marginBottom: 12, lineHeight: 19 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  hint: { color: '#806f64', fontSize: 13, lineHeight: 19, marginVertical: 8 },
  captureStatus: { color: '#315f42', fontSize: 13, fontWeight: '700', marginTop: 4 },
  cameraFrame: { height: 480, borderRadius: 12, overflow: 'hidden', backgroundColor: '#251d19', marginVertical: 8 },
  camera: { flex: 1 },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-start', padding: 10 },
  overlayPanel: { backgroundColor: 'rgba(35, 27, 23, 0.62)', borderRadius: 8, padding: 10 },
  faceGuide: { position: 'absolute', alignSelf: 'center', top: '21%', width: '62%', height: '58%', borderWidth: 3, borderColor: 'rgba(255, 255, 255, 0.8)', borderRadius: 999 },
  captureProgress: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  captureProgressSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  captureProgressComplete: { backgroundColor: '#b7d889' },
  captureProgressActive: { backgroundColor: '#ffb28e' },
  captureStep: { color: '#fff7f2', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 3 },
  captureInstruction: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 0 },
  field: { marginTop: 8 },
  fieldLabel: { color: '#69584c', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d9cec6', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: '#33241e', backgroundColor: '#fff', minHeight: 44 },
  multiline: { minHeight: 88 },
  age: { color: '#594a41', fontSize: 13, marginTop: 10, marginBottom: 4 },
  successTitle: { color: '#315f42', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  resultBox: { backgroundColor: '#f8f5f2', borderRadius: 10, padding: 14, marginTop: 8 },
  resultText: { color: '#594a41', fontSize: 13, lineHeight: 20 },
});
