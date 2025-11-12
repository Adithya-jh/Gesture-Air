import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const signalHighlights = [
  {
    label: 'Sampling rate',
    value: '25 Hz',
    caption: 'Accelerometer + gyroscope',
  },
  {
    label: 'Tracked axes',
    value: '6 DOF',
    caption: 'ax · ay · az · gx · gy · gz',
  },
  {
    label: 'Template slots',
    value: '24',
    caption: 'Keep intents tidy & curated',
  },
];

const quickActions = [
  {
    title: 'Gesture recorder',
    description: 'Capture new exemplars with live signal health.',
    icon: 'activity' as const,
    href: '/gesture',
  },
  {
    title: 'Template hygiene',
    description: 'Review intra-gesture distance before deploying.',
    icon: 'layers' as const,
    href: '/gesture',
  },
];

const playbook = [
  {
    title: 'Calibrate motion baseline',
    copy:
      'Start with a neutral hold and collect three idle seconds. It removes bias before gesture capture.',
  },
  {
    title: 'Record intentional motion',
    copy:
      'Aim for 2–3 seconds of expressive movement. Pause between repetitions so DTW windows stay clean.',
  },
  {
    title: 'Tag with the automation intent',
    copy:
      'Keep labels human-friendly (e.g. maps, studio lights). These map directly to your deep links.',
  },
];

const rolloutTimeline = [
  {
    title: 'Prototype',
    detail: 'Validate motion shapes and comfort with 2–3 teammates.',
  },
  {
    title: 'Stabilize',
    detail: 'Grow exemplars, export JSON backups, fine‑tune adaptive thresholds.',
  },
  {
    title: 'Launch',
    detail: 'Map gestures to intents (apps, automations, workflows) and share with the team.',
  },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const accent = Colors[colorScheme].tint;
  const surfaces = colorScheme === 'dark'
    ? { background: '#01060F', card: '#0B1221', border: '#1F2A40', muted: '#8A9CB4' }
    : { background: '#F7F9FD', card: '#FFFFFF', border: '#E2E8F0', muted: '#5F6C86' };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#91B8FF', dark: '#03122A' }}
      headerImage={
        <View style={styles.headerContainer}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.headerLogo}
            contentFit="contain"
          />
          <Text style={styles.headerTagline}>gesture-first control</Text>
        </View>
      }
    >
      <ThemedView style={[styles.page, { backgroundColor: surfaces.background }]}>
        <View style={[styles.heroCard, { backgroundColor: surfaces.card }]}> 
          <View style={styles.heroTextBlock}>
            <ThemedText type="title">gesAir Launcher</ThemedText>
            <ThemedText style={[styles.heroSubtitle, { color: surfaces.muted }]}>
              Build a library of motion intents, export them as JSON, and bind them to the apps that matter.
            </ThemedText>
          </View>
          <View style={styles.heroActions}>
            {quickActions.map((action) => (
              <Link key={action.title} href={action.href} asChild>
                <Pressable style={[styles.heroAction, { backgroundColor: accent }]}>
                  <Feather name={action.icon} size={18} color="#F8FAFF" />
                  <Text style={styles.heroActionText}>{action.title}</Text>
                </Pressable>
              </Link>
            ))}
          </View>
          <View style={styles.signalGrid}>
            {signalHighlights.map((item) => (
              <View key={item.label} style={[styles.signalCard, { borderColor: surfaces.border }]}>
                <Text style={styles.signalValue}>{item.value}</Text>
                <Text style={[styles.signalLabel, { color: surfaces.muted }]}>{item.label}</Text>
                <Text style={[styles.signalCaption, { color: surfaces.muted }]}>{item.caption}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { borderColor: surfaces.border, backgroundColor: surfaces.card }]}>
          <ThemedText type="subtitle">Capture playbook</ThemedText>
          <View style={styles.playbookList}>
            {playbook.map((item) => (
              <View key={item.title} style={[styles.playbookItem, { borderColor: surfaces.border }]}>
                <ThemedText style={styles.playbookTitle}>{item.title}</ThemedText>
                <ThemedText style={[styles.playbookCopy, { color: surfaces.muted }]}>{item.copy}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { borderColor: surfaces.border, backgroundColor: surfaces.card }]}>
          <ThemedText type="subtitle">Readiness checklist</ThemedText>
          <View style={styles.checklist}>
            {[
              'Capture 3–5 exemplars for each intent before sharing.',
              'Monitor intra-gesture distance; regenerate if drift grows.',
              'Export your gesture_templates.json before reinstalling.',
            ].map((item) => (
              <View key={item} style={styles.checklistRow}>
                <Feather name="check-circle" size={18} color={accent} />
                <ThemedText style={[styles.checklistCopy, { color: surfaces.muted }]}>{item}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { borderColor: surfaces.border, backgroundColor: surfaces.card }]}>
          <ThemedText type="subtitle">Rollout timeline</ThemedText>
          <View style={styles.timeline}>
            {rolloutTimeline.map((item, index) => (
              <View key={item.title} style={styles.timelineRow}>
                <View style={styles.timelineMarkerWrapper}>
                  <View style={[styles.timelineMarker, { borderColor: accent }]} />
                  {index !== rolloutTimeline.length - 1 && (
                    <View style={[styles.timelineConnector, { borderColor: surfaces.border }]} />
                  )}
                </View>
                <View style={styles.timelineCopy}>
                  <ThemedText style={styles.timelineTitle}>{item.title}</ThemedText>
                  <ThemedText style={[styles.timelineDetail, { color: surfaces.muted }]}>{item.detail}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 120,
    height: 120,
    opacity: 0.85,
  },
  headerTagline: {
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 6,
    fontSize: 12,
    color: '#F8FAFF',
  },
  page: {
    flex: 1,
    gap: 18,
  },
  heroCard: {
    padding: 24,
    borderRadius: 28,
    gap: 24,
  },
  heroTextBlock: {
    gap: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  heroActionText: {
    color: '#F8FAFF',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  signalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  signalCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  signalValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  signalLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signalCaption: {
    marginTop: 4,
    fontSize: 13,
  },
  sectionCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  playbookList: {
    gap: 14,
  },
  playbookItem: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  playbookTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  playbookCopy: {
    fontSize: 15,
    lineHeight: 22,
  },
  checklist: {
    gap: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checklistCopy: {
    flex: 1,
    fontSize: 15,
  },
  timeline: {
    gap: 18,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 16,
  },
  timelineMarkerWrapper: {
    alignItems: 'center',
  },
  timelineMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  timelineConnector: {
    width: 1,
    flex: 1,
    borderLeftWidth: 1,
    marginTop: 4,
  },
  timelineCopy: {
    flex: 1,
    gap: 4,
  },
  timelineTitle: {
    fontWeight: '600',
    fontSize: 17,
  },
  timelineDetail: {
    fontSize: 15,
    lineHeight: 22,
  },
});
