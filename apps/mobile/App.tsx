import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

type FilterTab = 'All' | 'Unwatched' | 'Favorites';

const FILTER_TABS: FilterTab[] = ['All', 'Unwatched', 'Favorites'];

const WORKFLOW_STEPS = [
  {
    step: '1',
    title: 'Scan or enter the barcode',
    detail: 'Quick-match physical packaging via UPC/EAN.',
    tag: 'Intake',
  },
  {
    step: '2',
    title: 'Enrich live movie metadata',
    detail: 'Pull title, original title, release year, and synopsis.',
    tag: 'Metadata',
  },
  {
    step: '3',
    title: 'Capture front & back cover art',
    detail: 'Store high-res edition artwork directly in your catalog.',
    tag: 'Covers',
  },
  {
    step: '4',
    title: 'Tag physical edition & packaging',
    detail: 'Record format, region, Steelbook/Slipcover, and shelf.',
    tag: 'Edition',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<FilterTab>('All');

  const filterSummary: Record<FilterTab, string> = {
    All: 'Showing complete catalog intake workflow and edition tools.',
    Unwatched: 'Focus on physical editions waiting on your watchlist.',
    Favorites: 'Quick access to your starred favorite physical editions.',
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Film Collection
          </Text>
          <Text style={styles.subtitle}>
            Physical media catalog &amp; barcode intake
          </Text>
        </View>

        <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Catalog filter">
          {FILTER_TABS.map((tab) => {
            const selected = activeTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveTab(tab)}
                style={({ pressed }) => [
                  styles.pill,
                  selected && styles.pillSelected,
                  pressed && styles.pillPressed,
                ]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>{activeTab} view</Text>
          <Text style={styles.bannerBody}>{filterSummary[activeTab]}</Text>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          Intake workflow
        </Text>

        <View style={styles.cardList}>
          {WORKFLOW_STEPS.map((item) => (
            <View key={item.step} style={styles.glassCard} accessible>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{item.step}</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.tagText}>{item.tag}</Text>
                </View>
                <Text style={styles.cardDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0c1628',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    gap: 18,
  },
  header: {
    gap: 4,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#edf4ff',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(237, 244, 255, 0.72)',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(138, 180, 255, 0.28)',
    backgroundColor: 'rgba(18, 28, 46, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pillSelected: {
    backgroundColor: 'rgba(138, 180, 255, 0.18)',
    borderColor: '#8ab4ff',
  },
  pillPressed: {
    opacity: 0.8,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(237, 244, 255, 0.78)',
  },
  pillTextSelected: {
    color: '#8ab4ff',
    fontWeight: '700',
  },
  bannerCard: {
    backgroundColor: 'rgba(18, 28, 46, 0.9)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(138, 180, 255, 0.2)',
    gap: 4,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8ab4ff',
  },
  bannerBody: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(237, 244, 255, 0.82)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#edf4ff',
    marginTop: 4,
  },
  cardList: {
    gap: 12,
  },
  glassCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: 'rgba(18, 28, 46, 0.9)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(138, 180, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#8ab4ff',
    fontWeight: '800',
    fontSize: 15,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#edf4ff',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8ab4ff',
    backgroundColor: 'rgba(138, 180, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardDetail: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(237, 244, 255, 0.72)',
  },
});
