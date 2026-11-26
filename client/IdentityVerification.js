import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Ellipse, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import {
  FaceCamera,
  getCapabilities,
  useCameraPermissions,
  useFaceAutoCapture,
  useFaceCamera,
  useFaceValidation,
  useLivenessChallenge,
} from '@rbayuokt/expo-face-vision';
import { requestApi } from './lib/api';
import { supabase } from './lib/supabase';

const CONSENT_VERSION = 'ph-national-id-v2';
const STORAGE_BUCKET = 'identity-verification';
const ID_SCAN_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const FACE_GUIDE = { width: 0.66, height: 0.68, centerY: 0.46 };
const FACE_REQUIREMENTS = {
  singleFace: true,
  guide: FACE_GUIDE,
  minFaceSize: 0.16,
  maxFaceSize: 0.74,
  minBrightness: 0.18,
  maxBrightness: 0.97,
  minSharpness: 18,
};
const AUTO_CAPTURE_REQUIREMENTS = {
  ...FACE_REQUIREMENTS,
  eyesOpen: true,
  lookingForward: true,
};
const LIVENESS_PROMPTS = {
  POSITION_FACE: 'Look straight at the camera',
  HOLD_STILL: 'Hold still',
  TURN_LEFT: 'Turn left',
  TURN_RIGHT: 'Turn right',
  LOOK_UP: 'Look up',
  LOOK_DOWN: 'Look down',
  TILT_LEFT: 'Tilt your head left',
  TILT_RIGHT: 'Tilt your head right',
  BLINK: 'Blink once',
  SMILE: 'Smile',
  NOD: 'Nod your head',
  SHAKE: 'Shake your head',
  RETURN_TO_CENTER: 'Return to center',
  PASSED: 'Face check complete',
  FAILED: 'This step needs another try',
};
const LIVENESS_FAILURES = {
  TIMEOUT: 'That step took too long. Try that step again.',
  NO_FACE: 'No face found. Center your face in the oval, then retry.',
  FACE_LOST: 'Face not found. Center your face and try again.',
  MULTIPLE_FACES: 'Only one face please.',
  FACE_CHANGED: 'The detected face changed. Restart the face check.',
};
const ACTION_DETAILS = {
  'turn-left': { title: 'Turn left', hint: 'Slowly turn your head to your left.', icon: '↶' },
  'turn-right': { title: 'Turn right', hint: 'Slowly turn your head to your right.', icon: '↷' },
  'look-up': { title: 'Look up', hint: 'Lift your chin and look up.', icon: '↑' },
  'look-down': { title: 'Look down', hint: 'Lower your chin and look down.', icon: '↓' },
  'tilt-left': { title: 'Tilt left', hint: 'Tilt your head toward your left shoulder.', icon: '↙' },
  blink: { title: 'Blink once', hint: 'Close and reopen your eyes.', icon: '◉' },
  smile: { title: 'Smile', hint: 'Show a natural smile.', icon: '☺' },
};
const GUIDANCE_MESSAGES = {
  NO_FACE: 'Find your face',
  MULTIPLE_FACES: 'Only one face please',
  TOO_DARK: 'Too dark',
  TOO_BRIGHT: 'Reduce glare',
  MOVE_CLOSER: 'Move closer',
  MOVE_FARTHER: 'Move farther away',
  FACE_TOO_SMALL: 'Move closer',
  FACE_TOO_LARGE: 'Move farther away',
  MOVE_LEFT: 'Move left',
  MOVE_RIGHT: 'Move right',
  MOVE_UP: 'Move up',
  MOVE_DOWN: 'Move down',
  LOOK_FORWARD: 'Look straight',
  LOOK_LEFT: 'Look straight',
  LOOK_RIGHT: 'Look straight',
  OPEN_EYES: 'Open your eyes',
  TOO_BLURRY: 'Hold still',
  HOLD_STILL: 'Hold still',
  REQUIREMENT_NOT_MET: 'Adjust your position',
  READY: 'Face aligned',
};
const CAPTURE_COUNTDOWN_MS = 1000;

function shuffledChallengeSteps() {
  const steps = ['turn-left', 'turn-right', 'look-up', 'blink'];
  steps.push(getCapabilities().smileProbability ? 'smile' : 'tilt-left');
  for (let index = steps.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [steps[index], steps[swapIndex]] = [steps[swapIndex], steps[index]];
  }
  return steps;
}

function GuidedFaceCamera({ onCapture, onError, onReady, onClose }) {
  const camera = useFaceCamera();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [previewSlotSize, setPreviewSlotSize] = useState(null);
  const [challengeSteps, setChallengeSteps] = useState(shuffledChallengeSteps);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(() => new Set());
  const completedStepsRef = useRef(new Set());
  const [positionComplete, setPositionComplete] = useState(false);
  const positionCompleteRef = useRef(false);
  const [challengeFailure, setChallengeFailure] = useState(null);
  const [faceChanged, setFaceChanged] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const activeStep = challengeSteps[currentStepIndex] || challengeSteps[0];
  const stepCopy = ACTION_DETAILS[activeStep];
  const challenge = useLivenessChallenge({
    camera,
    steps: [activeStep],
    randomize: false,
    positioningMs: 650,
    holdMs: 350,
    stepTimeout: 10000,
    faceLostTimeout: 1000,
    prompts: LIVENESS_PROMPTS,
    haptics: false,
    onPass: () => {
      if (faceChanged) return;
      positionCompleteRef.current = true;
      setPositionComplete(true);
      setChallengeFailure(null);
      const nextCompleted = new Set(completedStepsRef.current);
      nextCompleted.add(activeStep);
      completedStepsRef.current = nextCompleted;
      setCompletedSteps(nextCompleted);
      const nextIndex = challengeSteps.findIndex((step) => !nextCompleted.has(step));
      if (nextIndex !== -1) setCurrentStepIndex(nextIndex);
    },
    onFail: (failure) => {
      setChallengeFailure(failure);
      if (failure === 'FACE_CHANGED') setFaceChanged(true);
    },
  });
  const validation = useFaceValidation(FACE_REQUIREMENTS, {
    camera,
    guidanceDelay: 160,
  });
  const livenessComplete = positionComplete && completedSteps.size === challengeSteps.length;
  const autoCapture = useFaceAutoCapture({
    camera,
    enabled: livenessComplete && !challengeFailure && !faceChanged,
    requirements: AUTO_CAPTURE_REQUIREMENTS,
    stableFor: 300,
    countdown: CAPTURE_COUNTDOWN_MS,
    haptics: false,
    photo: { quality: 0.85 },
    onCapture: (result) => onCapture(result.photo),
    onCaptureError: onError,
  });
  const countdownActive = autoCapture.state.status === 'COUNTDOWN';
  const countdownProgress = countdownActive
    ? Math.max(0, Math.min(1, 1 - ((autoCapture.state.countdownEndsAt || clock) - clock) / CAPTURE_COUNTDOWN_MS))
    : 0;
  const canCaptureManually = livenessComplete
    && ['READY', 'COUNTDOWN'].includes(autoCapture.state.status)
    && !challengeFailure
    && !faceChanged;
  const displayedStepIndex = positionComplete ? currentStepIndex + 2 : 1;
  const isPositioning = !positionComplete
    || (challenge.phase === 'positioning' && completedSteps.size === 0);
  const currentTitle = livenessComplete
    ? 'Face check complete'
    : isPositioning
      ? 'Look straight at the camera'
      : stepCopy.title;
  const currentHint = livenessComplete
    ? 'Hold still. Your photo will be captured automatically.'
    : isPositioning
      ? 'Keep one face inside the oval and hold still.'
      : stepCopy.hint;
  const guidanceStatus = validation.status;
  const guidanceMessage = challengeFailure
    ? LIVENESS_FAILURES[challengeFailure]
    : faceChanged
      ? LIVENESS_FAILURES.FACE_CHANGED
      : guidanceStatus && guidanceStatus !== 'READY'
        ? GUIDANCE_MESSAGES[guidanceStatus]
        : livenessComplete
          ? countdownActive ? 'Hold still, capturing' : 'Face aligned'
          : challenge.text;
  const guidanceHint = guidanceStatus === 'NO_FACE'
    ? challengeFailure === 'NO_FACE'
      ? 'Center your face. If it is not detected, try removing a mask or glasses.'
      : 'Move into the oval. If your face is not detected, try removing a mask or glasses.'
    : guidanceStatus === 'TOO_DARK'
      ? 'Move to a brighter spot and face the light.'
      : challengeFailure
        ? challengeFailure === 'TIMEOUT'
          ? 'You can retry just this step or restart the face check.'
          : 'Adjust your position, then retry or restart the face check.'
        : 'Follow the prompt and keep your face inside the oval.';
  const safeTop = insets.top;
  const safeBottom = insets.bottom;
  const previewMaxHeight = Math.max(190, height - safeTop - safeBottom - 286);
  const fallbackPreviewWidth = Math.max(180, Math.min(width - 36, previewMaxHeight * 0.75));
  const previewWidth = previewSlotSize?.width > 0 && previewSlotSize?.height > 0
    ? Math.min(previewSlotSize.width, previewSlotSize.height * 0.75)
    : fallbackPreviewWidth;
  const previewHeight = previewWidth / 0.75;
  const centerX = previewWidth / 2;
  const centerY = previewHeight * FACE_GUIDE.centerY;
  const radiusX = (previewWidth * FACE_GUIDE.width) / 2;
  const radiusY = (previewHeight * FACE_GUIDE.height) / 2;
  const ellipsePerimeter = 2 * Math.PI * Math.sqrt((radiusX ** 2 + radiusY ** 2) / 2);

  useEffect(() => {
    challenge.start();
  }, [activeStep, retryToken]);

  useEffect(() => {
    if (challenge.phase === 'challenge' && !positionCompleteRef.current) {
      positionCompleteRef.current = true;
      setPositionComplete(true);
    }
  }, [challenge.phase]);

  useEffect(() => {
    if (!countdownActive) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 80);
    return () => clearInterval(timer);
  }, [countdownActive]);

  useEffect(() => {
    if (guidanceStatus !== 'NO_FACE' || challengeFailure || livenessComplete) return undefined;
    const timer = setTimeout(() => {
      setChallengeFailure((current) => current || 'NO_FACE');
    }, 8000);
    return () => clearTimeout(timer);
  }, [guidanceStatus, challengeFailure, livenessComplete, activeStep, retryToken]);

  useEffect(() => {
    if (challengeFailure === 'FACE_CHANGED') setFaceChanged(true);
  }, [challengeFailure]);

  const retryCurrentStep = () => {
    setChallengeFailure(null);
    setRetryToken((current) => current + 1);
  };

  const retryCompletedStep = (stepIndex) => {
    const step = challengeSteps[stepIndex];
    if (!step || !completedStepsRef.current.has(step)) return;
    const nextCompleted = new Set(completedStepsRef.current);
    nextCompleted.delete(step);
    completedStepsRef.current = nextCompleted;
    setCompletedSteps(nextCompleted);
    setChallengeFailure(null);
    setCurrentStepIndex(stepIndex);
    setRetryToken((current) => current + 1);
  };

  const restartChallenge = () => {
    const nextSteps = shuffledChallengeSteps();
    completedStepsRef.current = new Set();
    positionCompleteRef.current = false;
    setChallengeSteps(nextSteps);
    setCompletedSteps(new Set());
    setPositionComplete(false);
    setCurrentStepIndex(0);
    setChallengeFailure(null);
    setFaceChanged(false);
    setRetryToken((current) => current + 1);
  };

  const onManualCapture = () => {
    if (canCaptureManually) autoCapture.capture();
  };

  const livenessProgress = challenge.phase === 'challenge' ? challenge.stepProgress : 0;
  const guideProgress = countdownActive ? countdownProgress : livenessProgress;
  const guideReady = guidanceStatus === 'READY' || countdownActive || autoCapture.state.status === 'READY';
  const hasCompletedPosition = positionComplete || completedSteps.size > 0;
  const topPadding = insets.top;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <>
      <StatusBar hidden />
      <SafeAreaView style={[styles.captureScreen, { paddingTop: topPadding }]} edges={['bottom']}>
        <View style={styles.captureHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel face capture"
            style={styles.captureClose}
            onPress={onClose}
          >
            <Text style={styles.captureCloseText}>×</Text>
          </Pressable>
          <Text numberOfLines={2} style={styles.captureHeaderTitle}>Step 2: Guided face capture</Text>
          <View style={styles.captureHeaderSpacer} />
        </View>
        <View style={styles.captureProgressRow}>
          {Array.from({ length: 6 }, (_, index) => {
            const complete = index === 0
              ? hasCompletedPosition
              : completedSteps.has(challengeSteps[index - 1]);
            const active = !livenessComplete && index === displayedStepIndex - 1;
            return (
              <View
                key={index}
                style={[
                  styles.captureProgressSegment,
                  complete && styles.captureProgressComplete,
                  active && styles.captureProgressActive,
                ]}
              />
            );
          })}
        </View>
        <View
          style={styles.capturePreviewSlot}
          onLayout={({ nativeEvent }) => {
            const { width: slotWidth, height: slotHeight } = nativeEvent.layout;
            setPreviewSlotSize((current) => (
              current?.width === slotWidth && current?.height === slotHeight
                ? current
                : { width: slotWidth, height: slotHeight }
            ));
          }}
        >
          <View style={[styles.capturePreview, { width: previewWidth, height: previewHeight }]}>
            <FaceCamera
              camera={camera}
              style={StyleSheet.absoluteFillObject}
              facing="front"
              active
              inferenceFps={12}
              detection={{
                performanceMode: 'fast',
                tracking: true,
                classification: true,
                contours: Platform.OS === 'ios',
              }}
              frameStats
              resizeMode="cover"
              onCameraReady={onReady}
              onCameraError={onError}
            />
            <Svg
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              viewBox={`0 0 ${previewWidth} ${previewHeight}`}
              preserveAspectRatio="none"
            >
              <Path
                d={`M0 0 H${previewWidth} V${previewHeight} H0 Z M${centerX} ${centerY - radiusY} a${radiusX} ${radiusY} 0 1 0 0 ${radiusY * 2} a${radiusX} ${radiusY} 0 1 0 0 ${-radiusY * 2} Z`}
                fill="rgba(0, 0, 0, 0.52)"
                fillRule="evenodd"
              />
              <Ellipse
                cx={centerX}
                cy={centerY}
                rx={radiusX}
                ry={radiusY}
                fill="transparent"
                stroke={guideReady ? '#39D18B' : '#FFFFFF'}
                strokeWidth={3}
              />
              {guideProgress > 0 ? (
                <Ellipse
                  cx={centerX}
                  cy={centerY}
                  rx={radiusX}
                  ry={radiusY}
                  fill="transparent"
                  stroke="#39D18B"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={`${ellipsePerimeter}`}
                  strokeDashoffset={ellipsePerimeter * (1 - guideProgress)}
                  transform={`rotate(-90 ${centerX} ${centerY})`}
                />
              ) : null}
            </Svg>
          </View>
        </View>
        <View style={styles.capturePanel}>
          <View style={styles.captureFeedback}>
            <View style={[styles.captureFeedbackDot, guideReady && styles.captureFeedbackDotReady]} />
            <Text style={styles.captureFeedbackText}>{guidanceMessage || 'Starting camera...'}</Text>
          </View>
          {guidanceHint ? <Text style={styles.captureFeedbackHint}>{guidanceHint}</Text> : null}
          <Text style={styles.captureStepLabel}>STEP {livenessComplete ? 6 : displayedStepIndex} OF 6</Text>
          <View style={styles.captureActionRow}>
            <View style={styles.captureActionIcon}>
              <Text style={styles.captureActionIconText}>
                {livenessComplete ? '✓' : isPositioning ? '◎' : stepCopy.icon}
              </Text>
            </View>
            <View style={styles.captureActionCopy}>
              <Text style={styles.captureActionTitle}>{currentTitle}</Text>
              <Text style={styles.captureActionHint}>{currentHint}</Text>
            </View>
          </View>
          <View style={styles.captureStepList}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Look straight at the camera"
              accessibilityState={{ checked: hasCompletedPosition }}
              disabled
              style={[
                styles.captureStepMarker,
                hasCompletedPosition && styles.captureStepMarkerComplete,
                !hasCompletedPosition && styles.captureStepMarkerActive,
              ]}
            >
              <Text style={[styles.captureStepMarkerText, hasCompletedPosition && styles.captureStepMarkerTextActive]}>
                {hasCompletedPosition ? '✓' : '1'}
              </Text>
            </Pressable>
            {challengeSteps.map((step, index) => {
              const isComplete = completedSteps.has(step);
              const isActive = !livenessComplete && index === currentStepIndex;
              return (
                <Pressable
                  key={step}
                  accessibilityRole="button"
                  accessibilityLabel={`${ACTION_DETAILS[step].title}${isComplete ? ', completed. Tap to retry.' : ''}`}
                  accessibilityState={{ checked: isComplete, disabled: !isComplete }}
                  disabled={!isComplete || faceChanged}
                  onPress={() => retryCompletedStep(index)}
                  style={[
                    styles.captureStepMarker,
                    isComplete && styles.captureStepMarkerComplete,
                    isActive && styles.captureStepMarkerActive,
                  ]}
                >
                  <Text style={[
                    styles.captureStepMarkerText,
                    (isComplete || isActive) && styles.captureStepMarkerTextActive,
                  ]}>
                    {isComplete ? '✓' : index + 2}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {challengeFailure || faceChanged ? (
            <Pressable
              accessibilityRole="button"
              style={styles.captureRetryButton}
              onPress={faceChanged ? restartChallenge : retryCurrentStep}
            >
              <Text style={styles.captureRetryText}>
                {faceChanged ? 'Restart face check' : 'Retry this step'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCaptureManually }}
            disabled={!canCaptureManually}
            onPress={onManualCapture}
            style={[styles.captureButton, !canCaptureManually && styles.captureButtonDisabled]}
          >
            <Text style={styles.captureButtonText}>Capture now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
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

export default function IdentityVerification({ user, onCaptureActiveChange }) {
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

  const setCaptureActive = (active) => {
    setCameraActive(active);
    onCaptureActiveChange?.(active);
  };

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
      const scanned = await requestApi(`/api/identity-verifications/${record.id}/scan`, {
        method: 'POST',
        timeoutMs: ID_SCAN_REQUEST_TIMEOUT_MS,
      });
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
      const scanned = await requestApi(`/api/identity-verifications/${record.id}/scan`, {
        method: 'POST',
        timeoutMs: ID_SCAN_REQUEST_TIMEOUT_MS,
      });
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
    setCaptureStatus('Checking your face against the ID photo. This may take a moment.');
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
      setCaptureStatus('');
    }
  };

  const captureGuidedFace = async () => {
    if (!cameraPermission?.granted) {
      try {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          setErrorMessage('Camera permission was denied. Allow camera access in your device settings, then try again.');
          return;
        }
      } catch (error) {
        setErrorMessage(error.message || 'Unable to request camera access. Check camera permission in your device settings.');
        return;
      }
    }
    setCaptureStatus('Starting camera...');
    setCaptureActive(true);
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

  if (cameraActive) {
    return (
      <View style={styles.captureRoot}>
        <GuidedFaceCamera
          onReady={() => setCaptureStatus('')}
          onCapture={(photo) => {
            setCaptureActive(false);
            setCaptureStatus('');
            uploadAndMatch(photo.uri);
          }}
          onError={(error) => {
            setCaptureActive(false);
            setCaptureStatus('');
            setErrorMessage(error?.message || 'The camera could not start. Check camera permission, then retry.');
          }}
          onClose={() => {
            setCaptureActive(false);
            setCaptureStatus('');
          }}
        />
      </View>
    );
  }

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
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color="#7b4b35" />
          <Text style={styles.muted}>{captureStatus || 'Processing securely...'}</Text>
        </View>
      ) : null}

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
          ) : (
            <>
              <Text style={styles.body}>Follow the full-screen face prompts. The camera checks each movement in a randomized order, then captures a clear front-facing photo for comparison.</Text>
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
  captureRoot: { flex: 1, backgroundColor: '#101316' },
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
  captureScreen: { flex: 1, backgroundColor: '#101316', paddingHorizontal: 18 },
  captureHeader: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  captureClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#24292d', alignItems: 'center', justifyContent: 'center' },
  captureCloseText: { color: '#fff', fontSize: 26, lineHeight: 30, fontWeight: '400' },
  captureHeaderTitle: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  captureHeaderSpacer: { width: 40, height: 40 },
  captureProgressRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 10 },
  captureProgressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#42474b' },
  captureProgressComplete: { backgroundColor: '#39d18b' },
  captureProgressActive: { backgroundColor: '#fff' },
  capturePreviewSlot: { flex: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center' },
  capturePreview: { overflow: 'hidden', backgroundColor: '#202428' },
  capturePanel: { paddingTop: 8, paddingBottom: 12 },
  captureFeedback: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  captureFeedbackDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f2b34b' },
  captureFeedbackDotReady: { backgroundColor: '#39d18b' },
  captureFeedbackText: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  captureFeedbackHint: { color: '#aeb5b9', fontSize: 11, lineHeight: 15, marginTop: 2 },
  captureStepLabel: { color: '#9da5aa', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  captureActionRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 6, minHeight: 46 },
  captureActionIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#24292d', alignItems: 'center', justifyContent: 'center' },
  captureActionIconText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  captureActionCopy: { flex: 1 },
  captureActionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  captureActionHint: { color: '#aeb5b9', fontSize: 11, lineHeight: 15, marginTop: 2 },
  captureStepList: { flexDirection: 'row', justifyContent: 'center', gap: 9, marginTop: 8, marginBottom: 5 },
  captureStepMarker: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#4b5155', alignItems: 'center', justifyContent: 'center' },
  captureStepMarkerComplete: { borderColor: '#39d18b', backgroundColor: 'rgba(57, 209, 139, 0.14)' },
  captureStepMarkerActive: { borderColor: '#fff' },
  captureStepMarkerText: { color: '#9da5aa', fontSize: 11, fontWeight: '700' },
  captureStepMarkerTextActive: { color: '#fff' },
  captureRetryButton: { alignSelf: 'center', paddingVertical: 7, paddingHorizontal: 12 },
  captureRetryText: { color: '#9be6c2', fontSize: 12, fontWeight: '700' },
  captureButton: { minHeight: 46, borderRadius: 12, backgroundColor: '#39d18b', alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  captureButtonDisabled: { backgroundColor: '#3a4245' },
  captureButtonText: { color: '#111714', fontSize: 14, fontWeight: '800' },
  field: { marginTop: 8 },
  fieldLabel: { color: '#69584c', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d9cec6', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: '#33241e', backgroundColor: '#fff', minHeight: 44 },
  multiline: { minHeight: 88 },
  age: { color: '#594a41', fontSize: 13, marginTop: 10, marginBottom: 4 },
  successTitle: { color: '#315f42', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  resultBox: { backgroundColor: '#f8f5f2', borderRadius: 10, padding: 14, marginTop: 8 },
  resultText: { color: '#594a41', fontSize: 13, lineHeight: 20 },
});
