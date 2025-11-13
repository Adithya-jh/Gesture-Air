import { Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const frameworks = [
  {
    title: 'Gesture health',
    description:
      'Track intra-gesture distance and sample count for every label. Stay ahead of drift before it ships.',
    icon: 'activity' as const,
  },
  {
    title: 'Action routing',
    description:
      'Map friendly gesture labels to deeplinks, automations, or scripts. Keep the naming human readable.',
    icon: 'aperture' as const,
  },
  {
    title: 'Distribution kit',
    description:
      'Export JSON, commit it, or share via AirDrop. Re-import on any device to keep the launcher aligned.',
    icon: 'upload' as const,
  },
];

const experiments = [
  {
    title: 'Adaptive thresholds',
    detail: 'Scale DTW acceptance based on per-label variance so confident gestures fire instantly.',
  },
  {
    title: 'Session macros',
    detail: 'String multiple intents (e.g. lights + playlist) to feel the magic of mid-air automation.',
  },
  {
    title: 'Handoff-ready exports',
    detail: 'Bundle JSON with a README so teammates can import, rehearse, and stay consistent.',
  },
];

const resourceLinks = [
  {
    title: 'Gesture recorder',
    href: '/gesture',
    icon: 'cpu' as const,
    caption: 'Live capture, labeling, importing',
  },
  {
    title: 'Project README',
    href: '/modal',
    icon: 'book-open' as const,
    caption: 'Context, scripts, reset instructions',
  },
];

export default function ExploreScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const accent = Colors[colorScheme].tint;
  const palette = colorScheme === 'dark'
    ? { background: '#050B18', card: '#0A1323', border: '#1F2A40', muted: '#7E8DA8' }
    : { background: '#F5F7FB', card: '#FFFFFF', border: '#E2E8F0', muted: '#5B6478' };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: palette.background }]}> 
      <View style={[styles.hero, { backgroundColor: palette.card }]}> 
        <ThemedText type="title">Explore the stack</ThemedText>
        <ThemedText style={[styles.heroCopy, { color: palette.muted }]}>
          Dial in a clean workflow for capturing, labeling, and sharing gestures with your team. Each
          section below highlights a pillar of the experience.
        </ThemedText>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/gesture" asChild>
            <Pressable style={[styles.primaryButton, { backgroundColor: accent }]}> 
              <Feather name="play-circle" color="#F8FAFF" size={18} />
              <Text style={styles.primaryButtonText}>Open recorder</Text>
            </Pressable>
          </Link>
          <Link href="/float" asChild>
            <Pressable style={[styles.secondaryButton, { borderColor: accent }]}> 
              <Feather name="grid" color={accent} size={18} />
              <Text style={[styles.secondaryButtonText, { color: accent }]}>Float between apps</Text>
            </Pressable>
          </Link>
          <Link href="/optimize" asChild>
            <Pressable style={[styles.secondaryButton, { borderColor: accent }]}> 
              <Feather name="cpu" color={accent} size={18} />
              <Text style={[styles.secondaryButtonText, { color: accent }]}>Optimize</Text>
            </Pressable>
          </Link>
        </View>

        <View style={[styles.optimizeCard, { borderColor: palette.border, backgroundColor: palette.card }]}> 
          <ThemedText type="subtitle">Optimize background usage</ThemedText>
          <ThemedText style={[styles.optimizeCopy, { color: palette.muted }]}>See which apps stay active in the background and get notified when it is time to close them.</ThemedText>
          <Link href="/optimize" asChild>
            <Pressable style={[styles.primaryButton, { backgroundColor: accent, alignSelf: 'flex-start' }]}> 
              <Feather name="activity" color="#F8FAFF" size={18} />
              <Text style={styles.primaryButtonText}>Open optimize</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.section}>
        {frameworks.map((framework) => (
          <View key={framework.title} style={[styles.card, { borderColor: palette.border, backgroundColor: palette.card }]}> 
            <View style={styles.cardHeader}>
              <View style={[styles.iconBadge, { backgroundColor: `${accent}20` }]}> 
                <Feather name={framework.icon} size={16} color={accent} />
              </View>
              <ThemedText style={styles.cardTitle}>{framework.title}</ThemedText>
            </View>
            <ThemedText style={[styles.cardCopy, { color: palette.muted }]}>{framework.description}</ThemedText>
          </View>
        ))}
      </View>

      <View style={[styles.section, { gap: 16 }]}>
        <ThemedText type="subtitle">Experiments to run</ThemedText>
        {experiments.map((experiment) => (
          <View key={experiment.title} style={[styles.timelineCard, { borderColor: palette.border, backgroundColor: palette.card }]}> 
            <ThemedText style={styles.timelineTitle}>{experiment.title}</ThemedText>
            <ThemedText style={[styles.timelineCopy, { color: palette.muted }]}>{experiment.detail}</ThemedText>
          </View>
        ))}
      </View>

      <View style={[styles.section, { gap: 16 }]}>
        <ThemedText type="subtitle">Resources</ThemedText>
        {resourceLinks.map((resource) => (
          <Link key={resource.title} href={resource.href} asChild>
            <Pressable style={[styles.resourceRow, { borderColor: palette.border, backgroundColor: palette.card }]}> 
              <View>
                <Text style={styles.resourceTitle}>{resource.title}</Text>
                <Text style={[styles.resourceCaption, { color: palette.muted }]}>{resource.caption}</Text>
              </View>
              <Feather name="arrow-up-right" size={18} color={accent} />
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 24,
    gap: 20,
  },
  hero: {
    borderRadius: 24,
    padding: 24,
    gap: 14,
  },
  heroCopy: {
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: '#F8FAFF',
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  card: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cardCopy: {
    fontSize: 15,
    lineHeight: 22,
  },
  timelineCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  timelineTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  timelineCopy: {
    fontSize: 15,
    lineHeight: 22,
  },
  resourceRow: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  resourceCaption: {
    fontSize: 14,
  },
  optimizeCard: {
    marginTop: 12,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  optimizeCopy: {
    fontSize: 14,
    lineHeight: 22,
  },
});
